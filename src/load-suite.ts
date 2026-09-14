import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ConfigError } from "./errors.js";
import type { Job, JobType, Suite } from "./types.js";

const JOB_TYPES: JobType[] = ["e2e", "api", "a11y", "security"];
const CART_ASSERT = /cart is not empty/i;

/**
 * Loads and validates a suite YAML file.
 *
 * @param filePath - Path to the suite document.
 * @param targetOverride - Optional CLI `--target` replacement.
 * @returns A normalized suite with allowlist and budget.
 */
export function loadSuite(filePath: string, targetOverride?: string): Suite {
  let raw: unknown;
  try {
    raw = parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new ConfigError(`Cannot read suite ${filePath}: ${(err as Error).message}`);
  }
  if (!raw || typeof raw !== "object") {
    throw new ConfigError("Suite YAML must be an object");
  }
  const doc = raw as Record<string, unknown>;
  const name = String(doc.name || "suite");
  const target = String(targetOverride || doc.target || "");
  if (!target) throw new ConfigError("Suite is missing target");
  const parsedTarget = parseHttpUrl(target);
  const allow = Array.isArray(doc.allow) ? doc.allow.map(String) : [parsedTarget.hostname];
  const budgetRaw =
    doc.budget && typeof doc.budget === "object" ? (doc.budget as Record<string, unknown>) : {};
  const jobsRaw = doc.jobs;
  if (!Array.isArray(jobsRaw) || jobsRaw.length === 0) {
    throw new ConfigError("Suite must have a non-empty jobs list");
  }
  const jobs = jobsRaw.map((job, i) => parseJob(job, i));
  return {
    name,
    target,
    allow,
    budget: {
      maxMinutes: num(budgetRaw.maxMinutes, "maxMinutes", false),
      maxLlmCalls: num(budgetRaw.maxLlmCalls, "maxLlmCalls", true),
      maxUsd: num(budgetRaw.maxUsd, "maxUsd", false),
    },
    jobs,
  };
}

/**
 * Parses a suite target and requires http(s) with a hostname.
 *
 * @param target - Raw target string.
 * @returns The parsed URL.
 */
function parseHttpUrl(target: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new ConfigError(`Invalid target URL: ${target}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError(`Target must be http or https: ${target}`);
  }
  if (!parsed.hostname) {
    throw new ConfigError(`Target is missing a hostname: ${target}`);
  }
  return parsed;
}

/**
 * Coerces a budget field to a finite non-negative number.
 *
 * @param value - YAML value, or omitted.
 * @param name - Field name for errors.
 * @param integer - When true, require a whole number (LLM call counts).
 * @returns The number, or undefined when the field is absent.
 */
function num(value: unknown, name: string, integer: boolean): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ConfigError(`Invalid budget ${name}: ${String(value)}`);
  }
  if (integer && !Number.isInteger(n)) {
    throw new ConfigError(`Budget ${name} must be an integer: ${String(value)}`);
  }
  return n;
}

/**
 * Normalizes one job object from YAML.
 *
 * @param raw - Job mapping.
 * @param index - Zero-based job index for error messages.
 */
function parseJob(raw: unknown, index: number): Job {
  if (!raw || typeof raw !== "object") {
    throw new ConfigError(`Job ${index} is not an object`);
  }
  const job = raw as Record<string, unknown>;
  const type = String(job.type || "") as JobType;
  if (!JOB_TYPES.includes(type)) {
    throw new ConfigError(`Job ${index} has unknown type ${job.type}`);
  }
  const name = String(job.name || `${type}-${index}`);
  if (type === "e2e") {
    const asserts = arr(job.assert);
    for (const assertion of asserts) {
      if (!CART_ASSERT.test(assertion)) {
        throw new ConfigError(`Unsupported E2E assertion "${assertion}" in job ${name}`);
      }
    }
    return {
      type,
      name,
      startUrl: String(job.startUrl || "/"),
      steps: arr(job.steps),
      assert: asserts,
    };
  }
  if (type === "api") {
    const requests = Array.isArray(job.requests) ? job.requests : [];
    return {
      type,
      name,
      requests: requests.map((r, ri) => parseApiRequest(r, name, ri)),
    };
  }
  if (type === "a11y") {
    return {
      type,
      name,
      url: String(job.url || "/"),
      tags: Array.isArray(job.tags) ? job.tags.map(String) : ["wcag2aa"],
    };
  }
  return { type: "security", name, url: String(job.url || "/") };
}

/**
 * Validates one API request entry.
 *
 * @param raw - Request mapping.
 * @param jobName - Parent job name.
 * @param index - Request index.
 */
function parseApiRequest(raw: unknown, jobName: string, index: number) {
  if (!raw || typeof raw !== "object") {
    throw new ConfigError(`API job ${jobName} request ${index} is not an object`);
  }
  const req = raw as Record<string, unknown>;
  const expectStatus = req.expectStatus == null ? 200 : Number(req.expectStatus);
  if (!Number.isInteger(expectStatus) || expectStatus < 100 || expectStatus > 599) {
    throw new ConfigError(`API job ${jobName} request ${index} has invalid expectStatus`);
  }
  return {
    method: String(req.method || "GET"),
    path: String(req.path || "/"),
    expectStatus,
    jsonPath: req.jsonPath ? String(req.jsonPath) : undefined,
  };
}

/**
 * Maps a YAML list to strings.
 *
 * @param value - Unknown YAML node.
 */
function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Parses a comma-separated `--only` filter into job types.
 *
 * @param value - e.g. `security,a11y`.
 * @returns Job types, or undefined when the flag is omitted.
 */
export function parseOnly(value?: string): JobType[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean) as JobType[];
  for (const p of parts) {
    if (!JOB_TYPES.includes(p)) throw new ConfigError(`Unknown job type in --only: ${p}`);
  }
  return parts;
}
