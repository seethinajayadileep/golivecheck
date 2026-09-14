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
});
