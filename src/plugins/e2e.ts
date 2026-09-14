import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page, Browser } from "playwright";
import { hasLlmKey, type LlmAction } from "../llm/client.js";
import { planActions } from "../llm/planner.js";
import type { Budget } from "../budget.js";
import type { Scope } from "../scope.js";
import type { E2eJob, Finding, JobResult } from "../types.js";
import { joinUrl } from "../urls.js";
import { ScopeViolationError } from "../errors.js";

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
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("request", (req) => {
    const u = req.url();
    if (u.startsWith("data:") || u.startsWith("blob:")) return;
    scope.assert(u);
  });

  try {
    const start = joinUrl(target, job.startUrl);
    scope.assert(start);
    await page.goto(start, { waitUntil: "domcontentloaded" });

    if (hasLlmKey()) {
      await runWithLlm(page, job, start, scope, budget, outputDir, screenshots, findings);
    } else if (job.name === "buy-one-item") {
      await runSavedBuyOneItem(page, target, scope);
    } else {
      throw new Error(
        `No saved script for E2E job "${job.name}" and OPENAI_API_KEY is not set. Demo job "buy-one-item" has a fallback.`,
      );
    }

    for (const assertion of job.assert) {
      if (/cart is not empty/i.test(assertion)) {
        const count = await page.locator("#cart-items li").count();
        if (count < 1) {
          findings.push({
            severity: "fail",
            check: "assert",
            message: assertion,
          });
        }
      }
    }

    const shot = path.join(outputDir, "screenshots", `${job.name}.png`);
    mkdirSync(path.dirname(shot), { recursive: true });
    await page.screenshot({ path: shot, fullPage: true });
    screenshots.push(shot);

    const failed = findings.some((f) => f.severity === "fail");
    return {
      name: job.name,
      type: "e2e",
      status: failed ? "failed" : "passed",
      findings,
      durationMs: Date.now() - started,
      screenshots,
    };
  } catch (err) {
    if (err instanceof ScopeViolationError) throw err;
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

async function runWithLlm(
  page: Page,
  job: E2eJob,
  startUrl: string,
  scope: Scope,
  budget: Budget,
  outputDir: string,
  screenshots: string[],
  findings: Finding[],
): Promise<void> {
  for (let i = 0; i < 6; i++) {
    budget.recordLlmCall();
    const snapshot = await page.locator("body").ariaSnapshot().catch(() => page.content());
    const turn = await planActions({
      steps: job.steps,
      assert: job.assert,
      startUrl,
      currentUrl: page.url(),
      ariaSnapshot: typeof snapshot === "string" ? snapshot : String(snapshot),
    });
    findings.push({
      severity: "info",
      check: "llm-plan",
      message: `turn ${i + 1}: ${JSON.stringify(turn)}`,
    });
    if (turn.done && turn.actions.length === 0) break;
    if (turn.actions.length === 0) break;
    await runActions(page, turn.actions, scope, outputDir, screenshots);
    if (await assertionsLookMet(page, job.assert)) break;
  }
}

async function assertionsLookMet(page: Page, asserts: string[]): Promise<boolean> {
  for (const assertion of asserts) {
    if (/cart is not empty/i.test(assertion)) {
      if ((await page.locator("#cart-items li").count()) < 1) return false;
    }
  }
  return asserts.length > 0;
}

async function runSavedBuyOneItem(page: Page, target: string, scope: Scope): Promise<void> {
  await page.locator(".product-link").first().click();
  scope.assert(page.url());
  await page.locator("#add-to-cart").click();
  await page.waitForURL(/\/cart/);
  scope.assert(page.url());
  const count = await page.locator("#cart-items li").count();
  if (count < 1) throw new Error("The cart is not empty — assertion failed");
  void target;
}

async function runActions(
  page: Page,
  actions: LlmAction[],
  scope: Scope,
  outputDir: string,
  screenshots: string[],
): Promise<void> {
  for (const action of actions) {
    switch (action.op) {
      case "goto": {
        const url = action.url;
        scope.assert(url);
        await page.goto(url, { waitUntil: "domcontentloaded" });
        break;
      }
      case "click":
        await locate(page, action.selector).first().click({ timeout: 10_000 });
        break;
      case "fill":
        await locate(page, action.selector).first().fill(action.value, { timeout: 10_000 });
        break;
      case "press":
        await page.keyboard.press(action.key);
        break;
      case "wait":
        if (action.selector) await locate(page, action.selector).first().waitFor({ timeout: 10_000 });
        else await page.waitForTimeout(Math.min(action.ms ?? 500, 5_000));
        break;
      case "screenshot": {
        const shot = path.join(outputDir, "screenshots", `${action.name || "step"}.png`);
        mkdirSync(path.dirname(shot), { recursive: true });
        await page.screenshot({ path: shot });
        screenshots.push(shot);
        break;
      }
      default:
        break;
    }
    scope.assert(page.url());
  }
}

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

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
