# ROADMAP — Building GoLiveCheck

How we take this repo from **spec** to a **runnable testing agent**.

Read first: [IDEA.md](./IDEA.md) (what) → [PRODUCT.md](./PRODUCT.md) (scope) → this file (path) → [PLAN.md](./PLAN.md) (Phase 1 coding order) → [AGENTS.md](./AGENTS.md) (how to implement).

- **PLAN.md** = Phase 1 only (day-1 order).
- **This file** = the whole path. Do not skip a phase. Do not pull later-phase work into an earlier one.
- If a feature is not in PRODUCT.md, do not build it.

---

## Status now

| Item | State |
|---|---|
| Product spec | Done (`IDEA`, `AGENTS`, `SKILL`, `PRODUCT`, `PLAN`) |
| License | MIT |
| CodeRabbit | Installed. Public repo &lt; 10 stars → comment `@coderabbitai review` |
| Application code | **Not started** — next work is Phase 1 |

**You are here:** Phase 0 complete. Start Phase 1 in this repository (package at repo root, not a nested app).

---

## What we are building

One YAML suite. Four jobs. Allowlist + budget. Three ways to call it (CLI, GitHub Action, MCP). Three of four jobs work with **no LLM key**.

```text
  YAML suite
       │
       ▼
  orchestrator ──► scope (allowlist) + budget (time / LLM / USD)
       │
       ├── e2e        Playwright  (LLM optional; saved-script fallback)
       ├── api        fetch
       ├── a11y       axe-core WCAG A/AA
       └── security   passive / read-only only
       │
       ▼
  output/report.html + report.json + junit.xml
```

Pitch: *The testing agent another AI is allowed to call on every PR — stays on your domain, caps cost, fails the PR on broken flows, APIs, accessibility, and security headers, without becoming a pentest tool.*

---

## Locked stack (do not change unless PRODUCT.md changes)

| Decision | Lock |
|---|---|
| Name | GoLiveCheck |
| npm package | `golivecheck-agent` (avoid TYPO3 `golive-check`) |
| CLI | `golivecheck` |
| Language | TypeScript |
| Browser | Playwright |
| A11y | axe-core, WCAG A/AA; fail on `serious` / `critical` |
| Security | Passive / read-only. No exploits, Nuclei attack templates, XSS/SQLi payloads |
| License | MIT |
| Default demo | Localhost only |

---

## Phase 0 — Spec (done)

- [x] Name, MIT, walls (no pentest, no mobile, no SaaS)
- [x] Four job types defined
- [x] Agent / SKILL / PRODUCT files so another AI can implement without guessing
- [x] CodeRabbit config

**Exit:** a stranger can read this repo and know what to build. **Met.**

---

## Phase 1 — Runnable v0 (next)

**Goal:** `npm run demo` writes `output/report.html` with **all four** job types.

Build at **this repo root**. Match the tree in [AGENTS.md](./AGENTS.md). Do not invent a different layout.

Coding order is the table in [PLAN.md](./PLAN.md). Expanded work packages below — finish one before starting the next.

### 1.1 Package and demo shop

Create:

- `package.json` (`golivecheck-agent`), `tsconfig.json`, `.gitignore`
- Playwright + TypeScript toolchain
- `examples/demo-site/` — tiny shop: home, product, cart, `GET /api/products`
- `examples/suites/shop.yaml` — four jobs against `http://127.0.0.1:4173`

**Done when:** the demo site serves a page; YAML exists even if the runner does not.

### 1.2 YAML loader + orchestrator

Create: `src/types.ts`, `src/orchestrator.ts`

- Load suite YAML
- Run jobs in order (or `--only`)
- Collect results; never hang forever

**Done when:** a stub plugin is called once per job.

### 1.3 Security + a11y + api (no LLM)

Create: `src/plugins/security.ts`, `src/plugins/a11y.ts`, `src/plugins/api.ts`

Security (read-only, allowlisted host only) — exactly the PRODUCT.md list:

- HTTPS (localhost exception)
- HSTS, `X-Content-Type-Options: nosniff`
- `X-Frame-Options` or CSP `frame-ancestors`
- CSP present (warn if missing)
- Session-like cookies: `Secure` + `HttpOnly`
- CORS: fail `*` + credentials
- `/.env` and `/.git/HEAD` should 404
- Mixed content
- noisy `Server` banner = info

A11y: axe-core in the page, WCAG A/AA, fail on serious/critical.

API: HTTP `fetch`, `expectStatus`, optional JSON path.

**Done when:**

```bash
npx golivecheck-agent run --only security,a11y,api
# works with no OPENAI_API_KEY
```

**Never cut this slice.**

### 1.4 E2E (LLM optional)

Create: `src/plugins/e2e.ts`, `src/llm/client.ts`, `src/llm/planner.ts`

