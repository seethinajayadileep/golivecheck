# PLAN — build v0 in this order

Do not start with a dashboard, brand site, or “all of Midscene + Strix.”

Implementers: complete **one row at a time**. Do not skip to MCP before plugins work.

---

## Step 0 — locked decisions

| Decision | Lock |
|---|---|
| Name | GoLiveCheck / `golivecheck-agent` |
| Language | TypeScript |
| Browser | Playwright |
| Tests | One YAML, English steps |
| Security | Passive checks only |
| Mobile / SaaS | No |
| License | MIT |

---

## Day-1 order

| # | Build | Done when |
|---|---|---|
| 1 | Package, MIT, TS, Playwright, tiny demo shop | Demo site serves a page |
| 2 | YAML load + orchestrator | Reads suite, calls plugins in order |
| 3 | **security + a11y + api** (no LLM) | `--only security,a11y,api` works with no key |
| 4 | E2E English → Playwright; LLM optional | Demo flow passes; no key → saved script |
| 5 | Allowlist + budget | Off-domain fails; over budget stops + report |
| 6 | HTML + JSON + JUnit | `output/report.html` exists |
| 7 | CLI `init` / `run` / `report` | README 2-minute path works |
| 8 | GitHub Action + MCP | Cheap checks run on PR; MCP tools exist |
| 9 | Unit tests + README | CI green without secrets |

If time is short: **cut MCP first**, then video. **Never** cut security / a11y / API.

---

## After v0 (not today)

1. Point YAML at one real staging URL and fix false failures
2. Finish MCP + Cursor snippet
3. Replay JSON → Playwright spec
4. npm publish `golivecheck-agent`

---

## Tests that must exist in v0

1. Scope rejects `https://evil.com` when allowlist is demo
2. Security flags missing `X-Content-Type-Options` on a fixture
3. A11y fails an image with no `alt`
4. API fails on 500
5. Orchestrator writes JUnit with four testcases
6. Budget stops after `maxLlmCalls`

---

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All jobs passed |
| 1 | Functional / a11y / security failed |
| 2 | Scope / budget / config error |

---

## Spec vs code

This repository **is** GoLiveCheck. Keep `IDEA.md`, `AGENTS.md`, and `SKILL.md` at the repo root when you add `src/`.

Do not merge an unrelated app (PII redaction, etc.) into this package.
