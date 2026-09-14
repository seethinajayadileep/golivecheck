export type ScriptStep =
  | { op: "fill"; selector: string; value: string }
  | { op: "click"; selector: string }
  | { op: "open"; url: string }
  | { op: "wait"; ms: number }
  | { op: "press"; key: string };

/**
 * Parses deterministic Fill/Click/Open/Wait/Press steps for login without an LLM.
 */
export function parseScriptableSteps(steps: string[]): ScriptStep[] | null {
  if (steps.length === 0) return null;
  const parsed: ScriptStep[] = [];
  for (const step of steps) {
    const line = step.trim();
    const fill = line.match(/^fill\s+(.+?)\s+with\s+(.+)$/i);
    if (fill) {
      parsed.push({ op: "fill", selector: fill[1].trim(), value: fill[2] });
      continue;
    }
    const click = line.match(/^click\s+(.+)$/i);
    if (click) {
      parsed.push({ op: "click", selector: click[1].trim() });
      continue;
    }
    const open = line.match(/^open\s+((?:\/|https?:\/\/)\S+)$/i);
    if (open) {
      parsed.push({ op: "open", url: open[1].trim() });
      continue;
    }
    const wait = line.match(/^wait\s+(\d+)\s*ms$/i);
    if (wait) {
      parsed.push({ op: "wait", ms: Number(wait[1]) });
      continue;
    }
    const press = line.match(/^press\s+(.+)$/i);
    if (press) {
      parsed.push({ op: "press", key: press[1].trim() });
      continue;
    }
    return null;
  }
  return parsed;
}
