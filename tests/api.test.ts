import { describe, expect, it } from "vitest";
import { runApi } from "../src/plugins/api.js";
import { Scope } from "../src/scope.js";
import { startFixture } from "./helpers.js";

describe("api", () => {
  it("fails on 500", async () => {
    const fixture = await startFixture((_req, res) => {
      res.statusCode = 500;
      res.end("nope");
    });
    try {
      const result = await runApi(
        {
          type: "api",
          name: "boom",
          requests: [{ method: "GET", path: "/api/products", expectStatus: 200 }],
        },
        fixture.url,
        new Scope(["127.0.0.1"]),
      );
      expect(result.status).toBe("failed");
      expect(result.findings.some((f) => f.check === "status")).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it("records invalid JSON as a finding instead of throwing", async () => {
    const fixture = await startFixture((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end("not-json");
    });
    try {
      const result = await runApi(
        {
          type: "api",
          name: "bad-json",
          requests: [{ method: "GET", path: "/", expectStatus: 200, jsonPath: "$.ok" }],
        },
        fixture.url,
        new Scope(["127.0.0.1"]),
      );
      expect(result.status).toBe("failed");
      expect(result.findings.some((f) => f.check === "invalid-json")).toBe(true);
    } finally {
      await fixture.close();
    }
  });
});
