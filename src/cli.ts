#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ConfigError } from "./errors.js";
import { parseOnly } from "./load-suite.js";
import { startMcpServer } from "./mcp/server.js";
import { runSuite } from "./orchestrator.js";

const DEFAULT_OUTPUT = "output";

async function main(argv: string[]): Promise<number> {
  const cmd = argv[2] || "help";
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return 0;
  }
  if (cmd === "init") return cmdInit(argv[3] || ".");
  if (cmd === "run") return cmdRun(argv.slice(3));
  if (cmd === "report") return cmdReport(argv.slice(3));
  if (cmd === "mcp") {
    await startMcpServer();
    return 0;
  }
  printHelp();
  return 2;
}

function printHelp(): void {
  console.log(`GoLiveCheck — scoped testing agent

Usage:
  golivecheck init [dir]
  golivecheck run [--config path] [--only e2e,api,a11y,security] [--output dir] [--target url] [--allow host,host]
  golivecheck report [--output dir]
  golivecheck mcp

Only scan systems you own. Security checks are read-only.
`);
}

function cmdInit(dir: string): number {
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "golivecheck.config.yaml");
  if (existsSync(dest)) {
    console.error(`Already exists: ${dest}`);
    return 2;
  }
  writeFileSync(
    dest,
    `name: my-suite
target: http://127.0.0.1:4173
allow:
  - 127.0.0.1
budget:
  maxMinutes: 8
  maxLlmCalls: 15
jobs:
  - type: security
    name: baseline
    url: /
  - type: a11y
    name: home
    url: /
    tags: [wcag2aa]
  - type: api
    name: health
    requests:
      - { method: GET, path: /, expectStatus: 200 }
`,
  );
  console.log(`Wrote ${dest}`);
  return 0;
}

async function cmdRun(args: string[]): Promise<number> {
  const flags = parseFlags(args);
  const configPath = resolveConfig(flags.config);
  const outputDir = flags.output || DEFAULT_OUTPUT;
  try {
    const { report, exitCode, paths } = await runSuite({
      configPath,
      outputDir,
      only: parseOnly(flags.only),
      targetOverride: flags.target,
      allowOverride: flags.allow ? flags.allow.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    });
    console.log(`Report: ${paths.html}`);
    if (report.aborted) console.error(`${report.aborted.code}: ${report.aborted.message}`);
    for (const job of report.results) {
      console.log(`${job.status.padEnd(7)} ${job.type}/${job.name}`);
    }
    return exitCode;
  } catch (err) {
    const code = err instanceof ConfigError ? err.exitCode : 2;
    console.error((err as Error).message);
    return code;
  }
}

function cmdReport(args: string[]): number {
  const flags = parseFlags(args);
  const outputDir = flags.output || DEFAULT_OUTPUT;
  const jsonPath = path.join(outputDir, "report.json");
  const htmlPath = path.join(outputDir, "report.html");
  if (!existsSync(jsonPath)) {
    console.error("No report yet. Run: golivecheck run");
    return 2;
  }
  const report = JSON.parse(readFileSync(jsonPath, "utf8")) as { results?: { status: string; type: string; name: string }[] };
  console.log(htmlPath);
  for (const job of report.results || []) {
    console.log(`${job.status.padEnd(7)} ${job.type}/${job.name}`);
  }
  return 0;
}

function resolveConfig(explicit?: string): string {
  if (explicit) return explicit;
  for (const candidate of ["golivecheck.config.yaml", "golivecheck.yaml", "examples/suites/shop.yaml"]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new ConfigError("No suite file found. Pass --config or run golivecheck init");
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--config" || a === "--only" || a === "--output" || a === "--target" || a === "--allow") {
      out[a.slice(2)] = args[++i] || "";
    }
  }
  return out;
}

main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
