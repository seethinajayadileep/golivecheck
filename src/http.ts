import type { Scope } from "./scope.js";

const MAX_REDIRECTS = 20;

/**
 * Fetches a URL after asserting it is allowlisted, following same-origin redirects.
 *
 * Caller `init.redirect` cannot override the enforced `manual` mode. Stops after
 * {@link MAX_REDIRECTS} hops.
 *
 * @param url - Absolute URL to request.
 * @param scope - Host allowlist.
 * @param init - Optional fetch options (signal, headers, method).
 * @param redirects - Internal hop count; callers should omit this.
 * @returns The first non-redirect response.
 */
export async function scopedFetch(
  url: string,
  scope: Scope,
  init?: RequestInit,
  redirects = 0,
): Promise<Response> {
  if (redirects > MAX_REDIRECTS) {
    throw new Error(`Too many redirects (limit ${MAX_REDIRECTS}) starting at ${url}`);
  }
  scope.assert(url);
  const res = await fetch(url, { ...init, redirect: "manual" });
  const location = res.headers.get("location");
  if (location && res.status >= 300 && res.status < 400) {
    const next = new URL(location, url).toString();
    scope.assert(next);
    return scopedFetch(next, scope, init, redirects + 1);
  }
  return res;
}
