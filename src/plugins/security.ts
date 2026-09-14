import { scopedFetch } from "../http.js";
import type { Scope } from "../scope.js";
import type { Finding, JobResult, SecurityJob } from "../types.js";
import { isLocalhost, joinUrl } from "../urls.js";

const SESSION_COOKIE = /^(session|sess|sid|token|auth|jwt)/i;
const PROBE_ORIGIN = "https://untrusted.example";
const SENSITIVE_PATHS = ["/.env", "/.git/HEAD"];

/**
 * Runs read-only header, cookie, CORS, and sensitive-path checks.
 *
 * @param job - Security job.
 * @param target - Suite target URL.
 * @param scope - Host allowlist.
 * @param signal - Optional budget abort signal.
 */
export async function runSecurity(
  job: SecurityJob,
  target: string,
  scope: Scope,
  signal?: AbortSignal,
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
    headers: { Origin: PROBE_ORIGIN },
    signal,
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

  collectClickjacking(headers, findings);

  const csp = headers.get("content-security-policy") || "";
  if (!csp) {
    findings.push({ severity: "warn", check: "csp", message: "Content-Security-Policy header is missing" });
  }

  for (const cookie of headers.getSetCookie?.() ?? splitCookies(headers.get("set-cookie"))) {
    const name = cookie.split("=")[0]?.trim() || "";
    if (!SESSION_COOKIE.test(name)) continue;
    const attrNames = cookie.split(";").map((part) => part.trim().split("=")[0]?.toLowerCase() || "");
    if (!attrNames.includes("httponly") || !attrNames.includes("secure")) {
      findings.push({
        severity: "fail",
        check: "cookies",
        message: `Session cookie ${name} must be Secure and HttpOnly`,
      });
    }
  }

  collectCors(headers, findings);

  for (const probe of SENSITIVE_PATHS) {
    const probeUrl = joinUrl(url, probe);
    const probeRes = await scopedFetch(probeUrl, scope, { signal });
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

/**
 * Fails missing or non-protective X-Frame-Options unless CSP frame-ancestors is set.
 *
 * @param headers - Response headers.
 * @param findings - Findings list to append to.
 */
function collectClickjacking(headers: Headers, findings: Finding[]): void {
  const xfo = (headers.get("x-frame-options") || "").trim();
  const csp = headers.get("content-security-policy") || "";
  const hasAncestors = /frame-ancestors/i.test(csp);
  if (xfo) {
    const norm = xfo.toUpperCase();
    if (norm !== "DENY" && norm !== "SAMEORIGIN") {
      findings.push({
        severity: "fail",
        check: "clickjacking",
        message: `X-Frame-Options ${xfo} is not DENY or SAMEORIGIN`,
      });
    }
    return;
  }
  if (!hasAncestors) {
    findings.push({
      severity: "fail",
      check: "clickjacking",
      message: "Missing X-Frame-Options and CSP frame-ancestors",
    });
  }
}

/**
 * Fails CORS that reflects the probe origin (or `*`) with credentials.
 *
 * @param headers - Response headers.
 * @param findings - Findings list to append to.
 */
function collectCors(headers: Headers, findings: Finding[]): void {
  const acao = headers.get("access-control-allow-origin");
  const acac = (headers.get("access-control-allow-credentials") || "").toLowerCase() === "true";
  if (acac && (acao === "*" || acao === PROBE_ORIGIN)) {
    findings.push({
      severity: "fail",
      check: "cors",
      message:
        acao === "*"
          ? "CORS allows * with credentials"
          : "CORS reflects the request Origin with credentials",
    });
  }
}

/**
 * Splits a combined Set-Cookie header when `getSetCookie` is unavailable.
 *
 * @param header - Raw header value.
 */
function splitCookies(header: string | null): string[] {
  if (!header) return [];
  return header.split(/,(?=\s*[^;]+=)/);
}
