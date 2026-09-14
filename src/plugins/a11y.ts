import { AxeBuilder } from "@axe-core/playwright";
import type { Browser } from "playwright";
import { guardContext } from "../allowlist-routes.js";
import type { Budget } from "../budget.js";
import type { Scope } from "../scope.js";
import type { A11yJob, Finding, JobResult } from "../types.js";
import { joinUrl } from "../urls.js";

/**
 * Runs axe-core against one page after blocking off-allowlist requests.
 *
 * @param job - Accessibility job.
 * @param target - Suite target URL.
 * @param scope - Host allowlist.
 * @param browser - Shared Chromium instance.
 * @param budget - Optional budget for navigation timeouts.
 */
export async function runA11y(
  job: A11yJob,
  target: string,
  scope: Scope,
  browser: Browser,
  budget?: Budget,
): Promise<JobResult> {
  const started = Date.now();
  const url = joinUrl(target, job.url);
  scope.assert(url);

  const context = await browser.newContext({ serviceWorkers: "block" });
  const assertAllowed = await guardContext(context, scope);
  const page = await context.newPage();
  budget?.assertWithinLimits();
  const timeout = budget ? Math.max(1, Math.min(30_000, budget.remainingMs())) : 30_000;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    assertAllowed();
    scope.assert(page.url());
    const builder = new AxeBuilder({ page });
    const tags = expandTags(job.tags);
    builder.withTags(tags);
    const results = await builder.analyze();
    budget?.assertWithinLimits();
    const findings: Finding[] = [];
    for (const v of results.violations) {
      const impact = v.impact || "moderate";
      const severity = impact === "critical" || impact === "serious" ? "fail" : "warn";
      findings.push({
        severity,
        check: v.id,
        message: `${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"})`,
      });
    }
    const failed = findings.some((f) => f.severity === "fail");
    return {
      name: job.name,
      type: "a11y",
      status: failed ? "failed" : "passed",
      findings,
      durationMs: Date.now() - started,
      screenshots: [],
    };
  } finally {
    await context.close();
  }
}

/**
 * Expands WCAG tag aliases so axe always includes the A level under AA.
 *
 * @param tags - Tags from the suite, defaulting to wcag2aa.
 */
function expandTags(tags?: string[]): string[] {
  const set = new Set(tags?.length ? tags : ["wcag2aa"]);
  if (set.has("wcag2aa")) set.add("wcag2a");
  return [...set];
}
