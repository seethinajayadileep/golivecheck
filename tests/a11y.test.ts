import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { runA11y } from "../src/plugins/a11y.js";
import { Scope } from "../src/scope.js";
import { startFixture } from "./helpers.js";

describe("a11y", () => {
  it("fails an image with no alt", async () => {
    const fixture = await startFixture((_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        `<!doctype html><html lang="en"><head><title>x</title></head><body><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></body></html>`,
      );
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const result = await runA11y(
        { type: "a11y", name: "img", url: "/", tags: ["wcag2aa"] },
        fixture.url,
        new Scope(["127.0.0.1"]),
        browser,
      );
      expect(result.status).toBe("failed");
      expect(result.findings.some((f) => f.severity === "fail")).toBe(true);
    } finally {
      await browser.close();
      await fixture.close();
    }
  });
});
