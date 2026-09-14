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
