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

Spec first. Application code is not in this repo yet.

- Build path: [ROADMAP.md](./ROADMAP.md)
- Day-1 coding order: [PLAN.md](./PLAN.md)
- Product walls: [IDEA.md](./IDEA.md)

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
| [ROADMAP.md](./ROADMAP.md) | Phases from spec → v0 → real app → npm. |
| [PLAN.md](./PLAN.md) | Exact day-1 build order. |
| [AGENTS.md](./AGENTS.md) | You will **implement or change** this repo. |
| [SKILL.md](./SKILL.md) | You will **run** GoLiveCheck for a user (CLI or MCP). |
| [PRODUCT.md](./PRODUCT.md) | Features, uniqueness, what we will not build. |

Do not invent extra product scope. If IDEA.md and the user disagree, **ask** — do not expand into pentest, mobile, or SaaS.

---

## CodeRabbit auto review

Config lives in [`.coderabbit.yaml`](./.coderabbit.yaml) (`reviews.auto_review.enabled: true`).

Public repo with under 10 stars: comment `@coderabbitai review` on each PR. Setup: [CODERABBIT.md](./CODERABBIT.md).

---

## License

[MIT](./LICENSE)
