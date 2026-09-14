import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startDemoShop } from "../examples/demo-site/server.mjs";
import { runSuite } from "../src/orchestrator.js";

describe("orchestrator", () => {
  it("writes JUnit with four testcases from the demo suite", async () => {
    const shop = await startDemoShop(0);
    const dir = mkdtempSync(path.join(tmpdir(), "glc-run-"));
    const suitePath = path.join(dir, "suite.yaml");
    writeFileSync(
      suitePath,
      `name: demo-shop
target: ${shop.url}
allow:
  - 127.0.0.1
budget:
  maxMinutes: 8
  maxLlmCalls: 15
jobs:
  - type: e2e
    name: buy-one-item
    startUrl: /
    steps: [Open the first product, Add it to the cart]
    assert: [The cart is not empty]
  - type: api
    name: products-api
    requests:
      - { method: GET, path: /api/products, expectStatus: 200 }
  - type: a11y
    name: home
    url: /
    tags: [wcag2aa]
  - type: security
    name: baseline
    url: /
`,
    );
    try {
      const { report, paths, exitCode } = await runSuite({
        configPath: suitePath,
        outputDir: path.join(dir, "output"),
      });
      expect(report.results).toHaveLength(4);
      expect(report.results.map((r) => r.type).sort()).toEqual(["a11y", "api", "e2e", "security"]);
      const xml = readFileSync(paths.junit, "utf8");
      expect(xml.match(/<testcase /g)?.length).toBe(4);
      expect(exitCode).toBe(0);
    } finally {
      await shop.close();
    }
  });
});
