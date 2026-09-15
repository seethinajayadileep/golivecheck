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

/**
 * Playwright timeout capped by remaining budget.
 *
 * @param budget - Active suite budget.
 */
function navTimeout(budget: Budget): number {
  budget.assertWithinLimits();
  return Math.max(1, Math.min(30_000, budget.remainingMs()));
}

/**
 * LLM loop: plan, redact fill values in findings, run actions, stop when asserts hold.
 *
 * @returns Actions that ran (for replay).
 *
 * @param page - Active page.
 * @param job - E2E job.
 * @param startUrl - Absolute start URL.
 * @param scope - Host allowlist.
 * @param budget - Suite budget.
 * @param outputDir - Screenshot directory.
 * @param screenshots - Accumulated screenshot paths.
 * @param findings - Accumulated findings.
 * @param assertAllowed - Throws if a request was blocked.
 */
async function runWithLlm(
  page: Page,
  job: E2eJob,
  startUrl: string,
  scope: Scope,
  budget: Budget,
  outputDir: string,
  screenshots: string[],
  findings: Finding[],
  assertAllowed: () => void,
): Promise<LlmAction[]> {
  const recorded: LlmAction[] = [];
  for (let i = 0; i < 6; i++) {
    budget.recordLlmCall();
    const snapshot = await page.locator("body").ariaSnapshot().catch(() => page.content());
    const turn = await planActions({
      steps: job.steps,
      assert: job.assert,
      startUrl,
      currentUrl: page.url(),
      ariaSnapshot: typeof snapshot === "string" ? snapshot : String(snapshot),
      signal: budget.signal,
    });
    findings.push({
      severity: "info",
      check: "llm-plan",
      message: `turn ${i + 1}: ${JSON.stringify(redactTurn(turn))}`,
    });
    if (turn.done && turn.actions.length === 0) break;
    if (turn.actions.length === 0) break;
    recorded.push(...turn.actions);
    await runActions(page, turn.actions, scope, budget, outputDir, screenshots);
    assertAllowed();
    if (await assertionsLookMet(page, job.assert)) break;
  }
  return recorded;
}

/**
 * Copies a plan turn with `fill.value` replaced so reports never store secrets.
 *
 * @param turn - Raw planner output.
 */
function redactTurn(turn: { actions: LlmAction[]; done: boolean }): { actions: LlmAction[]; done: boolean } {
  return {
    done: turn.done,
    actions: turn.actions.map((action) =>
      action.op === "fill" ? { ...action, value: "[redacted]" } : action,
    ),
  };
}

/**
 * True when every assertion is a known check and currently holds.
 *
 * Unknown assertion strings are treated as unmet so the LLM loop does not stop early.
 *
 * @param page - Active page.
 * @param asserts - Assertion strings from the suite.
 */
async function assertionsLookMet(page: Page, asserts: string[]): Promise<boolean> {
  if (asserts.length === 0) return false;
  for (const assertion of asserts) {
    if (!(await assertionHolds(page, assertion))) return false;
  }
  return true;
}

/**
 * Evaluates one known assertion against the demo shop DOM.
 *
 * @param page - Active page.
 * @param assertion - Suite assertion string.
 * @returns False when the check fails or is not a supported assertion.
 */
async function assertionHolds(page: Page, assertion: string): Promise<boolean> {
  if (CART_ASSERT.test(assertion)) {
    return (await page.locator("#cart-items li").count()) >= 1;
  }
  const contains = assertion.match(PAGE_CONTAINS);
  if (contains) {
    const text = contains[1].trim();
    return (await page.getByText(text).count()) >= 1;
  }
  return false;
}

/** Demo-shop clicks used when there is no LLM, no Fill/Click script, and no replay yet. */
const BUY_ONE_ITEM_ACTIONS: LlmAction[] = [
  { op: "click", selector: ".product-link" },
  { op: "click", selector: "#add-to-cart" },
];

/**
 * Maps Fill/Click/Open/Wait/Press steps onto planner actions.
 *
 * @param steps - Parsed scriptable steps.
 * @param target - Suite target URL.
 */
function scriptToActions(steps: ScriptStep[], target: string): LlmAction[] {
  return steps.map((step) => {
    if (step.op === "fill") return { op: "fill", selector: step.selector, value: step.value };
    if (step.op === "click") return { op: "click", selector: step.selector };
    if (step.op === "open") return { op: "goto", url: joinUrl(target, step.url) };
    if (step.op === "wait") return { op: "wait", ms: Math.min(step.ms, 5_000) };
    return { op: "press", key: step.key };
  });
}

/**
 * Executes planner actions with allowlist checks on navigation.
 *
 * @param page - Active page.
 * @param actions - Validated LLM actions.
 * @param scope - Host allowlist.
 * @param outputDir - Screenshot directory.
 * @param screenshots - Accumulated paths.
 * @param budget - Suite budget; checked before every action.
 */
async function runActions(
  page: Page,
  actions: LlmAction[],
  scope: Scope,
  budget: Budget,
  outputDir: string,
  screenshots: string[],
): Promise<void> {
  for (const action of actions) {
    const timeout = navTimeout(budget);
    switch (action.op) {
      case "goto": {
        const url = action.url;
        scope.assert(url);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
        break;
      }
      case "click":
        await locate(page, action.selector).first().click({ timeout });
        await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => undefined);
        break;
      case "fill":
        await locate(page, action.selector).first().fill(action.value, { timeout });
        break;
      case "press":
        await page.keyboard.press(action.key);
        break;
      case "wait":
        if (action.selector) await locate(page, action.selector).first().waitFor({ timeout });
        else await page.waitForTimeout(Math.min(action.ms ?? 500, 5_000, budget.remainingMs()));
        break;
      case "screenshot": {
        const shot = path.join(outputDir, "screenshots", `${artifactSlug(action.name || "step")}.png`);
        mkdirSync(path.dirname(shot), { recursive: true });
        await page.screenshot({ path: shot, timeout });
        screenshots.push(shot);
        break;
      }
      default:
        break;
    }
    budget.assertWithinLimits();
    scope.assert(page.url());
  }
}

/**
 * Maps ARIA-style planner selectors onto Playwright locators.
 *
 * @param page - Active page.
 * @param selector - CSS, `link Name`, or `role=link[name=...]`.
 */
function locate(page: Page, selector: string) {
  const trimmed = selector.trim();
  const roleEq = trimmed.match(
    /^(link|button|heading|img|image|textbox|searchbox|checkbox|radio|menuitem)\s*[:=]?\s+(.+)$/i,
  );
  if (roleEq) {
    const role = roleEq[1].toLowerCase() === "image" ? "img" : roleEq[1].toLowerCase();
    const name = roleEq[2].replace(/^["']|["']$/g, "").trim();
    return page.getByRole(role as Parameters<Page["getByRole"]>[0], { name: new RegExp(escapeRe(name), "i") });
  }
  const roleAttr = trimmed.match(/^role=(\w+)(?:\[name=(.+)\])?$/i);
  if (roleAttr) {
    const nameRaw = (roleAttr[2] || "").replace(/^\/|\/i$/g, "").replace(/^["']|["']$/g, "");
    return page.getByRole(
      roleAttr[1] as Parameters<Page["getByRole"]>[0],
      nameRaw ? { name: new RegExp(escapeRe(nameRaw), "i") } : undefined,
    );
  }
  return page.locator(trimmed);
}

/**
 * Escapes a string for use inside a RegExp.
 *
 * @param value - Literal text.
 */
function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
