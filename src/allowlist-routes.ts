import type { BrowserContext } from "playwright";
import { ScopeViolationError } from "./errors.js";
import type { Scope } from "./scope.js";

/**
 * Intercepts every context request and aborts URLs outside the allowlist.
 *
 * `data:` and `blob:` URLs are allowed. Call the returned function after
 * navigations and actions so a blocked request fails the job with SCOPE_VIOLATION.
 *
 * @param context - Playwright browser context (service workers should be blocked).
 * @param scope - Host allowlist.
 * @returns A function that throws if any request was blocked.
 */
export async function guardContext(
  context: BrowserContext,
  scope: Scope,
): Promise<() => void> {
  let violation: ScopeViolationError | undefined;
  await context.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("data:") || u.startsWith("blob:")) {
      await route.continue().catch(() => {});
      return;
    }
    try {
      scope.assert(u);
    } catch (err) {
      if (!(err instanceof ScopeViolationError)) throw err;
      violation = err;
      await route.abort("blockedbyclient").catch(() => {});
      return;
    }
    await route.continue().catch(() => {});
  });
  return () => {
    if (violation) throw violation;
  };
}
