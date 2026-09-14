import type { Scope } from "./scope.js";

export async function scopedFetch(
  url: string,
  scope: Scope,
  init?: RequestInit,
): Promise<Response> {
  scope.assert(url);
  const res = await fetch(url, { redirect: "manual", ...init });
  const location = res.headers.get("location");
  if (location && res.status >= 300 && res.status < 400) {
    const next = new URL(location, url).toString();
    scope.assert(next);
    return scopedFetch(next, scope, init);
  }
  return res;
}
