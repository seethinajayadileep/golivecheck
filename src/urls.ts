export function joinUrl(target: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = target.endsWith("/") ? target : `${target}/`;
  const rel = pathOrUrl.startsWith("/") ? pathOrUrl.slice(1) : pathOrUrl;
  return new URL(rel, base).toString();
}

export function isLocalhost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
