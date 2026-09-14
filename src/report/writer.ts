import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { JobResult, RunReport } from "../types.js";

/**
 * Writes JSON, HTML, and JUnit reports for a suite run.
 *
 * @param report - Finished (or aborted) run.
 * @param outputDir - Destination directory.
 * @returns Paths to the three report files.
 */
export function writeReports(report: RunReport, outputDir: string): { html: string; json: string; junit: string } {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "report.json");
  const htmlPath = path.join(outputDir, "report.html");
  const junitPath = path.join(outputDir, "junit.xml");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(htmlPath, renderHtml(report));
  writeFileSync(junitPath, renderJunit(report));
  return { html: htmlPath, json: jsonPath, junit: junitPath };
}

/**
 * Renders a simple HTML report.
 *
 * @param report - Finished run.
 */
function renderHtml(report: RunReport): string {
  const jobs = report.results
    .map((job) => {
      const findings = job.findings
        .map(
          (f) =>
            `<li class="${f.severity}"><strong>${f.severity}</strong> ${escapeHtml(f.check)} — ${escapeHtml(f.message)}</li>`,
        )
        .join("");
      return `<section>
        <h2>${escapeHtml(job.type)} · ${escapeHtml(job.name)} <span class="status ${job.status}">${job.status}</span></h2>
        <p>${job.durationMs} ms</p>
        ${job.error ? `<p class="fail">${escapeHtml(job.error)}</p>` : ""}
        <ul>${findings || "<li>No findings</li>"}</ul>
      </section>`;
    })
    .join("\n");
  const abort = report.aborted
    ? `<p class="fail"><strong>${escapeHtml(report.aborted.code)}</strong> ${escapeHtml(report.aborted.message)}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>GoLiveCheck — ${escapeHtml(report.suite)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 880px; margin: 2rem auto; color: #222; }
    .passed { color: #0a6; }
    .failed, .fail, .error { color: #b00; }
    .warn { color: #a60; }
    .info { color: #555; }
    section { border-top: 1px solid #ddd; padding: 1rem 0; }
  </style>
</head>
<body>
  <h1>GoLiveCheck report</h1>
  <p>${escapeHtml(report.suite)} → ${escapeHtml(report.target)}</p>
  ${abort}
  ${jobs}
</body>
</html>`;
}

/**
 * Renders JUnit XML, adding an abort testcase when the run was cut short.
 *
 * @param report - Finished run.
 */
function renderJunit(report: RunReport): string {
  const failures = report.results.filter((r) => r.status === "failed" || r.status === "error").length;
  const cases = report.results.map((r) => testCase(r));
  if (report.aborted) {
    cases.push(`  <testcase classname="golivecheck" name="aborted" time="0">
    <error message="${escapeXml(report.aborted.code)}">${escapeXml(report.aborted.message)}</error>
  </testcase>`);
  }
  const tests = report.results.length + (report.aborted ? 1 : 0);
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${escapeXml(report.suite)}" tests="${tests}" failures="${failures}"${report.aborted ? ` errors="1"` : ""}>
${cases.join("\n")}
</testsuite>
`;
}

/**
 * One JUnit testcase for a job result.
 *
 * @param job - Job result.
 */
function testCase(job: JobResult): string {
  const time = (job.durationMs / 1000).toFixed(3);
  const fail = job.findings.filter((f) => f.severity === "fail");
  if (job.status === "passed" && fail.length === 0) {
    return `  <testcase classname="${escapeXml(job.type)}" name="${escapeXml(job.name)}" time="${time}"/>`;
  }
  const msg = fail.map((f) => f.message).join("; ") || job.error || job.status;
  return `  <testcase classname="${escapeXml(job.type)}" name="${escapeXml(job.name)}" time="${time}">
    <failure message="${escapeXml(msg)}">${escapeXml(msg)}</failure>
  </testcase>`;
}

/**
 * Escapes text for HTML.
 *
 * @param value - Raw string.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/**
 * Escapes text for XML (same mapping as HTML).
 *
 * @param value - Raw string.
 */
function escapeXml(value: string): string {
  return escapeHtml(value);
}
