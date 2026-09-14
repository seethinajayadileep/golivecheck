# PRODUCT — what we provide

If a feature is not in this file, **do not build it** for v0.

---

## Features (v0)

### 1. End-to-end (user flow)
English steps, e.g. “Log in, add a product, go to checkout.”  
Playwright. Optional LLM. No LLM → demo uses a saved script.

### 2. API smoke
HTTP checks (`expectStatus`, optional JSON path).  
Optional later: OpenAPI → GET smokes. Not required for first demo.

### 3. Accessibility
axe-core, WCAG A/AA. Fail on `serious` / `critical`.

### 4. Safe security (not hacking)
Read-only, allowlisted host only:

- HTTPS (localhost exception)
- HSTS, `X-Content-Type-Options: nosniff`
- `X-Frame-Options` or CSP `frame-ancestors`
- CSP present (warn if missing)
- Session-like cookies: `Secure` + `HttpOnly`
- CORS: fail `*` + credentials
- `/.env`, `/.git/HEAD` should 404
- Mixed content
- `Server` version leak = info

### 5. One YAML suite
All jobs in one file. `--only e2e,api,a11y,security`

### 6. Safety rails
- **Allowlist** — leaving the domain fails the run
- **Budget** — max minutes, max LLM calls, max USD estimate; partial report on abort

### 7. Evidence
`output/report.html`, `report.json`, `junit.xml`, screenshots; video/HAR optional

### 8. Three entry points
CLI · GitHub Action · MCP (`run_suite`, `get_last_report`, `list_findings`)

---

## Unique (why this, not another agent)

We are **not** trying to beat Midscene at GUI or Strix at pentest.

We are the **one agent an AI product is allowed to call** on every PR:

- four gates in one call
- no exploits
- three of four jobs need no LLM
- domain lock + spend cap
- MCP-first

Pitch: *The testing agent you can give to another AI: it stays on your domain, caps cost, and fails the PR on broken flows, APIs, accessibility, and security headers — without turning into a pentest tool.*

---

## Out of v0 (later backlog)

- Native mobile / desktop / extensions
- Self-heal memory across days
- Multi-model consensus assertions
- Autonomous pentest / auto-fix PRs
- Visual screenshot baseline
- Scheduler + email product
- Requirements → test-case platform
- Deterministic Playwright replay **file** (stub action JSON is OK)

---

## Competitors (do not copy their scope)

| Tool | They own | We do not copy |
|---|---|---|
| Midscene | Best vision GUI | Android/iOS/desktop |
| Strix | Real pentest | Exploits, red team |
| Hercules | Gherkin UI+API+Nuclei+a11y | Gherkin, Nuclei exploits |
| Passmark | Cache + consensus | Redis + FSL |
| agent-qa | Memory + heal | Multi-day memory |

---

## License and ethics

- MIT
- README must say: only scan systems you own
- Default demo binds localhost
- GitHub Action must require an allowlist / target input
