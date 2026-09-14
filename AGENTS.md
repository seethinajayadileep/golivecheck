# AGENTS.md — implementing GoLiveCheck

You are working **inside this project**. Follow `IDEA.md` first, then [ROADMAP.md](./ROADMAP.md). This file is how to build and change it.

---

## What this repo is

GoLiveCheck is a testing agent. One YAML suite runs four job types:

| Type | Engine | Needs LLM? |
|---|---|
| `e2e` | Playwright + optional LLM | Optional |
| `api` | HTTP `fetch` | No |
| `a11y` | axe-core in the page | No |
| `security` | Passive header/cookie/CORS/path checks | No |

---

## Planned layout (create this, do not invent a different tree)

```
.
  README.md
  LICENSE                 # MIT
  ROADMAP.md
  PLAN.md
  package.json
  tsconfig.json
  action.yml
  .github/workflows/ci.yml
  AGENTS.md
  IDEA.md
  SKILL.md
  examples/
    demo-site/
    suites/shop.yaml
  src/
    cli.ts
    orchestrator.ts
    types.ts
    scope.ts              # allowlist — never skip
    budget.ts
    llm/client.ts
    llm/planner.ts
    plugins/e2e.ts
    plugins/api.ts
    plugins/a11y.ts
    plugins/security.ts
    report/writer.ts
    mcp/server.ts
  tests/
```

This workspace may still only contain **spec markdown**. If code is missing, implement Phase 1 from [PLAN.md](./PLAN.md) / [ROADMAP.md](./ROADMAP.md). If code exists, match this layout.

---

## Commands (v0)

```bash
npm install
npm run demo              # demo site + full suite
npm test                  # MUST pass without OPENAI_API_KEY
npx golivecheck-agent run
npx golivecheck-agent run --only security,a11y
npx golivecheck-agent report
npx golivecheck-agent mcp
```

---

## Rules

- Security plugin is **read-only**. No payloads, no port scans, no brute force, no XSS/SQLi strings.
- Every navigation and HTTP call must pass **scope.ts** allowlist. Off-domain = hard fail `SCOPE_VIOLATION`.
- **Do not** add a SaaS, dashboard, mobile runner, or auto-fix PRs unless the user asks.
- E2E LLM is optional. CI and `npm test` stay green with no API key. Demo E2E may use a saved script fallback.
- Keep the public surface: `init`, `run`, `report`, `mcp`.
- Stack: **TypeScript + Playwright**. Do not switch to Python unless the user asks.
- Budget: honor `maxMinutes`, `maxLlmCalls`, `maxUsd`. Abort with a **partial report**, do not hang.

---

## Security plugin — allowed checks only

HTTPS, HSTS, `X-Content-Type-Options`, `X-Frame-Options` / CSP `frame-ancestors`, CSP present, cookie `Secure`+`HttpOnly`, CORS `*` + credentials, `/.env` `/.git/HEAD` return 404, mixed content, noisy `Server` banner (info).

Nothing else without a spec change in `PRODUCT.md`.

---

## YAML shape (do not replace with Gherkin)

```yaml
name: demo-shop
target: http://127.0.0.1:4173
allow:
  - 127.0.0.1
budget:
  maxMinutes: 8
  maxLlmCalls: 15
jobs:
  - type: e2e
    name: buy-one-item
    startUrl: /
    steps:
      - Open the first product
      - Add it to the cart
    assert:
      - The cart is not empty
  - type: api
    name: products-api
    requests:
      - { method: GET, path: /api/products, expectStatus: 200 }
  - type: a11y
    name: home
    url: /
    tags: [wcag2aa]
  - type: security
    name: baseline
    url: /
```

`${VAR}` in any suite string expands from the environment (`GOLIVECHECK_TARGET`, `GOLIVECHECK_USER`, `GOLIVECHECK_PASSWORD`). Missing vars fail the run.

E2E assertions: `The cart is not empty` or `The page contains …`. Fill/Click/Open/Wait/Press steps run without an LLM. Quote CSS `#ids` in YAML so `#` is not a comment.

---

## E2E LLM contract

LLM may only return JSON actions. Allowlisted ops: `goto`, `click`, `fill`, `press`, `wait`, `screenshot`.

Prefer Playwright accessibility snapshot. Do not send huge raw DOM.

---

## Done

A change is done when:

- `npm test` passes without secrets
- `npm run demo` still writes `output/report.html` with all four job types (once code exists)
- You did not violate `IDEA.md` walls
- You did not add exploits or off-domain calls

---

## Do not

- Explain the idea by comparing Midscene/Strix in code comments
- Install Kali / Nuclei exploit templates
- Require an LLM key for a11y, API, or security
- Mix this product into unrelated tools (e.g. PII redaction) in the same package
- Skip ROADMAP phases (no npm publish before a working demo)
