import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDemoShop } from "../examples/demo-site/server.mjs";
import { runSuite } from "../src/orchestrator.js";
import { emitPlaywrightSpec, loadReplay, writeReplay } from "../src/replay.js";

describe("replay", () => {
  const previousKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });

  it("emits a Playwright spec from saved actions", () => {
    const spec = emitPlaywrightSpec({
      job: "buy-one-item",
      startUrl: "/",
      assert: ["The cart is not empty"],
      actions: [
        { op: "click", selector: ".product-link" },
        { op: "click", selector: "#add-to-cart" },
      ],
    });
    expect(spec).toContain('test("buy-one-item"');
    expect(spec).toContain('page.locator(".product-link")');
    expect(spec).toContain("#cart-items li");
  });

  it("writes replay JSON and spec after a successful demo E2E", async () => {
    process.env.OPENAI_API_KEY = "";
    const shop = await startDemoShop(0);
    const dir = mkdtempSync(path.join(tmpdir(), "glc-replay-save-"));
    const suitePath = path.join(dir, "suite.yaml");
    writeFileSync(
      suitePath,
      `name: demo-shop
target: ${shop.url}
allow:
  - 127.0.0.1
jobs:
  - type: e2e
    name: buy-one-item
    startUrl: /
    steps: [Open the first product, Add it to the cart]
    assert: [The cart is not empty]
`,
    );
    try {
      const outputDir = path.join(dir, "output");
      const { exitCode } = await runSuite({ configPath: suitePath, outputDir });
      expect(exitCode).toBe(0);
      const jsonPath = path.join(outputDir, "replay", "buy-one-item.json");
      const specPath = path.join(outputDir, "replay", "buy-one-item.spec.ts");
      expect(existsSync(jsonPath)).toBe(true);
      expect(existsSync(specPath)).toBe(true);
      const replay = JSON.parse(readFileSync(jsonPath, "utf8")) as { actions: { op: string }[] };
      expect(replay.actions.some((a) => a.op === "click")).toBe(true);
    } finally {
      await shop.close();
    }
  });

  it("replays a saved flow without an LLM key", async () => {
    process.env.OPENAI_API_KEY = "";
    const shop = await startDemoShop(0);
    const dir = mkdtempSync(path.join(tmpdir(), "glc-replay-run-"));
    const outputDir = path.join(dir, "output");
    writeReplay(outputDir, "add-from-replay", "/", ["The cart is not empty"], [
      { op: "click", selector: ".product-link" },
      { op: "click", selector: "#add-to-cart" },
    ]);
    expect(loadReplay(outputDir, "add-from-replay")?.actions).toHaveLength(2);
    const suitePath = path.join(dir, "suite.yaml");
    writeFileSync(
      suitePath,
      `name: replayed
target: ${shop.url}
allow:
  - 127.0.0.1
jobs:
  - type: e2e
    name: add-from-replay
    startUrl: /
    steps: [Open the first product, Add it to the cart]
    assert: [The cart is not empty]
`,
    );
    try {
      const { report, exitCode } = await runSuite({ configPath: suitePath, outputDir });
      expect(exitCode).toBe(0);
      expect(report.results[0]?.status).toBe("passed");
      expect(report.results[0]?.findings.some((f) => f.check === "replay")).toBe(true);
    } finally {
      await shop.close();
    }
  });
});
