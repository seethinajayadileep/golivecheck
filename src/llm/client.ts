import { BudgetExceededError } from "../errors.js";

export type LlmAction =
  | { op: "goto"; url: string }
  | { op: "click"; selector: string }
  | { op: "fill"; selector: string; value: string }
  | { op: "press"; key: string }
  | { op: "wait"; ms?: number; selector?: string }
  | { op: "screenshot"; name?: string };

const ALLOWED = new Set(["goto", "click", "fill", "press", "wait", "screenshot"]);

/** True when an OpenAI key is present for English E2E planning. */
export function hasLlmKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Calls the chat completions API and returns the assistant JSON text.
 *
 * @param prompt - User prompt describing the current page and steps.
 * @param signal - Budget abort signal; abort becomes {@link BudgetExceededError}.
 */
export async function completeJson(prompt: string, signal?: AbortSignal): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        model: process.env.GOLIVECHECK_LLM_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Return JSON only: {"actions":[{"op":"goto|click|fill|press|wait|screenshot",...}]}. Allowed ops: goto, click, fill, press, wait, screenshot.',
          },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (err) {
    if (signal?.aborted || (err as Error).name === "AbortError") {
      throw new BudgetExceededError("LLM call aborted by budget");
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content || "{}";
}

/**
 * Parses model JSON into well-formed {@link LlmAction} values.
 *
 * Incomplete variants (for example `fill` without a selector) are dropped.
 *
 * @param jsonText - Raw model output.
 */
export function parseActions(jsonText: string): LlmAction[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { actions?: unknown }).actions)
      ? (parsed as { actions: unknown[] }).actions
      : [];
  const out: LlmAction[] = [];
  for (const item of list) {
    const action = parseAction(item);
    if (action) out.push(action);
  }
  return out;
}

/**
 * Validates one action object against the discriminated union.
 *
 * @param item - Unknown JSON value.
 * @returns A typed action, or null when required fields are missing.
 */
function parseAction(item: unknown): LlmAction | null {
  if (!item || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  const op = String(rec.op || "");
  if (!ALLOWED.has(op)) return null;
  const str = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  switch (op) {
    case "goto": {
      const url = str(rec.url);
      return url ? { op: "goto", url } : null;
    }
    case "click": {
      const selector = str(rec.selector);
      return selector ? { op: "click", selector } : null;
    }
    case "fill": {
      const selector = str(rec.selector);
      if (!selector || typeof rec.value !== "string") return null;
      return { op: "fill", selector, value: rec.value };
    }
    case "press": {
      const key = str(rec.key);
      return key ? { op: "press", key } : null;
    }
    case "wait": {
      const selector = typeof rec.selector === "string" && rec.selector.trim() ? rec.selector.trim() : undefined;
      const ms = rec.ms == null ? undefined : Number(rec.ms);
      if (ms != null && (!Number.isFinite(ms) || ms < 0)) return null;
      return { op: "wait", ms, selector };
    }
    case "screenshot": {
      const name = typeof rec.name === "string" ? rec.name : undefined;
      return { op: "screenshot", name };
    }
    default:
      return null;
  }
}
