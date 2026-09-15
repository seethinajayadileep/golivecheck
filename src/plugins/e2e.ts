import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page, Browser } from "playwright";
import { guardContext } from "../allowlist-routes.js";
import { hasLlmKey, type LlmAction } from "../llm/client.js";
import { planActions } from "../llm/planner.js";
import type { Budget } from "../budget.js";
import type { Scope } from "../scope.js";
import type { E2eJob, Finding, JobResult } from "../types.js";
import { artifactSlug, joinUrl } from "../urls.js";
import { BudgetExceededError, ScopeViolationError } from "../errors.js";
import { parseScriptableSteps, type ScriptStep } from "./e2e-script.js";
import { loadReplay, writeReplay } from "../replay.js";

const CART_ASSERT = /cart is not empty/i;
const PAGE_CONTAINS = /^the page contains\s+["']?(.+?)["']?$/i;

/**
 * Runs one E2E job with a saved demo script or an LLM action loop.
 *
 * Off-allowlist requests are blocked before they leave the browser. Budget and
 * scope errors are rethrown so the orchestrator can abort with a partial report.
 *
 * @param job - E2E job from the suite.
 * @param target - Suite target URL.
 * @param scope - Host allowlist.
 * @param browser - Shared Chromium instance.
 * @param budget - Time and LLM-call ceilings.
 * @param outputDir - Directory for screenshots.
 */
export async function runE2e(
  job: E2eJob,
  target: string,
  scope: Scope,
  browser: Browser,
  budget: Budget,
  outputDir: string,
): Promise<JobResult> {
  const started = Date.now();
  const findings: Finding[] = [];
  const screenshots: string[] = [];
  const context = await browser.newContext({ serviceWorkers: "block" });
  const assertAllowed = await guardContext(context, scope);
  const page = await context.newPage();
  const timeout = navTimeout(budget);

  try {
    const start = joinUrl(target, job.startUrl);
    scope.assert(start);
    await page.goto(start, { waitUntil: "domcontentloaded", timeout });
    assertAllowed();
    budget.assertWithinLimits();

    const script = parseScriptableSteps(job.steps);
    const saved = loadReplay(outputDir, job.name);
    let recorded: LlmAction[] = [];
    if (script) {
      recorded = scriptToActions(script, target);
      await runActions(page, recorded, scope, budget, outputDir, screenshots);
      assertAllowed();
    } else if (saved) {
      recorded = saved.actions;
      findings.push({
        severity: "info",
        check: "replay",
        message: `used saved actions for "${job.name}" (no LLM)`,
      });
      await runActions(page, recorded, scope, budget, outputDir, screenshots);
      assertAllowed();
    } else if (hasLlmKey()) {
      recorded = await runWithLlm(page, job, start, scope, budget, outputDir, screenshots, findings, assertAllowed);
    } else if (job.name === "buy-one-item") {
      recorded = BUY_ONE_ITEM_ACTIONS;
      await runActions(page, recorded, scope, budget, outputDir, screenshots);
      assertAllowed();
      budget.assertWithinLimits();
    } else {
      throw new Error(
        `No saved script for E2E job "${job.name}" and OPENAI_API_KEY is not set. Use Fill/Click/Open/Wait/Press steps, or the demo job "buy-one-item".`,
      );
    }

    for (const assertion of job.assert) {
      const ok = await assertionHolds(page, assertion);
      if (!ok) {
        findings.push({
          severity: "fail",
          check: "assert",
          message: assertion,
        });
      }
    }

    const shot = path.join(outputDir, "screenshots", `${artifactSlug(job.name)}.png`);
    mkdirSync(path.dirname(shot), { recursive: true });
    await page.screenshot({ path: shot, fullPage: true, timeout: navTimeout(budget) });
    screenshots.push(shot);

    const failed = findings.some((f) => f.severity === "fail");
    if (!failed) {
      writeReplay(outputDir, job.name, job.startUrl, job.assert, recorded);
    }
    return {
      name: job.name,
      type: "e2e",
      status: failed ? "failed" : "passed",
      findings,
      durationMs: Date.now() - started,
      screenshots,
    };
  } catch (err) {
    if (err instanceof ScopeViolationError || err instanceof BudgetExceededError) throw err;
    return {
      name: job.name,
      type: "e2e",
      status: "failed",
      findings: [
        ...findings,
        { severity: "fail", check: "e2e", message: (err as Error).message },
      ],
      durationMs: Date.now() - started,
      screenshots,
      error: (err as Error).message,
    };
  } finally {
    await context.close();
  }
}
