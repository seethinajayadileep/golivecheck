# ROADMAP — GoLiveCheck

How we build the product. Read [IDEA.md](./IDEA.md) and [PRODUCT.md](./PRODUCT.md) first.  
Day-1 coding order is in [PLAN.md](./PLAN.md). This file is the **whole path**, not only v0.

Do not skip a phase. Do not pull later-phase work into an earlier one.

---

## Status now

| Item | State |
|---|---|
| Product spec | Done (`IDEA`, `AGENTS`, `SKILL`, `PRODUCT`, `PLAN`) |
| CodeRabbit | Installed. Public repo < 10 stars → trigger with `@coderabbitai review` |
| Application code | **Not started** |

---

## Phase 0 — Spec (done)

- [x] Name, MIT, walls (no pentest, no mobile, no SaaS)
- [x] Four job types defined
- [x] Agent/SKILL files so another AI can implement without guessing

**Exit:** a stranger can read this repo and know what to build.

---

## Phase 1 — Runnable v0 (first code)

Goal: `npm run demo` writes `output/report.html` with **all four** job types.

Build in this order (same as [PLAN.md](./PLAN.md)):

1. `package.json`, TypeScript, Playwright, tiny demo shop
2. YAML loader + orchestrator
3. **security + a11y + api** (no LLM key)
4. E2E English → Playwright (LLM optional; saved-script fallback)
5. Allowlist + budget cap
6. HTML + JSON + JUnit report
7. CLI: `init` / `run` / `report`
8. GitHub Action + MCP (`run_suite`, `get_last_report`, `list_findings`)
9. Unit tests; CI green without secrets

**Cut if needed:** MCP, then video. **Never cut** security / a11y / API.

**Exit:**

```bash
npm test
npm run demo
# open output/report.html — e2e, api, a11y, security all present
npx golivecheck-agent run --only security,a11y   # works with no OPENAI_API_KEY
```

---

## Phase 2 — Usable by a real app

Goal: one real staging URL + CI + another AI can call us.

- Point `golivecheck.config.yaml` at a site you own
- Env vars for test login
- GitHub Action on PRs (`--only security,a11y,api` by default)
- Finish MCP + Cursor snippet in README
- Fix false a11y / header / flaky E2E from the real site

**Exit:** a PR on that app fails when a11y/security/API is red; Cursor can `run_suite`.

---

## Phase 3 — Cheaper second runs

Goal: AI once, deterministic after.

- Save E2E action JSON from a successful run
- Emit a Playwright spec (`output/replay/*.spec.ts`)
- Optional: OpenAPI → extra GET smokes
- Optional: video / HAR in the evidence pack

**Exit:** second run of the same flow can skip the LLM when replay exists.

---

## Phase 4 — Publish

- npm package `golivecheck-agent`
- GitHub Action on Marketplace (or `uses: seethinajayadileep/golivecheck@v1`)
- Short demo GIF / 60s clip in README
- `SKILL.md` install notes for Claude / Cursor

**Exit:** `npx golivecheck-agent init` works in an empty folder.

---

## Later (only after Phase 2)

Do **not** start these in v0:

| Idea | Why later |
|---|---|
| Self-heal memory across days | agent-qa already owns this; we need a working gate first |
| Visual screenshot baseline | Extra flake + storage |
| Native mobile / desktop | Midscene’s job |
| Nuclei / exploit pentest | Out of PRODUCT.md walls |
| Dashboard / scheduler / email | SaaS; not v0 |
| Multi-model consensus | Passmark’s job; cost |

---

## What “done” means per release

| Tag | Meaning |
|---|---|
| **v0** | Demo site + four plugins + report + tests, no secrets required for three plugins |
| **v0.1** | CI Action + MCP |
| **v1** | Works on one real customer URL |
| **v1.1** | Replay spec |
| **v2** | Published on npm |

---

## Rules for every phase

- Stay on the allowlist
- Security stays read-only
- `npm test` never requires an LLM key
- If a change is not in PRODUCT.md, do not build it
