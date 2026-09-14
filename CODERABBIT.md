# Turn on CodeRabbit auto review

`.coderabbit.yaml` in this repo already sets `reviews.auto_review.enabled: true` (including **draft** PRs).

CodeRabbit will **not** comment until the GitHub App is installed on **this** repository. That step has to be done in the browser while logged in as a repo admin. An agent cannot click “Install” for you.

---

## 1. Install the GitHub App (required)

1. Open [https://github.com/apps/coderabbitai](https://github.com/apps/coderabbitai)
2. Click **Install** (or **Configure** if you already use CodeRabbit)
3. Choose **Only select repositories**
4. Select **`seethinajayadileep/golivecheck`**
5. Approve the permissions

Official GitHub install guide: [CodeRabbit on GitHub.com](https://docs.coderabbit.ai/platforms/github-com)

## 2. Finish CodeRabbit signup

1. Open [https://app.coderabbit.ai](https://app.coderabbit.ai)
2. Sign in with GitHub
3. Confirm `golivecheck` appears in the repository list
4. Leave **Auto-review** on (default)

Free/open-source public repos are typically eligible; check the dashboard if reviews stay silent.

## 3. Prove it works

Open a pull request against `main` (draft is OK — this repo reviews drafts).

You should see:

- a **CodeRabbit** check on the PR
- a review comment / walkthrough

If nothing happens:

- Repo → **Settings → GitHub Apps → CodeRabbit** → confirm this repo is allowed
- On the PR comment: `@coderabbitai review`
- Skip titles that contain `[skip review]`
- Do not add the `do-not-review` label

## 4. Manual commands (any PR)

| Comment | Effect |
|---|---|
| `@coderabbitai review` | Review new commits |
| `@coderabbitai full review` | Review the whole PR again |
| `@coderabbitai pause` | Stop auto reviews on that PR |
| `@coderabbitai resume` | Turn them back on |

## 5. What we already committed

See [`.coderabbit.yaml`](./.coderabbit.yaml):

- auto review **on**
- draft PRs **included**
- extra review rules for `src/scope.ts` and `src/plugins/security.ts` (when code lands)
