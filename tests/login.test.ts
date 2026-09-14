import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startDemoShop } from "../examples/demo-site/server.mjs";
import { parseScriptableSteps } from "../src/plugins/e2e-script.js";
import { runSuite } from "../src/orchestrator.js";

describe("scriptable e2e login", () => {
  const previous = {
    key: process.env.OPENAI_API_KEY,
    target: process.env.GOLIVECHECK_TARGET,
    user: process.env.GOLIVECHECK_USER,
    password: process.env.GOLIVECHECK_PASSWORD,
  };

  afterEach(() => {
    restore("OPENAI_API_KEY", previous.key);
    restore("GOLIVECHECK_TARGET", previous.target);
    restore("GOLIVECHECK_USER", previous.user);
    restore("GOLIVECHECK_PASSWORD", previous.password);
  });

  it("parses Fill/Click/Open/Wait/Press steps", () => {
    expect(
      parseScriptableSteps([
        "Fill #email with shopper",
        "Click #login-submit",
        "Open /login",
        "Wait 200 ms",
        "Press Enter",
      ]),
    ).toEqual([
      { op: "fill", selector: "#email", value: "shopper" },
      { op: "click", selector: "#login-submit" },
      { op: "open", url: "/login" },
      { op: "wait", ms: 200 },
      { op: "press", key: "Enter" },
    ]);
    expect(parseScriptableSteps(["Open the first product"])).toBeNull();
  });

  it("signs in with GOLIVECHECK_USER / GOLIVECHECK_PASSWORD and no LLM key", async () => {
    process.env.OPENAI_API_KEY = "";
    const shop = await startDemoShop(0);
    process.env.GOLIVECHECK_TARGET = shop.url;
    process.env.GOLIVECHECK_USER = "shopper@example.com";
    process.env.GOLIVECHECK_PASSWORD = "pass123";
    const dir = mkdtempSync(path.join(tmpdir(), "glc-login-"));
    const suitePath = path.join(dir, "suite.yaml");
    writeFileSync(
      suitePath,
      `name: demo-login
target: \${GOLIVECHECK_TARGET}
allow:
  - 127.0.0.1
jobs:
  - type: e2e
    name: sign-in
    startUrl: /login
    steps:
      - "Fill #email with \${GOLIVECHECK_USER}"
      - "Fill #password with \${GOLIVECHECK_PASSWORD}"
      - "Click #login-submit"
    assert:
      - The page contains Signed in
`,
    );
    try {
      const { report, exitCode } = await runSuite({
        configPath: suitePath,
        outputDir: path.join(dir, "output"),
      });
      expect(exitCode).toBe(0);
      expect(report.results[0]?.status).toBe("passed");
    } finally {
      await shop.close();
    }
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
