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

  it("flags CORS that reflects the probe origin with credentials", async () => {
    const fixture = await startFixture((_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Access-Control-Allow-Origin", "https://untrusted.example");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.end("<html><body>ok</body></html>");
    });
    try {
      const result = await runSecurity(
        { type: "security", name: "cors", url: "/" },
        fixture.url,
        new Scope(["127.0.0.1"]),
      );
      expect(result.findings.some((f) => f.check === "cors")).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it("flags X-Frame-Options ALLOWALL", async () => {
    const fixture = await startFixture((_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "ALLOWALL");
      res.end("<html><body>ok</body></html>");
    });
    try {
      const result = await runSecurity(
        { type: "security", name: "xfo", url: "/" },
        fixture.url,
        new Scope(["127.0.0.1"]),
      );
      expect(result.findings.some((f) => f.check === "clickjacking")).toBe(true);
    } finally {
      await fixture.close();
    }
  });
});
