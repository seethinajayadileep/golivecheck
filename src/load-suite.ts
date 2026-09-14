import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ConfigError } from "./errors.js";
import type { Job, JobType, Suite } from "./types.js";

const JOB_TYPES: JobType[] = ["e2e", "api", "a11y", "security"];

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
  try {
    new URL(target);
  } catch {
    throw new ConfigError(`Invalid target URL: ${target}`);
  }
  const allow = Array.isArray(doc.allow) ? doc.allow.map(String) : [new URL(target).hostname];
  const budgetRaw = (doc.budget as Record<string, unknown>) || {};
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
      maxMinutes: num(budgetRaw.maxMinutes),
      maxLlmCalls: num(budgetRaw.maxLlmCalls),
      maxUsd: num(budgetRaw.maxUsd),
    },
    jobs,
  };
}

function num(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

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
    return {
      type,
      name,
      startUrl: String(job.startUrl || "/"),
      steps: arr(job.steps),
      assert: arr(job.assert),
    };
  }
  if (type === "api") {
    const requests = Array.isArray(job.requests) ? job.requests : [];
    return {
      type,
      name,
      requests: requests.map((r) => {
        const req = r as Record<string, unknown>;
        return {
          method: String(req.method || "GET"),
          path: String(req.path || "/"),
          expectStatus: Number(req.expectStatus ?? 200),
          jsonPath: req.jsonPath ? String(req.jsonPath) : undefined,
        };
      }),
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

function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function parseOnly(value?: string): JobType[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean) as JobType[];
  for (const p of parts) {
    if (!JOB_TYPES.includes(p)) throw new ConfigError(`Unknown job type in --only: ${p}`);
  }
  return parts;
}
