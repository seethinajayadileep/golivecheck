import { ScopeViolationError } from "./errors.js";

export class Scope {
  constructor(readonly allow: string[]) {
    if (allow.length === 0) {
      throw new ScopeViolationError("(no url)", allow);
    }
  }

  hostnameAllowed(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return this.allow.some((entry) => {
      const allowed = entry.replace(/^\[|\]$/g, "").toLowerCase();
      return host === allowed;
    });
  }

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

export function scopeFromTarget(target: string, allow: string[]): Scope {
  const hosts = allow.length > 0 ? allow : [new URL(target).hostname];
  return new Scope(hosts);
}
