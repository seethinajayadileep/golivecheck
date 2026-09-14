import { scopedFetch } from "../http.js";
import type { Scope } from "../scope.js";
import type { ApiJob, Finding, JobResult } from "../types.js";
import { joinUrl } from "../urls.js";

export async function runApi(job: ApiJob, target: string, scope: Scope): Promise<JobResult> {
  const started = Date.now();
  const findings: Finding[] = [];

  for (const req of job.requests) {
    const url = joinUrl(target, req.path);
    const res = await scopedFetch(url, scope, { method: req.method });
    if (res.status !== req.expectStatus) {
      findings.push({
        severity: "fail",
        check: "status",
        message: `${req.method} ${req.path} expected ${req.expectStatus}, got ${res.status}`,
      });
      continue;
    }
    if (req.jsonPath) {
      const body = (await res.json()) as unknown;
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

function hasJsonPath(body: unknown, path: string): boolean {
  const parts = path.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let cur: unknown = body;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur !== undefined;
}
