import { BudgetExceededError } from "./errors.js";
import type { BudgetConfig } from "./types.js";

export class Budget {
  private startedAt = Date.now();
  private llmCalls = 0;
  private usd = 0;

  constructor(private readonly limits: BudgetConfig) {}

  recordLlmCall(usdEstimate = 0.01): void {
    this.llmCalls += 1;
    this.usd += usdEstimate;
    this.assertWithinLimits();
  }

  assertWithinLimits(): void {
    const { maxMinutes, maxLlmCalls, maxUsd } = this.limits;
    if (maxMinutes != null) {
      const elapsedMin = (Date.now() - this.startedAt) / 60_000;
      if (elapsedMin > maxMinutes) {
        throw new BudgetExceededError(`exceeded maxMinutes (${maxMinutes})`);
      }
    }
    if (maxLlmCalls != null && this.llmCalls > maxLlmCalls) {
      throw new BudgetExceededError(`exceeded maxLlmCalls (${maxLlmCalls})`);
    }
    if (maxUsd != null && this.usd > maxUsd) {
      throw new BudgetExceededError(`exceeded maxUsd (${maxUsd})`);
    }
  }

  snapshot() {
    return {
      llmCalls: this.llmCalls,
      usd: this.usd,
      elapsedMs: Date.now() - this.startedAt,
    };
  }
}
