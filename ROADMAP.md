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
| Application code | **Phase 4 publish** on branch `phase4-publish` |
| CI | **Green** locally — `npm test` + `npm run demo` |
| Next | Tag `v1` + `npm publish` (needs npm login; see `examples/github/publish.md`) |

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

1. [x] `package.json`, TypeScript, Playwright, tiny demo shop
2. [x] YAML loader + orchestrator
3. [x] **security + a11y + api** (no LLM key)
4. [x] E2E English → Playwright (LLM optional; saved-script fallback)
5. [x] Allowlist + budget cap
6. [x] HTML + JSON + JUnit report
7. [x] CLI: `init` / `run` / `report`
8. [x] GitHub Action + MCP (`run_suite`, `get_last_report`, `list_findings`)
9. [x] Unit tests exist; **`.github/workflows/ci.yml`** (`npm test` + `npm run demo`, no secrets)

**Cut if needed:** MCP, then video. **Never cut** security / a11y / API.

**Exit:**

```bash
npm test
npm run demo
# open output/report.html — e2e, api, a11y, security all present
npx golivecheck-agent run --only security,a11y   # works with no OPENAI_API_KEY
```

---

## Phase 2 — Usable by a real app (done)

Goal: one real URL + CI + another AI can call us.

- [x] `${VAR}` in suite YAML (target / login) — `GOLIVECHECK_TARGET`, `GOLIVECHECK_USER`, `GOLIVECHECK_PASSWORD`
- [x] Point a suite at an owned host — `examples/suites/www.yaml` (`https://www.seethinajayadileep.dev`). Default `golivecheck.config.yaml` stays localhost so CI/demo do not hit the live site
- [x] Env vars for test login (Fill/Click steps, no LLM)
- [x] GitHub Action example for PRs (`--only security,a11y,api` by default)
- [x] MCP + Cursor snippet in README
- [x] First real-site run on `www.seethinajayadileep.dev`: API passed; security and a11y failed on real issues (missing nosniff / frame headers; html lang, link names, svg alt). Not false positives. Exit code 1 — the cheap gate is red.
- [x] Consumer-app PR: [seethinajayadileep/portfolio_website#1](https://github.com/seethinajayadileep/portfolio_website/pull/1) (suite + workflow copy). Cursor MCP `run_suite` is in this repo.

**GitHub note:** this App cannot write `.github/workflows/*`. Copy `.github/golivecheck.yml` → `.github/workflows/golivecheck.yml` on the site PR if you want GitHub Actions to fail the PR automatically. The CLI/MCP gate already fails without that copy.

**Exit (met):** a run against that app is red when a11y/security/API fail; Cursor can `run_suite`.

---

## Phase 3 — Cheaper second runs (required done)

Goal: AI once, deterministic after.

- [x] Save E2E action JSON from a successful run (`output/replay/<job>.json`)
- [x] Emit a Playwright spec (`output/replay/<job>.spec.ts`)
- [x] Second run of the same flow skips the LLM when that JSON exists
- [ ] Optional: OpenAPI → extra GET smokes
- [ ] Optional: video / HAR in the evidence pack

**Exit:** second run of the same flow can skip the LLM when replay exists.

---

## Phase 4 — Publish (required done)

- [x] npm package `golivecheck-agent` (version `1.0.0`, public; `npx golivecheck-agent init` from packed bin)
- [x] GitHub Action pin `uses: seethinajayadileep/golivecheck@v1` (create the `v1` tag after merge — [examples/github/publish.md](./examples/github/publish.md))
- [x] Short demo clip in README (`docs/demo.svg` — screenshot of `npm run demo`)
- [x] `SKILL.md` install notes for Claude / Cursor

**Exit:** `npx golivecheck-agent init` works in an empty folder (verified from `npm pack`).

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
