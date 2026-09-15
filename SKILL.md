# Skill: GoLiveCheck

Use this when you are an AI **helping a user test their own site**, not when you are implementing the GoLiveCheck source.

Also see `IDEA.md` if you need the product idea.

---

## When to use

Use GoLiveCheck when the user wants to know if a site is **safe to ship**:

- main user flows still work
- API still answers
- accessibility (WCAG)
- basic security headers / cookies / CORS

Use it before merge, after a UI change, or when they say “test this URL”.

---

## When not to use

- Unit tests, load tests, or performance benchmarks
- Real penetration testing, exploits, bug bounty hunting
- Scanning a site they do **not** own or did not allowlist
- Native mobile / desktop apps

If they ask to “hack” or scan a third party, **refuse** and explain GoLiveCheck is allowlisted and read-only.

---

## How to install (Claude / Cursor)

```bash
npx golivecheck-agent init
npx playwright install chromium
npx golivecheck-agent run --only security,a11y,api
npx golivecheck-agent report
```

Claude: keep this `SKILL.md` in the project (or the user's skills folder).

Cursor MCP (published package): [examples/cursor-mcp.json](./examples/cursor-mcp.json) — `npx -y golivecheck-agent mcp`. From a clone of this repo: [examples/cursor-mcp.local.json](./examples/cursor-mcp.local.json).

---

## How to run

Config file: `golivecheck.config.yaml` (or `golivecheck.yaml`).

```bash
npx golivecheck-agent run
npx golivecheck-agent run --only security,a11y
npx golivecheck-agent report
```

Or MCP tools:

- `run_suite` — `{ target, allow, suitePath?, types? }` (`target` and `allow` required)
- `get_last_report` — summary + `output/report.html` / `report.json` paths
- `list_findings` — `{ severity? }`

---

## Required inputs

- Target URL they own, or localhost
- Allow list (default: host of `target`)
- `OPENAI_API_KEY` **only** if they want English E2E (optional)

Cheap gate (no key): `--only security,a11y,api`

After a passing E2E run, replay files land in `output/replay/`. A second run of the same job uses that JSON and does not call the LLM.

Login without an LLM: quoted suite steps `"Fill #email with ${GOLIVECHECK_USER}"` / `"Fill #password with ${GOLIVECHECK_PASSWORD}"` / `"Click #login-submit"` (quote CSS `#ids` so YAML does not treat `#` as a comment). Cursor MCP config: `examples/cursor-mcp.json`.

---

## What to tell the user

- Pass/fail per job (e2e, api, a11y, security)
- Critical a11y and security findings + how to fix
- Path to `output/report.html`
- If the run hit **budget** or **scope lock**, say that clearly
- Do **not** invent findings that are not in `report.json`

---

## Never

- Point GoLiveCheck at a host not on the allowlist
- Ask it to exploit, brute-force, or scan third-party sites
- Pretend it replaced Midscene (GUI) or Strix (pentest)
- Claim it ran checks that were not in the suite

---

## One-line reminder

GoLiveCheck is a scoped testing agent: run it on a URL they own; it checks flow, API, accessibility, and security headers; read `output/report.json`; do not use it to attack or to leave the allowlist.
