import { scopedFetch } from "../http.js";
import type { Scope } from "../scope.js";
import type { Finding, JobResult, SecurityJob } from "../types.js";
import { isLocalhost, joinUrl } from "../urls.js";

const SESSION_COOKIE = /^(session|sess|sid|token|auth|jwt)/i;

export async function runSecurity(
  job: SecurityJob,
  target: string,
  scope: Scope,
): Promise<JobResult> {
  const started = Date.now();
  const findings: Finding[] = [];
  const url = joinUrl(target, job.url);
  scope.assert(url);

  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !isLocalhost(parsed.hostname)) {
    findings.push({
      severity: "fail",
      check: "https",
      message: `${parsed.hostname} is not HTTPS (localhost is the only exception)`,
    });
  }

  const res = await scopedFetch(url, scope, {
    headers: { Origin: "https://untrusted.example" },
  });
  const headers = res.headers;
  const html = await res.text();

  const hsts = headers.get("strict-transport-security");
  if (parsed.protocol === "https:" && !hsts) {
    findings.push({ severity: "fail", check: "hsts", message: "Missing Strict-Transport-Security" });
  } else if (parsed.protocol !== "https:" && !hsts) {
    findings.push({
      severity: "warn",
      check: "hsts",
      message: "HSTS is not set (expected on HTTPS; skipped as fail on HTTP)",
    });
  }

  if ((headers.get("x-content-type-options") || "").toLowerCase() !== "nosniff") {
    findings.push({
      severity: "fail",
      check: "x-content-type-options",
      message: "Missing X-Content-Type-Options: nosniff",
    });
  }

  const xfo = headers.get("x-frame-options");
  const csp = headers.get("content-security-policy") || "";
  if (!xfo && !/frame-ancestors/i.test(csp)) {
    findings.push({
      severity: "fail",
      check: "clickjacking",
      message: "Missing X-Frame-Options and CSP frame-ancestors",
    });
  }

  if (!csp) {
    findings.push({ severity: "warn", check: "csp", message: "Content-Security-Policy header is missing" });
  }

  for (const cookie of headers.getSetCookie?.() ?? splitCookies(headers.get("set-cookie"))) {
    const name = cookie.split("=")[0]?.trim() || "";
    if (!SESSION_COOKIE.test(name)) continue;
    const attrs = cookie.toLowerCase();
    if (!attrs.includes("httponly") || !attrs.includes("secure")) {
      findings.push({
        severity: "fail",
        check: "cookies",
        message: `Session cookie ${name} must be Secure and HttpOnly`,
      });
    }
  }

  const acao = headers.get("access-control-allow-origin");
  const acac = (headers.get("access-control-allow-credentials") || "").toLowerCase() === "true";
  if (acao === "*" && acac) {
    findings.push({
      severity: "fail",
      check: "cors",
      message: "CORS allows * with credentials",
    });
  }

  for (const probe of ["/.env", "/.git/HEAD"]) {
    const probeUrl = joinUrl(target, probe);
    const probeRes = await scopedFetch(probeUrl, scope);
    if (probeRes.status === 200) {
      findings.push({
        severity: "fail",
        check: "sensitive-path",
        message: `${probe} returned 200; it should 404`,
      });
    }
  }

  const mixed = [...html.matchAll(/\b(?:src|href)\s*=\s*["'](http:\/\/[^"']+)["']/gi)];
  if (parsed.protocol === "https:" && mixed.length > 0) {
    findings.push({
      severity: "fail",
      check: "mixed-content",
      message: `HTTPS page loads HTTP resource: ${mixed[0][1]}`,
    });
  }

  const server = headers.get("server") || "";
  if (/\d+\.\d+/.test(server)) {
    findings.push({
      severity: "info",
      check: "server-banner",
      message: `Server header leaks a version: ${server}`,
    });
  }

  const failed = findings.some((f) => f.severity === "fail");
  return {
    name: job.name,
    type: "security",
    status: failed ? "failed" : "passed",
    findings,
    durationMs: Date.now() - started,
    screenshots: [],
  };
}

function splitCookies(header: string | null): string[] {
  if (!header) return [];
  return header.split(/,(?=\s*[^;]+=)/);
}
