import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("publish", () => {
  it("init writes a suite in an empty folder from the packed bin", () => {
    const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
    expect(build.status, build.stderr).toBe(0);
    const pack = spawnSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8" });
    expect(pack.status, pack.stderr).toBe(0);
    const packed = JSON.parse(pack.stdout.trim()) as { filename?: string }[] | { filename?: string };
    const filename = Array.isArray(packed) ? packed[0]?.filename : packed.filename;
    expect(filename).toMatch(/golivecheck-agent-.*\.tgz$/);
    const tgz = path.join(root, filename!);
    const empty = mkdtempSync(path.join(tmpdir(), "glc-empty-"));
    try {
      const install = spawnSync("npm", ["install", "--ignore-scripts", tgz], {
        cwd: empty,
        encoding: "utf8",
      });
      expect(install.status, install.stderr).toBe(0);
      const init = spawnSync("npx", ["golivecheck-agent", "init"], {
        cwd: empty,
        encoding: "utf8",
      });
      expect(init.status, init.stderr + init.stdout).toBe(0);
      const dest = path.join(empty, "golivecheck.config.yaml");
      expect(existsSync(dest)).toBe(true);
      expect(readFileSync(dest, "utf8")).toContain("target:");
      expect(readFileSync(dest, "utf8")).toContain("127.0.0.1");
    } finally {
      rmSync(tgz, { force: true });
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
