import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseActions, type LlmAction } from "./llm/client.js";
import { artifactSlug } from "./urls.js";

export interface ReplayFile {
  job: string;
  startUrl: string;
  steps: string[];
  assert: string[];
  allow: string[];
  actions: LlmAction[];
}

export interface ReplayFlow {
  startUrl: string;
  steps: string[];
  assert: string[];
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
 * True when a saved replay is for the same start URL, steps, and assertions.
 *
 * @param replay - Loaded replay document.
 * @param flow - Current suite job flow.
 */
export function replayMatchesFlow(replay: ReplayFile, flow: ReplayFlow): boolean {
  return (
    replay.startUrl === flow.startUrl &&
    sameStrings(replay.steps, flow.steps) &&
    sameStrings(replay.assert, flow.assert)
  );
}

/**
 * Loads a previously saved replay when the file exists, parses cleanly, and
 * matches the current flow when `expected` is provided.
 *
 * @param outputDir - Suite output directory.
 * @param jobName - E2E job name.
 * @param expected - Current job startUrl, steps, and assert. When set, a
 *   mismatched or fingerprint-less file is ignored so stale actions are not reused.
 */
export function loadReplay(
  outputDir: string,
  jobName: string,
  expected?: ReplayFlow,
): ReplayFile | null {
  const file = replayJsonPath(outputDir, jobName);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const actions = parseActions(JSON.stringify({ actions: raw.actions }));
    if (actions.length === 0) return null;
    const replay: ReplayFile = {
      job: String(raw.job || jobName),
      startUrl: String(raw.startUrl || "/"),
      steps: Array.isArray(raw.steps) ? raw.steps.map(String) : [],
      assert: Array.isArray(raw.assert) ? raw.assert.map(String) : [],
      allow: Array.isArray(raw.allow) ? raw.allow.map(String) : [],
      actions,
    };
    if (expected && !replayMatchesFlow(replay, expected)) return null;
    return replay;
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
 * @param options - Suite steps and host allowlist stored with the replay.
 */
export function writeReplay(
  outputDir: string,
  jobName: string,
  startUrl: string,
  assert: string[],
  actions: LlmAction[],
  options?: { steps?: string[]; allow?: string[] },
): { json: string; spec: string } | null {
  if (actions.length === 0) return null;
  const jsonPath = replayJsonPath(outputDir, jobName);
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  const body: ReplayFile = {
    job: jobName,
    startUrl,
    steps: options?.steps ?? [],
    assert,
    allow: options?.allow ?? [],
    actions,
  };
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
    `import { test, expect } from "playwright/test";`,
    ``,
    `test(${JSON.stringify(replay.job)}, async ({ page }) => {`,
    `  const allow = ${JSON.stringify(replay.allow)};`,
    `  await page.route("**/*", async (route) => {`,
    `    const u = route.request().url();`,
    `    if (u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")) {`,
    `      await route.continue();`,
    `      return;`,
    `    }`,
    `    let host = "";`,
    `    try {`,
    `      host = new URL(u).hostname.replace(/^\\[|\\]$/g, "").toLowerCase();`,
    `    } catch {`,
    `      await route.abort("blockedbyclient");`,
    `      return;`,
    `    }`,
    `    const ok = allow.some((entry) => entry.replace(/^\\[|\\]$/g, "").toLowerCase() === host);`,
    `    if (!ok) {`,
    `      await route.abort("blockedbyclient");`,
    `      return;`,
    `    }`,
    `    await route.continue();`,
    `  });`,
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
        lines.push(`  await ${emitLocator(action.selector)}.first().click();`);
        break;
      case "fill":
        lines.push(`  await ${emitLocator(action.selector)}.first().fill(${JSON.stringify(action.value)});`);
        break;
      case "press":
        lines.push(`  await page.keyboard.press(${JSON.stringify(action.key)});`);
        break;
      case "wait":
        if (action.selector) {
          lines.push(`  await ${emitLocator(action.selector)}.first().waitFor();`);
        } else {
          lines.push(`  await page.waitForTimeout(${JSON.stringify(Math.min(action.ms ?? 500, 5_000))});`);
        }
        break;
      case "screenshot":
        lines.push(
          `  await page.screenshot({ path: ${JSON.stringify(`${artifactSlug(action.name || "step")}.png`)} });`,
        );
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

/**
 * Emits a Playwright locator expression that matches E2E `locate()`.
 *
 * @param selector - CSS, `button Name`, or `role=button[name=...]`.
 */
export function emitLocator(selector: string): string {
  const trimmed = selector.trim();
  const roleEq = trimmed.match(
    /^(link|button|heading|img|image|textbox|searchbox|checkbox|radio|menuitem)\s*[:=]?\s+(.+)$/i,
  );
  if (roleEq) {
    const role = roleEq[1].toLowerCase() === "image" ? "img" : roleEq[1].toLowerCase();
    const name = roleEq[2].replace(/^["']|["']$/g, "").trim();
    return `page.getByRole(${JSON.stringify(role)}, { name: new RegExp(${JSON.stringify(escapeRe(name))}, "i") })`;
  }
  const roleAttr = trimmed.match(/^role=(\w+)(?:\[name=(.+)\])?$/i);
  if (roleAttr) {
    const nameRaw = (roleAttr[2] || "").replace(/^\/|\/i$/g, "").replace(/^["']|["']$/g, "");
    if (!nameRaw) return `page.getByRole(${JSON.stringify(roleAttr[1])})`;
    return `page.getByRole(${JSON.stringify(roleAttr[1])}, { name: new RegExp(${JSON.stringify(escapeRe(nameRaw))}, "i") })`;
  }
  return `page.locator(${JSON.stringify(trimmed)})`;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, i) => value === right[i]);
}
