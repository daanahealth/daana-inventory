# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).
You can find the full documentation for it [in its repo](https://github.com/changesets/changesets).

## How to add a changeset

When you make a change to one of the publishable packages
(`@daana-health/inventory-core`, `@daana-health/inventory-react`,
`@daana-health/domain-mass`), add a changeset describing the change:

```bash
pnpm changeset
```

Pick which packages changed and whether the bump is `patch`, `minor`, or `major`.
A markdown file will be written into this folder — commit it with your change.

## How the release flow works

1. PRs land on `main` with one or more `.changeset/*.md` files.
2. The "Version Packages" PR (opened by the changesets GitHub Action, or
   produced locally via `pnpm changeset version`) bumps each affected
   `packages/*/package.json` and consumes the changeset markdown files.
3. Merging that PR into `main` updates the version fields. The
   `.github/workflows/publish.yml` workflow watches for those bumps and
   publishes the affected packages to GitHub Packages.

## Notes

- `@daana-health/dashboard` is in the `ignore` list — it's an internal app,
  not a published package.
- `access` is `restricted` because GitHub Packages does not support public
  npm provenance for private orgs the way npmjs.com does. See each
  package's `publishConfig` for the registry override.
- Local development never publishes — `workspace:*` symlinks handle linking
  inside the monorepo.
