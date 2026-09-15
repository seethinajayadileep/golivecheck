# Publish notes (copy-paste)

This App cannot write `.github/workflows/*`. After merge to `main`:

## npm

```bash
npm login
npm publish --access public
```

Package name: `golivecheck-agent`. Then `npx golivecheck-agent init` works in an empty folder.

## GitHub Action pin

```bash
git tag v1.0.0
git tag v1
git push origin v1.0.0 v1
```

Consumers:

```yaml
- uses: seethinajayadileep/golivecheck@v1
  with:
    target: https://www.seethinajayadileep.dev
    allow: www.seethinajayadileep.dev
    only: security,a11y,api
```
