import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ConfigError } from "../errors.js";
import { parseOnly } from "../load-suite.js";
import { runSuite } from "../orchestrator.js";
import type { FindingSeverity, RunReport } from "../types.js";

type JsonRpc = { jsonrpc: "2.0"; id?: number | string | null; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown };

/**
 * Serves GoLiveCheck tools over MCP stdio until stdin closes.
 *
 * Parse and tool failures become JSON-RPC errors; the listener stays alive.
 */
export async function startMcpServer(): Promise<void> {
  const tools = [
    {
      name: "run_suite",
      description: "Run a GoLiveCheck suite against a site you own.",
      inputSchema: {
        type: "object",
        properties: {
          target: { type: "string" },
          allow: { type: "string", description: "Comma-separated allowlist hosts" },
          suitePath: { type: "string" },
          types: { type: "string", description: "Comma list: e2e,api,a11y,security" },
        },
        required: ["target", "allow"],
      },
    },
    {
      name: "get_last_report",
      description: "Return the last GoLiveCheck report summary and file paths.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_findings",
      description: "List findings from the last report.",
      inputSchema: {
        type: "object",
        properties: { severity: { type: "string", description: "fail, warn, or info" } },
      },
    },
  ];

  /**
   * Handles one JSON-RPC message.
   *
   * @param msg - Parsed request.
   * @returns A response, or null for notifications.
   */
  async function handle(msg: JsonRpc): Promise<JsonRpc | null> {
    if (!msg.method) return null;
    if (msg.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "golivecheck", version: "0.0.1" },
        },
      };
    }
    if (msg.method === "notifications/initialized") return null;
    if (msg.method === "tools/list") {
      return { jsonrpc: "2.0", id: msg.id, result: { tools } };
    }
    if (msg.method === "tools/call") {
      const name = String(msg.params?.name || "");
      const args = (msg.params?.arguments || {}) as Record<string, unknown>;
      const text = await callTool(name, args);
      return { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text }] } };
    }
    return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}` } };
  }

  process.stdin.resume();
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", async (chunk: Buffer | string) => {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    while (true) {
      const extracted = extractMessage();
      if (!extracted) break;
      let id: JsonRpc["id"] = null;
      try {
        const parsed = JSON.parse(extracted) as JsonRpc;
        id = parsed.id ?? null;
        const reply = await handle(parsed);
        if (reply) writeMessage(JSON.stringify(reply));
      } catch (err) {
        writeMessage(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: (err as Error).message || "Internal error" },
          }),
        );
      }
    }
  });

  /**
   * Splits one newline-delimited JSON object or Content-Length framed body.
   *
   * Framing uses byte offsets so multi-byte UTF-8 payloads stay intact.
   *
   * @returns The next message body, or null when incomplete.
   */
  function extractMessage(): string | null {
    if (buffer[0] === 0x7b) {
      const nl = buffer.indexOf(0x0a);
      if (nl === -1) return null;
      const line = buffer.subarray(0, nl).toString("utf8").trim();
      buffer = buffer.subarray(nl + 1);
      return line || null;
    }
    const headerEnd = indexOfCrlfCrlf(buffer);
    if (headerEnd === -1) return null;
    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4);
      return null;
    }
    const len = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + len) return null;
    const body = buffer.subarray(start, start + len).toString("utf8");
    buffer = buffer.subarray(start + len);
    return body;
  }

  await new Promise<void>((resolve) => {
    process.stdin.on("end", resolve);
    process.stdin.on("close", resolve);
  });
}

/**
 * Finds the first `\r\n\r\n` byte sequence in a buffer.
 *
 * @param buf - Incoming stdin bytes.
 */
function indexOfCrlfCrlf(buf: Buffer): number {
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a && buf[i + 2] === 0x0d && buf[i + 3] === 0x0a) return i;
  }
  return -1;
}

/**
 * Writes one Content-Length framed JSON-RPC message to stdout.
 *
 * @param body - Serialized JSON.
 */
function writeMessage(body: string): void {
  const payload = Buffer.from(body, "utf8");
  process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  process.stdout.write(payload);
}

/**
 * Dispatches an MCP tool name to suite run or report readers.
 *
 * @param name - Tool name.
 * @param args - Tool arguments.
 */
async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const outputDir = "output";
  if (name === "run_suite") {
    const target = String(args.target || "").trim();
    const allowRaw = String(args.allow || "").trim();
    if (!target || !allowRaw) {
      throw new ConfigError("run_suite requires target and allow");
    }
    const suitePath = String(args.suitePath || defaultSuite());
    const { report, paths } = await runSuite({
      configPath: suitePath,
      outputDir,
      only: parseOnly(args.types ? String(args.types) : undefined),
      targetOverride: target,
      allowOverride: allowRaw.split(",").map((s) => s.trim()).filter(Boolean),
    });
    return JSON.stringify({ suite: report.suite, exitAborted: Boolean(report.aborted), paths, results: report.results.map((r) => ({ type: r.type, name: r.name, status: r.status })) }, null, 2);
  }
  if (name === "get_last_report") {
    const jsonPath = path.join(outputDir, "report.json");
    if (!existsSync(jsonPath)) return "No report yet.";
    const report = JSON.parse(readFileSync(jsonPath, "utf8")) as RunReport;
    return JSON.stringify({
      suite: report.suite,
      target: report.target,
      html: path.join(outputDir, "report.html"),
      json: jsonPath,
      results: report.results.map((r) => ({ type: r.type, name: r.name, status: r.status })),
    }, null, 2);
  }
  if (name === "list_findings") {
    const jsonPath = path.join(outputDir, "report.json");
    if (!existsSync(jsonPath)) return "No report yet.";
    const report = JSON.parse(readFileSync(jsonPath, "utf8")) as RunReport;
    const severity = args.severity ? String(args.severity) : undefined;
    const findings = report.results.flatMap((r) =>
      r.findings
        .filter((f) => !severity || f.severity === (severity as FindingSeverity))
        .map((f) => ({ job: r.name, type: r.type, ...f })),
    );
    return JSON.stringify(findings, null, 2);
  }
  return `Unknown tool ${name}`;
}

/**
 * First existing default suite path for MCP `run_suite`.
 *
 * @returns A suite YAML path.
 */
function defaultSuite(): string {
  for (const c of ["golivecheck.config.yaml", "golivecheck.yaml", "examples/suites/shop.yaml"]) {
    if (existsSync(c)) return c;
  }
  return "examples/suites/shop.yaml";
}
