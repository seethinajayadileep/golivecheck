import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseActions, type LlmAction } from "./llm/client.js";
import { artifactSlug } from "./urls.js";

export interface ReplayFile {
  job: string;
  startUrl: string;
  assert: string[];
  actions: LlmAction[];
}

/**
 * Path to the action JSON for one E2E job.
 *
 * @param outputDir - Suite output directory.
 * @param jobName - E2E job name.
 */
export function replayJsonPath(outputDir: string, jobName: string): string {
  return path.join(outputDir, "replay", `${artifactSlug(jobName, "job")}.json`);
}

/**
 * Path to the generated Playwright spec for one E2E job.
 *
 * @param outputDir - Suite output directory.
 * @param jobName - E2E job name.
 */
export function replaySpecPath(outputDir: string, jobName: string): string {
  return path.join(outputDir, "replay", `${artifactSlug(jobName, "job")}.spec.ts`);
}

/**
 * Loads a previously saved replay when the file exists and parses cleanly.
 *
 * @param outputDir - Suite output directory.
 * @param jobName - E2E job name.
 */
export function loadReplay(outputDir: string, jobName: string): ReplayFile | null {
  const file = replayJsonPath(outputDir, jobName);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const actions = parseActions(JSON.stringify({ actions: raw.actions }));
    if (actions.length === 0) return null;
    return {
      job: String(raw.job || jobName),
      startUrl: String(raw.startUrl || "/"),
      assert: Array.isArray(raw.assert) ? raw.assert.map(String) : [],
      actions,
    };
  } catch {
    return null;
  }
}

/**
 * Writes action JSON and a Playwright spec after a successful E2E job.
 *
 * Fill values are stored in `output/` (gitignored) so a second run can replay
 * login without an LLM. Do not commit `output/replay`.
 *
 * @param outputDir - Suite output directory.
 * @param jobName - E2E job name.
 * @param startUrl - Job start path or URL.
 * @param assert - Assertion strings.
 * @param actions - Actions that were executed.
 */
export function writeReplay(
  outputDir: string,
  jobName: string,
  startUrl: string,
  assert: string[],
  actions: LlmAction[],
): { json: string; spec: string } | null {
  if (actions.length === 0) return null;
  const jsonPath = replayJsonPath(outputDir, jobName);
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  const body: ReplayFile = { job: jobName, startUrl, assert, actions };
  writeFileSync(jsonPath, `${JSON.stringify(body, null, 2)}\n`);
  const specPath = replaySpecPath(outputDir, jobName);
  writeFileSync(specPath, emitPlaywrightSpec(body));
  return { json: jsonPath, spec: specPath };
}

/**
 * Emits a Playwright test file from saved actions.
 *
 * @param replay - Saved replay document.
 */
export function emitPlaywrightSpec(replay: ReplayFile): string {
  const lines: string[] = [
    `import { test, expect } from "@playwright/test";`,
    ``,
    `test(${JSON.stringify(replay.job)}, async ({ page }) => {`,
    `  const target = process.env.GOLIVECHECK_TARGET || "http://127.0.0.1:4173";`,
    `  const start = ${JSON.stringify(replay.startUrl)};`,
    `  const url = /^https?:\\/\\//i.test(start) ? start : new URL(start, target.endsWith("/") ? target : target + "/").toString();`,
    `  await page.goto(url, { waitUntil: "domcontentloaded" });`,
  ];
  for (const action of replay.actions) {
    switch (action.op) {
      case "goto":
        lines.push(`  await page.goto(${JSON.stringify(action.url)}, { waitUntil: "domcontentloaded" });`);
        break;
      case "click":
        lines.push(`  await page.locator(${JSON.stringify(action.selector)}).first().click();`);
        break;
      case "fill":
        lines.push(
          `  await page.locator(${JSON.stringify(action.selector)}).first().fill(${JSON.stringify(action.value)});`,
        );
        break;
      case "press":
        lines.push(`  await page.keyboard.press(${JSON.stringify(action.key)});`);
        break;
      case "wait":
        if (action.selector) {
          lines.push(`  await page.locator(${JSON.stringify(action.selector)}).first().waitFor();`);
        } else {
          lines.push(`  await page.waitForTimeout(${JSON.stringify(Math.min(action.ms ?? 500, 5_000))});`);
        }
        break;
      case "screenshot":
        lines.push(`  await page.screenshot({ path: ${JSON.stringify(`${action.name || "step"}.png`)} });`);
        break;
      default:
        break;
    }
  }
  for (const assertion of replay.assert) {
    if (/cart is not empty/i.test(assertion)) {
      lines.push(`  expect(await page.locator("#cart-items li").count()).toBeGreaterThanOrEqual(1);`);
      continue;
    }
    const contains = assertion.match(/^the page contains\s+["']?(.+?)["']?$/i);
    if (contains) {
      lines.push(`  await expect(page.getByText(${JSON.stringify(contains[1].trim())})).toBeVisible();`);
    }
  }
  lines.push(`});`, ``);
  return lines.join("\n");
}
