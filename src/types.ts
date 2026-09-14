/** One of the four GoLiveCheck job kinds. */
export type JobType = "e2e" | "api" | "a11y" | "security";

export type FindingSeverity = "fail" | "warn" | "info";

export interface BudgetConfig {
  maxMinutes?: number;
  maxLlmCalls?: number;
  maxUsd?: number;
}

export interface ApiRequest {
  method: string;
  path: string;
  expectStatus: number;
  jsonPath?: string;
}

export interface E2eJob {
  type: "e2e";
  name: string;
  startUrl: string;
  steps: string[];
  assert: string[];
}

export interface ApiJob {
  type: "api";
  name: string;
  requests: ApiRequest[];
}

export interface A11yJob {
  type: "a11y";
  name: string;
  url: string;
  tags?: string[];
}

export interface SecurityJob {
  type: "security";
  name: string;
  url: string;
}

export type Job = E2eJob | ApiJob | A11yJob | SecurityJob;

export interface Suite {
  name: string;
  target: string;
  allow: string[];
  budget: BudgetConfig;
  jobs: Job[];
}

export interface Finding {
  severity: FindingSeverity;
  check: string;
  message: string;
}

export type JobStatus = "passed" | "failed" | "error" | "skipped";

export interface JobResult {
  name: string;
  type: JobType;
  status: JobStatus;
  findings: Finding[];
  durationMs: number;
  screenshots: string[];
  error?: string;
}

export interface RunReport {
  suite: string;
  target: string;
  startedAt: string;
  finishedAt: string;
  aborted?: { code: string; message: string };
  results: JobResult[];
}

export interface RunOptions {
  configPath: string;
  outputDir: string;
  only?: JobType[];
  targetOverride?: string;
  allowOverride?: string[];
}