- English steps → Playwright
- LLM may only return JSON actions: `goto`, `click`, `fill`, `press`, `wait`, `screenshot`
- Prefer ARIA / accessibility snapshot, not raw DOM
- No API key → saved-script fallback for the demo flow

**Done when:** demo “open product, add to cart” passes with the fallback.

### 1.5 Allowlist + budget

Create: `src/scope.ts`, `src/budget.ts`

- Every navigation and HTTP call goes through the allowlist
- Off-domain = hard fail `SCOPE_VIOLATION` (exit 2)
- Honor `maxMinutes`, `maxLlmCalls`, `maxUsd`
- Over budget → **stop and write a partial report**, do not hang

**Done when:** unit tests in PLAN.md for scope + budget pass.

### 1.6 Report

Create: `src/report/writer.ts`

Write `output/report.html`, `report.json`, `junit.xml`, screenshots.

**Done when:** opening the HTML shows four job sections (pass or fail).

### 1.7 CLI

Create: `src/cli.ts`

Commands: `init`, `run`, `report` (and `mcp` stub if MCP is cut).

**Done when:** README two-minute path works against the demo site.

### 1.8 GitHub Action + MCP (cut last)

Create: `action.yml`, `.github/workflows/ci.yml`, `src/mcp/server.ts`

MCP tools: `run_suite`, `get_last_report`, `list_findings`.

**If time is short:** cut MCP first, then video. **Never** cut security / a11y / API.

### 1.9 Tests + CI without secrets

Tests that **must** exist (from PLAN.md):

1. Scope rejects `https://evil.com` when allowlist is demo
2. Security flags missing `X-Content-Type-Options` on a fixture
3. A11y fails an image with no `alt`
4. API fails on 500
5. Orchestrator writes JUnit with four testcases
6. Budget stops after `maxLlmCalls`

**Phase 1 exit:**

```bash
npm test
npm run demo
# open output/report.html — e2e, api, a11y, security all present
npx golivecheck-agent run --only security,a11y   # no OPENAI_API_KEY
```

Exit codes: `0` all passed · `1` functional / a11y / security failed · `2` scope / budget / config error.

Keep `IDEA.md`, `AGENTS.md`, `SKILL.md`, `PRODUCT.md`, `PLAN.md`, and this file at repo root when `src/` lands.

---

## Phase 2 — Usable by a real app

**Goal:** one real staging URL + CI + another AI can call us.

- Point `golivecheck.config.yaml` (or the suite YAML) at a **site you own**
- Env vars for test login (never commit secrets)
- GitHub Action on PRs: default `--only security,a11y,api`
- Finish MCP + Cursor snippet in README
- Fix false a11y / header / flaky E2E from the real site
- Action must require an allowlist / target input (PRODUCT.md)

**Exit:** a PR on that app fails when a11y / security / API is red; Cursor can `run_suite`.

Tag when this is true: **v1** (CI+MCP alone can be **v0.1**).

---

## Phase 3 — Cheaper second runs

**Goal:** AI once, deterministic after.

- Save E2E action JSON from a successful run
- Emit a Playwright spec (`output/replay/*.spec.ts`)
- Optional: OpenAPI → extra GET smokes
- Optional: video / HAR in the evidence pack

**Exit:** second run of the same flow can skip the LLM when replay exists.

Tag: **v1.1**

---

## Phase 4 — Publish

- npm package `golivecheck-agent`
- GitHub Action: Marketplace or `uses: seethinajayadileep/golivecheck@v1`
- Short demo GIF / 60s clip in README
- `SKILL.md` install notes for Claude / Cursor

**Exit:** `npx golivecheck-agent init` works in an empty folder.

Tag: **v2**

---

## Release tags

| Tag | Meaning |
|---|---|
| **v0** | Demo site + four plugins + report + tests; three plugins need no secrets |
| **v0.1** | CI Action + MCP |
| **v1** | Works on one real customer URL |
| **v1.1** | Replay spec |
| **v2** | Published on npm |

---

## Later (only after Phase 2)

Do **not** start these in v0:

| Idea | Why later |
|---|---|
| Self-heal memory across days | Need a working gate first |
| Visual screenshot baseline | Extra flake + storage |
| Native mobile / desktop | Out of walls |
| Nuclei / exploit pentest | Out of PRODUCT.md |
| Dashboard / scheduler / email | SaaS; not v0 |
| Multi-model consensus | Cost; not our wedge |

---

## Rules for every phase

- Stay on the allowlist
- Security stays read-only
- `npm test` never requires an LLM key
- Only scan systems you own or have permission to test
- Default demo binds localhost
- If a change is not in PRODUCT.md, do not build it
- Do not mix an unrelated app (PII redaction, etc.) into this package

---

## Next action

Start **Phase 1.1**: `package.json`, TypeScript, Playwright, tiny demo shop, `examples/suites/shop.yaml`.
