import { chromium } from "playwright";
import { Budget } from "./budget.js";
import { BudgetExceededError, ConfigError, ScopeViolationError } from "./errors.js";
import { loadSuite } from "./load-suite.js";
import { runA11y } from "./plugins/a11y.js";
import { runApi } from "./plugins/api.js";
import { runE2e } from "./plugins/e2e.js";
import { runSecurity } from "./plugins/security.js";
import { writeReports } from "./report/writer.js";
import { scopeFromTarget } from "./scope.js";
import type { Job, JobResult, JobType, RunOptions, RunReport } from "./types.js";

/**
 * Loads a suite, runs selected jobs, and always writes JSON, HTML, and JUnit reports.
 *
 * Scope and budget failures abort remaining jobs but keep completed results.
 * Unexpected errors are recorded as an abort instead of skipping reports.
 *
 * @param options - Config path, output directory, and optional filters.
 */
export async function runSuite(
  options: RunOptions,
): Promise<{ report: RunReport; exitCode: number; paths: { html: string; json: string; junit: string } }> {
  const suite = loadSuite(options.configPath, options.targetOverride);
  if (options.allowOverride?.length) suite.allow = options.allowOverride;
  const scope = scopeFromTarget(suite.target, suite.allow);
  const budget = new Budget(suite.budget);
  const startedAt = new Date().toISOString();
  const jobs = options.only ? suite.jobs.filter((j) => options.only!.includes(j.type)) : suite.jobs;
  if (jobs.length === 0) throw new ConfigError("No jobs to run (check --only)");

  const needsBrowser = jobs.some((j) => j.type === "e2e" || j.type === "a11y");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  const results: JobResult[] = [];
  let aborted: RunReport["aborted"];

  try {
    if (needsBrowser) browser = await chromium.launch({ headless: true });
    for (const job of jobs) {
      budget.assertWithinLimits();
      const result = await runJob(job, suite.target, scope, budget, browser, options.outputDir);
      budget.assertWithinLimits();
      results.push(result);
    }
  } catch (err) {
    if (err instanceof ScopeViolationError || err instanceof BudgetExceededError) {
      aborted = { code: err.code, message: err.message };
    } else {
      aborted = { code: "ERROR", message: (err as Error).message };
    }
  } finally {
    await browser?.close();
  }

  const report: RunReport = {
    suite: suite.name,
    target: suite.target,
    startedAt,
    finishedAt: new Date().toISOString(),
    aborted,
    results,
  };
  const paths = writeReports(report, options.outputDir);
  return { report, exitCode: exitCode(report), paths };
}

/**
 * Dispatches one job to the matching plugin.
 *
 * @param job - Suite job.
 * @param target - Suite target URL.
 * @param scope - Host allowlist.
 * @param budget - Shared budget.
 * @param browser - Chromium, when e2e or a11y jobs are present.
 * @param outputDir - Report and screenshot directory.
 */
async function runJob(
  job: Job,
  target: string,
  scope: ReturnType<typeof scopeFromTarget>,
  budget: Budget,
  browser: Awaited<ReturnType<typeof chromium.launch>> | null,
  outputDir: string,
): Promise<JobResult> {
  switch (job.type) {
    case "security":
      return runSecurity(job, target, scope, budget.signal);
    case "api":
      return runApi(job, target, scope, budget.signal);
    case "a11y":
      if (!browser) throw new Error("Browser required for a11y");
      return runA11y(job, target, scope, browser, budget);
    case "e2e":
      if (!browser) throw new Error("Browser required for e2e");
      return runE2e(job, target, scope, browser, budget, outputDir);
    default: {
      const never: never = job;
      throw new Error(`Unknown job ${(never as Job).type}`);
    }
  }
}

/**
 * Maps a finished report to a process exit code.
 *
 * @param report - Written report.
 * @returns 0 pass, 1 job fail, 2 abort/config.
 */
function exitCode(report: RunReport): number {
  if (report.aborted) return 2;
  const failed = report.results.some((r) => r.status === "failed" || r.status === "error");
  return failed ? 1 : 0;
}

/**
 * Identity helper retained for CLI `--only` wiring.
 *
 * @param types - Optional job type list.
 */
export function filterTypes(types?: JobType[]): JobType[] | undefined {
  return types;
}
