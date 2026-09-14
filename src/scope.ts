import { ScopeViolationError } from "./errors.js";

/** Host allowlist used for every navigation and HTTP call. */
export class Scope {
  /**
   * @param allow - Exact hostnames (no wildcards). Empty list is a violation.
   */
  constructor(readonly allow: string[]) {
    if (allow.length === 0) {
      throw new ScopeViolationError("(no url)", allow);
    }
  }

  /**
   * True when the hostname is listed exactly (case-insensitive).
   *
   * @param hostname - Host without a port.
   */
  hostnameAllowed(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return this.allow.some((entry) => {
      const allowed = entry.replace(/^\[|\]$/g, "").toLowerCase();
      return host === allowed;
    });
  }

  /**
   * Throws {@link ScopeViolationError} when the URL host is not allowlisted.
   *
   * @param urlString - Absolute URL (data/blob/about are skipped).
   */
  assert(urlString: string): void {
    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      throw new ScopeViolationError(urlString, this.allow);
    }
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") return;
    if (parsed.protocol === "about:") return;
    if (!this.hostnameAllowed(parsed.hostname)) {
      throw new ScopeViolationError(urlString, this.allow);
    }
  }
}

/**
 * Builds a {@link Scope} from an explicit allowlist or the target hostname.
 *
 * @param target - Suite target URL.
 * @param allow - Optional host list.
 */
export function scopeFromTarget(target: string, allow: string[]): Scope {
  const hosts = allow.length > 0 ? allow : [new URL(target).hostname];
  return new Scope(hosts);
}
