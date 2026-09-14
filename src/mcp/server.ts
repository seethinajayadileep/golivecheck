import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ConfigError } from "../errors.js";
import { parseOnly } from "../load-suite.js";
import { runSuite } from "../orchestrator.js";
import type { FindingSeverity, RunReport } from "../types.js";

type JsonRpc = { jsonrpc: "2.0"; id?: number | string | null; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown };

/**
 * Serves GoLiveCheck tools over MCP stdio until stdin closes and in-flight
 * messages finish writing their replies.
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
  const chunks: Buffer[] = [];
  let activeDrain: Promise<void> | undefined;

  process.stdin.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    activeDrain ??= drain();
  });

  /**
   * Processes stdin chunks in order so concurrent `run_suite` calls cannot
   * overwrite the same output directory.
   */
  async function drain(): Promise<void> {
    try {
      while (chunks.length) {
        buffer = Buffer.concat([buffer, chunks.shift()!]);
        while (true) {
          const extracted = extractMessage();
          if (!extracted) break;
          let parsed: unknown;
          try {
            parsed = JSON.parse(extracted);
          } catch (err) {
            writeMessage(
              JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: (err as Error).message || "Parse error" },
              }),
            );
            continue;
          }
          const request = asJsonRpc(parsed);
          if (!request) {
            writeMessage(
              JSON.stringify({
                jsonrpc: "2.0",
                id: jsonRpcId(parsed),
                error: { code: -32600, message: "Invalid Request" },
              }),
            );
            continue;
          }
          const notify = request.id === undefined;
          try {
            const reply = await handle(request);
            if (reply && !notify) writeMessage(JSON.stringify(reply));
          } catch (err) {
            if (notify) continue;
            writeMessage(
              JSON.stringify({
                jsonrpc: "2.0",
                id: request.id,
                error: { code: -32603, message: (err as Error).message || "Internal error" },
              }),
            );
          }
        }
      }
    } finally {
      if (chunks.length) {
        await drain();
      } else {
        activeDrain = undefined;
      }
    }
  }

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
    const finish = () => resolve();
    process.stdin.on("end", finish);
    process.stdin.on("close", finish);
  });
  if (activeDrain) await activeDrain;
}

/**
 * Accepts a JSON-RPC 2.0 request or notification matching {@link JsonRpc}.
 *
 * @param value - Parsed JSON.
 */
function asJsonRpc(value: unknown): JsonRpc | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (rec.jsonrpc !== "2.0") return null;
  if (typeof rec.method !== "string" || !rec.method) return null;
  if (rec.id !== undefined && rec.id !== null && typeof rec.id !== "string" && typeof rec.id !== "number") {
    return null;
  }
  if (rec.params !== undefined && (typeof rec.params !== "object" || rec.params === null || Array.isArray(rec.params))) {
    return null;
  }
  return value as JsonRpc;
}

/**
 * Reads a JSON-RPC id from unknown JSON when the envelope itself is invalid.
 *
 * @param value - Parsed JSON.
 */
function jsonRpcId(value: unknown): JsonRpc["id"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as { id?: unknown }).id;
  if (id === null || typeof id === "string" || typeof id === "number") return id;
  return null;
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
