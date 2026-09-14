import { scopedFetch } from "../http.js";
import type { Scope } from "../scope.js";
import type { ApiJob, Finding, JobResult } from "../types.js";
import { joinUrl } from "../urls.js";

/**
 * Runs HTTP smoke checks against allowlisted paths.
 *
 * Invalid JSON on a jsonPath check is recorded as a finding instead of throwing.
 *
 * @param job - API job.
 * @param target - Suite target URL.
 * @param scope - Host allowlist.
 * @param signal - Optional budget abort signal.
 */
export async function runApi(
  job: ApiJob,
  target: string,
  scope: Scope,
  signal?: AbortSignal,
): Promise<JobResult> {
  const started = Date.now();
  const findings: Finding[] = [];

  for (const req of job.requests) {
    const url = joinUrl(target, req.path);
    const res = await scopedFetch(url, scope, { method: req.method, signal });
    if (res.status !== req.expectStatus) {
      findings.push({
        severity: "fail",
        check: "status",
        message: `${req.method} ${req.path} expected ${req.expectStatus}, got ${res.status}`,
      });
      continue;
    }
    if (req.jsonPath) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        findings.push({
          severity: "fail",
          check: "invalid-json",
          message: `${req.path} expected JSON for path ${req.jsonPath}`,
        });
        continue;
      }
      if (!hasJsonPath(body, req.jsonPath)) {
        findings.push({
          severity: "fail",
          check: "json-path",
          message: `${req.path} missing JSON path ${req.jsonPath}`,
        });
      }
    }
  }

  const failed = findings.some((f) => f.severity === "fail");
  return {
    name: job.name,
    type: "api",
    status: failed ? "failed" : "passed",
    findings,
    durationMs: Date.now() - started,
    screenshots: [],
  };
}

/**
 * Walks a dotted JSON path (`$.products` or `products.id`).
 *
 * @param body - Parsed JSON.
 * @param path - Path expression.
 */
function hasJsonPath(body: unknown, path: string): boolean {
  const parts = path.replace(/^\$?\.?/, "").split(".").filter(Boolean);
  let cur: unknown = body;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur !== undefined;
}
