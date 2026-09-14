import { describe, expect, it } from "vitest";
import { Scope } from "../src/scope.js";
import { ScopeViolationError } from "../src/errors.js";

describe("scope", () => {
  it("rejects https://evil.com when allowlist is demo", () => {
    const scope = new Scope(["127.0.0.1"]);
    expect(() => scope.assert("https://evil.com/")).toThrow(ScopeViolationError);
    expect(() => scope.assert("https://evil.com/")).toThrow(/SCOPE_VIOLATION/);
    expect(() => scope.assert("http://127.0.0.1:4173/")).not.toThrow();
  });
});
