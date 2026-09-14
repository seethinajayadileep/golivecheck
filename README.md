# GoLiveCheck

A testing agent another AI or a developer can call **before shipping**.

Point it at a site you own. In one run it checks:

1. User flow (English steps, optional AI)
2. API smoke
3. Accessibility (WCAG)
4. Safe security (headers, cookies, CORS — **no hacking**)

Then it writes **one report**: pass / fail and what to fix.

**Only scan systems you own or have permission to test.**

---

## Status

Spec first. Application code is not in this repo yet. Implementers follow [PLAN.md](./PLAN.md) without breaking [IDEA.md](./IDEA.md) walls.

```bash
# v0 (planned)
npx golivecheck-agent run
npx golivecheck-agent run --only security,a11y
npx golivecheck-agent report
```

---

## Read these if you are an AI

| File | Read when |
|---|---|
| [IDEA.md](./IDEA.md) | First. What we are building, who it is for, walls. |
| [AGENTS.md](./AGENTS.md) | You will **implement or change** this repo. |
| [SKILL.md](./SKILL.md) | You will **run** GoLiveCheck for a user (CLI or MCP). |
| [PRODUCT.md](./PRODUCT.md) | Features, uniqueness, what we will not build. |
| [PLAN.md](./PLAN.md) | Build order for v0. |

Do not invent extra product scope. If IDEA.md and the user disagree, **ask** — do not expand into pentest, mobile, or SaaS.

---

## CodeRabbit auto review

Config lives in [`.coderabbit.yaml`](./.coderabbit.yaml) (`reviews.auto_review.enabled: true`).

That file does **not** install the bot. You still have to add the GitHub App to this repo. Steps: [CODERABBIT.md](./CODERABBIT.md).

---

## License

[MIT](./LICENSE)
