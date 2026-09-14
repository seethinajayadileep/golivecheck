# IDEA — GoLiveCheck

Read this first. This is the product. Code must match this file.

---

## One sentence

Build a testing agent, not a chatbot. The user points it at a site they own. It runs four jobs — user flow, API, accessibility, safe security — then writes a report. It must not leave their domain or attack anything. Other AIs should be able to call it.

---

## Job

The user gives a website they own. GoLiveCheck acts like a careful tester plus a safety inspector.

In **one run** it checks:

1. Can a person still complete the main flow? (English steps)
2. Is the API still up?
3. Is the page accessible (WCAG)?
4. Are basic security doors locked? (headers, cookies, CORS — **no hacking**)

**Output:** one report (HTML + JSON + JUnit): pass/fail and what to fix.

---

## Who it is for

- Developers and QA on their own staging URL
- **AI-tool teams** who want one agent their coding assistant can call

Not a QA platform. Not a pentest tool. Not a replacement for unit tests.

---

## Why this exists

Other tools either only click the UI or try to hack the site.

GoLiveCheck is the safe **“is it OK to ship?”** agent:

- four checks
- stay on this domain
- cap cost
- callable from Cursor / CI / MCP

---

## Walls (do not violate)

- Only hosts on the **allowlist**
- Security is **read-only** — no exploits, no scanning other people, no Nuclei attack templates
- A11y / API / security must work **with no AI key**
- No mobile, no desktop, no SaaS, no dashboard on v0
- No Gherkin-only UX — YAML + English
- Do not clone Midscene, Strix, or Hercules. Same *job*, smaller surface.

---

## Success (v0)

A stranger can:

1. Clone / install
2. `npm run demo`
3. Open `output/report.html`
4. See **all four** job types
5. Run `--only security,a11y` with **no** `OPENAI_API_KEY`

---

## Name

- Product: **GoLiveCheck**
- GitHub: `seethinajayadileep/golivecheck` (npm package name can stay `golivecheck-agent` so it does not collide with TYPO3 `golive-check`)
- Command: `golivecheck`

Do not rename while implementing unless the user asks.
