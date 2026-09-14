import { describe, expect, it } from "vitest";
import { runSecurity } from "../src/plugins/security.js";
import { Scope } from "../src/scope.js";
import { startFixture } from "./helpers.js";

describe("security", () => {
  it("flags missing X-Content-Type-Options on a fixture", async () => {
    const fixture = await startFixture((_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end("<html><body>ok</body></html>");
    });
    try {
      const result = await runSecurity(
        { type: "security", name: "baseline", url: "/" },
        fixture.url,
        new Scope(["127.0.0.1"]),
      );
      expect(result.status).toBe("failed");
      expect(result.findings.some((f) => f.check === "x-content-type-options")).toBe(true);
    } finally {
      await fixture.close();
    }
  });
});
