import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/errors.js";
import { loadSuite } from "../src/load-suite.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Writes a temporary suite YAML and returns its path.
 *
 * @param body - YAML document text.
 */
function writeSuite(body: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "glc-suite-"));
  const file = path.join(dir, "suite.yaml");
  writeFileSync(file, body);
  return file;
}

describe("load-suite", () => {
  it("rejects non-http targets", () => {
    const file = writeSuite(`name: x
target: file:///tmp
jobs:
  - { type: security, name: a, url: / }
`);
    expect(() => loadSuite(file)).toThrow(ConfigError);
  });

  it("rejects negative budget values", () => {
    const file = writeSuite(`name: x
target: http://127.0.0.1:4173
budget:
  maxLlmCalls: -1
jobs:
  - { type: security, name: a, url: / }
`);
    expect(() => loadSuite(file)).toThrow(/maxLlmCalls/);
  });

  it("rejects non-object API requests", () => {
    const file = writeSuite(`name: x
target: http://127.0.0.1:4173
jobs:
  - type: api
    name: a
    requests: [null]
`);
    expect(() => loadSuite(file)).toThrow(ConfigError);
  });

  it("rejects unsupported E2E assertions", () => {
    const file = writeSuite(`name: x
target: http://127.0.0.1:4173
jobs:
  - type: e2e
    name: buy-one-item
    startUrl: /
    steps: [x]
    assert: [something vague]
`);
    expect(() => loadSuite(file)).toThrow(/Unsupported E2E assertion/);
  });

  it("accepts page-contains E2E assertions", () => {
    const file = writeSuite(`name: x
target: http://127.0.0.1:4173
jobs:
  - type: e2e
    name: sign-in
    startUrl: /login
    steps:
      - Fill #email with user
    assert:
      - The page contains Signed in
`);
    expect(loadSuite(file).jobs[0].assert).toEqual(["The page contains Signed in"]);
  });

  it("expands ${VAR} in target and steps", () => {
    const previous = {
      target: process.env.GOLIVECHECK_TARGET,
      user: process.env.GOLIVECHECK_USER,
    };
    process.env.GOLIVECHECK_TARGET = "http://127.0.0.1:4173";
    process.env.GOLIVECHECK_USER = "shopper";
    const file = writeSuite(`name: x
target: \${GOLIVECHECK_TARGET}
jobs:
  - type: security
    name: a
    url: /
`);
    try {
      expect(loadSuite(file).target).toBe("http://127.0.0.1:4173");
    } finally {
      restoreEnv("GOLIVECHECK_TARGET", previous.target);
      restoreEnv("GOLIVECHECK_USER", previous.user);
    }
  });

  it("loads owned.yaml and login.yaml when target and allow env vars are set", () => {
    const previous = {
      target: process.env.GOLIVECHECK_TARGET,
      allow: process.env.GOLIVECHECK_ALLOW,
      user: process.env.GOLIVECHECK_USER,
      password: process.env.GOLIVECHECK_PASSWORD,
    };
    process.env.GOLIVECHECK_TARGET = "https://staging.example.com";
    process.env.GOLIVECHECK_ALLOW = "staging.example.com";
    process.env.GOLIVECHECK_USER = "shopper@example.com";
    process.env.GOLIVECHECK_PASSWORD = "pass123";
    try {
      const owned = loadSuite(path.join(process.cwd(), "examples/suites/owned.yaml"));
      expect(owned.target).toBe("https://staging.example.com");
      expect(owned.allow).toEqual(["staging.example.com"]);
      const login = loadSuite(path.join(process.cwd(), "examples/suites/login.yaml"));
      expect(login.target).toBe("https://staging.example.com");
      expect(login.allow).toEqual(["staging.example.com"]);
    } finally {
      restoreEnv("GOLIVECHECK_TARGET", previous.target);
      restoreEnv("GOLIVECHECK_ALLOW", previous.allow);
      restoreEnv("GOLIVECHECK_USER", previous.user);
      restoreEnv("GOLIVECHECK_PASSWORD", previous.password);
    }
  });

  it("fails when a referenced env var is missing", () => {
    const previous = process.env.GOLIVECHECK_TARGET;
    delete process.env.GOLIVECHECK_TARGET;
    const file = writeSuite(`name: x
target: \${GOLIVECHECK_TARGET}
jobs:
  - type: security
    name: a
    url: /
`);
    try {
      expect(() => loadSuite(file)).toThrow(/Missing environment variable GOLIVECHECK_TARGET/);
    } finally {
      restoreEnv("GOLIVECHECK_TARGET", previous);
    }
  });

  it("rejects API jobs with no requests", () => {
    const file = writeSuite(`name: x
target: http://127.0.0.1:4173
jobs:
  - type: api
    name: a
`);
    expect(() => loadSuite(file)).toThrow(/non-empty requests/);
  });
});

/**
 * Restores or deletes a process env key.
 *
 * @param name - Env var name.
 * @param value - Previous value, or undefined if it was unset.
 */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
