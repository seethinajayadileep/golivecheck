import { completeJson, parseActions, type LlmAction } from "./client.js";

/**
 * Asks the LLM for the next Playwright actions given page context.
 *
 * @param input - Steps, assertions, URLs, snapshot, and optional budget signal.
 * @returns Parsed actions and a done flag from the model JSON.
 */
export async function planActions(input: {
  steps: string[];
  assert: string[];
  startUrl: string;
  currentUrl: string;
  ariaSnapshot: string;
  signal?: AbortSignal;
}): Promise<{ actions: LlmAction[]; done: boolean }> {
  const prompt = [
    "You are driving a Playwright browser on an allowlisted demo site.",
    `Start URL: ${input.startUrl}`,
    `Current URL: ${input.currentUrl}`,
    "Steps the user wants:",
    ...input.steps.map((s) => `- ${s}`),
    "Assert when done:",
    ...input.assert.map((s) => `- ${s}`),
    "Return JSON: {\"done\": false, \"actions\":[...]} with the NEXT 1-4 actions only.",
    "Set done=true and actions=[] if the assertions already look satisfied.",
    "Allowed ops: goto, click, fill, press, wait, screenshot.",
    "For click/fill, selector must be a Playwright locator string: CSS, #id, text=Exact, or role=link[name=/.../i].",
    "Prefer visible names from the snapshot (product link, Add to cart).",
    "Do not leave the current host. Do not invent other websites.",
    "Accessibility snapshot (truncated):",
    input.ariaSnapshot.slice(0, 8000),
  ].join("\n");
  const raw = await completeJson(prompt, input.signal);
  let done = false;
  try {
    const parsed = JSON.parse(raw) as { done?: unknown };
    done = Boolean(parsed.done);
  } catch {
    done = false;
  }
  return { actions: parseActions(raw), done };
}
