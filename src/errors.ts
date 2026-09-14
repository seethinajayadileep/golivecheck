/** Thrown when a URL is outside the host allowlist. Exit code 2. */
export class ScopeViolationError extends Error {
  readonly code = "SCOPE_VIOLATION" as const;
  readonly exitCode = 2;
  /**
   * @param url - Offending URL.
   * @param allow - Current allowlist.
   */
  constructor(url: string, allow: string[]) {
    super(`SCOPE_VIOLATION: ${safeOrigin(url)} is not on the allowlist (${allow.join(", ") || "empty"})`);
    this.name = "ScopeViolationError";
  }
}

/** Thrown when a time, LLM-call, or spend ceiling is crossed. Exit code 2. */
export class BudgetExceededError extends Error {
  readonly code = "BUDGET_EXCEEDED" as const;
  readonly exitCode = 2;
  /**
   * @param message - Which ceiling was exceeded.
   */
  constructor(message: string) {
    super(`BUDGET_EXCEEDED: ${message}`);
    this.name = "BudgetExceededError";
  }
}

/** Thrown for invalid suite YAML or CLI flags. Exit code 2. */
export class ConfigError extends Error {
  readonly code = "CONFIG_ERROR" as const;
  readonly exitCode = 2;
  /**
   * @param message - Human-readable config problem.
   */
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Reports only scheme + host + port so reports never include credentials or query.
 *
 * @param url - Offending URL, possibly untrusted.
 */
function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "(invalid url)";
  }
}
