import { describe, expect, it } from "vitest";
import { scopedFetch } from "../src/http.js";
import { Scope } from "../src/scope.js";
import { startFixture } from "./helpers.js";

describe("http", () => {
  it("stops after too many redirects", async () => {
    const fixture = await startFixture((_req, res) => {
      res.statusCode = 302;
      res.setHeader("Location", "/loop");
      res.end();
    });
    try {
      await expect(scopedFetch(`${fixture.url}/loop`, new Scope(["127.0.0.1"]))).rejects.toThrow(/Too many redirects/);
    } finally {
      await fixture.close();
    }
  });

  it("keeps redirect mode manual even when init asks for follow", async () => {
    let hops = 0;
    const fixture = await startFixture((req, res) => {
      hops += 1;
      if ((req.url || "").includes("next")) {
        res.statusCode = 200;
        res.end("ok");
        return;
      }
      res.statusCode = 302;
      res.setHeader("Location", "/next");
      res.end();
    });
    try {
      const res = await scopedFetch(fixture.url, new Scope(["127.0.0.1"]), { redirect: "follow" });
      expect(res.status).toBe(200);
      expect(hops).toBe(2);
    } finally {
      await fixture.close();
    }
  });

  it("passes redirect: \"manual\" to fetch even when init asks for follow", async () => {
    const original = globalThis.fetch;
    let seen: RequestInit | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen = init;
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    try {
      await scopedFetch("http://127.0.0.1/", new Scope(["127.0.0.1"]), { redirect: "follow" });
      expect(seen?.redirect).toBe("manual");
    } finally {
      globalThis.fetch = original;
    }
  });
});
