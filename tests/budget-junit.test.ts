import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Budget } from "../src/budget.js";
import { BudgetExceededError } from "../src/errors.js";
import { writeReports } from "../src/report/writer.js";
import type { RunReport } from "../src/types.js";

describe("budget", () => {
  it("stops after maxLlmCalls", () => {
    const budget = new Budget({ maxLlmCalls: 1 });
    budget.recordLlmCall();
    expect(() => budget.recordLlmCall()).toThrow(BudgetExceededError);
  });
});

describe("junit", () => {
  it("writes four testcases", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "glc-"));
    const report: RunReport = {
      suite: "demo-shop",
      target: "http://127.0.0.1:4173",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      results: [
        { name: "buy-one-item", type: "e2e", status: "passed", findings: [], durationMs: 1, screenshots: [] },
        { name: "products-api", type: "api", status: "passed", findings: [], durationMs: 1, screenshots: [] },
        { name: "home", type: "a11y", status: "passed", findings: [], durationMs: 1, screenshots: [] },
        { name: "baseline", type: "security", status: "passed", findings: [], durationMs: 1, screenshots: [] },
      ],
    };
    const paths = writeReports(report, dir);
    const xml = readFileSync(paths.junit, "utf8");
    expect(xml).toContain('name="buy-one-item"');
    expect(xml).toContain('name="products-api"');
    expect(xml).toContain('name="home"');
    expect(xml).toContain('name="baseline"');
    expect(xml.match(/<testcase /g)?.length).toBe(4);
  });

  it("adds an abort testcase with an error element", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "glc-abort-"));
    const report: RunReport = {
      suite: "demo-shop",
      target: "http://127.0.0.1:4173",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      aborted: { code: "SCOPE_VIOLATION", message: "SCOPE_VIOLATION: https://evil.com/ is not on the allowlist (127.0.0.1)" },
      results: [
        { name: "baseline", type: "security", status: "passed", findings: [], durationMs: 1, screenshots: [] },
      ],
    };
    const xml = readFileSync(writeReports(report, dir).junit, "utf8");
    expect(xml).toContain('name="aborted"');
    expect(xml).toContain("<error");
    expect(xml).toContain("SCOPE_VIOLATION");
    expect(xml).toContain('tests="2"');
    expect(xml).toContain('errors="1"');
  });
});
