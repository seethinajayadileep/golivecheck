export class ScopeViolationError extends Error {
  readonly code = "SCOPE_VIOLATION" as const;
  readonly exitCode = 2;
  constructor(url: string, allow: string[]) {
    super(`SCOPE_VIOLATION: ${url} is not on the allowlist (${allow.join(", ") || "empty"})`);
    this.name = "ScopeViolationError";
  }
}

export class BudgetExceededError extends Error {
  readonly code = "BUDGET_EXCEEDED" as const;
  readonly exitCode = 2;
  constructor(message: string) {
    super(`BUDGET_EXCEEDED: ${message}`);
    this.name = "BudgetExceededError";
  }
}

export class ConfigError extends Error {
  readonly code = "CONFIG_ERROR" as const;
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
