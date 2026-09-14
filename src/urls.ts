/**
 * Resolves a job path against the suite target.
 *
 * Root-relative paths (`/api`) replace the target pathname so
 * `https://example.com/app` + `/api` becomes `https://example.com/api`.
 *
 * @param target - Suite base URL.
 * @param pathOrUrl - Absolute URL or path.
 * @returns An absolute http(s) URL string.
 */
export function joinUrl(target: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/")) {
    return new URL(pathOrUrl, new URL(target).origin).toString();
  }
  const base = target.endsWith("/") ? target : `${target}/`;
  return new URL(pathOrUrl, base).toString();
}

/**
 * True when the hostname is a loopback address used by the demo shop.
 *
 * @param hostname - Host without a port.
 */
export function isLocalhost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Turns a job or LLM-supplied name into a single path segment for artifacts.
 *
 * @param name - Untrusted label (job name or screenshot action name).
 * @param fallback - Used when the name sanitizes to empty.
 * @returns A basename-safe slug without separators or traversal.
 */
export function artifactSlug(name: string, fallback = "shot"): string {
  const base = name.replace(/\\/g, "/").split("/").pop() || fallback;
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return (cleaned || fallback).slice(0, 80);
}
