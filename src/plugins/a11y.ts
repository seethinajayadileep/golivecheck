import { AxeBuilder } from "@axe-core/playwright";
import type { Browser } from "playwright";
import type { Scope } from "../scope.js";
import type { A11yJob, Finding, JobResult } from "../types.js";
import { joinUrl } from "../urls.js";
import { ScopeViolationError } from "../errors.js";

export async function runA11y(
  job: A11yJob,
  target: string,
  scope: Scope,
  browser: Browser,
): Promise<JobResult> {
  const started = Date.now();
  const url = joinUrl(target, job.url);
  scope.assert(url);

  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("request", (req) => {
    const u = req.url();
    if (u.startsWith("data:") || u.startsWith("blob:")) return;
    try {
      scope.assert(u);
    } catch (err) {
      if (err instanceof ScopeViolationError) throw err;
    }
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    scope.assert(page.url());
    const builder = new AxeBuilder({ page });
    const tags = expandTags(job.tags);
    builder.withTags(tags);
    const results = await builder.analyze();
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

function expandTags(tags?: string[]): string[] {
  const set = new Set(tags?.length ? tags : ["wcag2aa"]);
  if (set.has("wcag2aa")) set.add("wcag2a");
  return [...set];
}
