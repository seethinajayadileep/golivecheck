import { BudgetExceededError } from "./errors.js";
import type { BudgetConfig } from "./types.js";

/** Tracks wall-clock, LLM-call, and spend limits for a single suite run. */
export class Budget {
  private startedAt = Date.now();
  private llmCalls = 0;
  private usd = 0;
  private controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Creates a budget that aborts when `maxMinutes` elapses.
   *
   * @param limits - Optional minute, LLM-call, and USD ceilings.
   */
  constructor(private readonly limits: BudgetConfig) {
    if (limits.maxMinutes != null) {
      const remaining = limits.maxMinutes * 60_000 - (Date.now() - this.startedAt);
      if (remaining <= 0) this.controller.abort();
      else {
        this.timer = setTimeout(() => this.controller.abort(), remaining);
        this.timer.unref?.();
      }
    }
  }

  /** AbortSignal that fires when the minute budget is exhausted. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Milliseconds left before `maxMinutes`, or a one-minute default when unset.
   *
   * @returns Remaining time in milliseconds, never negative.
   */
  remainingMs(): number {
    if (this.limits.maxMinutes == null) return 60_000;
    return Math.max(0, this.limits.maxMinutes * 60_000 - (Date.now() - this.startedAt));
  }

  /**
   * Records one LLM call and re-checks every ceiling.
   *
   * @param usdEstimate - Approximate USD cost of the call.
   */
  recordLlmCall(usdEstimate = 0.01): void {
    this.llmCalls += 1;
    this.usd += usdEstimate;
    this.assertWithinLimits();
  }

  /** Throws {@link BudgetExceededError} when any configured ceiling is crossed. */
  assertWithinLimits(): void {
    const { maxMinutes, maxLlmCalls, maxUsd } = this.limits;
    if (this.controller.signal.aborted && maxMinutes != null) {
      throw new BudgetExceededError(`exceeded maxMinutes (${maxMinutes})`);
    }
    if (maxMinutes != null) {
      const elapsedMin = (Date.now() - this.startedAt) / 60_000;
      if (elapsedMin > maxMinutes) {
        this.controller.abort();
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

  /** Snapshot of calls, spend, and elapsed time for reports. */
  snapshot() {
    return {
      llmCalls: this.llmCalls,
      usd: this.usd,
      elapsedMs: Date.now() - this.startedAt,
    };
  }
}
