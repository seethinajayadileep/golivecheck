export type LlmAction =
  | { op: "goto"; url: string }
  | { op: "click"; selector: string }
  | { op: "fill"; selector: string; value: string }
  | { op: "press"; key: string }
  | { op: "wait"; ms?: number; selector?: string }
  | { op: "screenshot"; name?: string };

const ALLOWED = new Set(["goto", "click", "fill", "press", "wait", "screenshot"]);

export function hasLlmKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function completeJson(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
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
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content || "{}";
}

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
    if (!item || typeof item !== "object") continue;
    const op = String((item as { op?: string }).op || "");
    if (!ALLOWED.has(op)) continue;
    out.push(item as LlmAction);
  }
  return out;
}
