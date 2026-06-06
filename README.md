# daana-inventory

Generic inventory management platform. **DaanaRX MASS** (clinic medication management) is the first domain pack riding on top of this engine.

## Architecture

The codebase follows a **core engine + domain pack** pattern:

- **`@daana-health/inventory-core`** — generic, domain-agnostic engine. Types, status state machine, FEFO sorting, pluggable code generators, and a validator registry. Zero domain assumptions.
- **`@daana-health/inventory-react`** — generic, schema-driven React UI (forms, tables, cart, search). Consumes `inventory-core`. Peer-depends on React 18 or 19.
- **`@daana-health/domain-mass`** — first domain pack. Wires the engine for medication inventory: DRX code template, MASS attribute schema, classification rules, label renderer.
- **`apps/dashboard`** — internal status dashboard (live; not modified by scaffolding).

Future domain packs (e.g. `@daana-health/domain-veterinary`, `@daana-health/domain-lab-supplies`) plug into the same core without touching it.

## Packages

| Package | Path | Role |
| --- | --- | --- |
| `@daana-health/inventory-core` | `packages/inventory-core` | Generic engine |
| `@daana-health/inventory-react` | `packages/inventory-react` | Generic React UI |
| `@daana-health/domain-mass` | `packages/domain-mass` | MASS Clinic domain pack |
| `daana-inventory-dashboard` | `apps/dashboard` | Agent status dashboard |

## Workspace conventions

- **npm scope:** `@daana-health` (private GitHub Packages registry).
- **Local linking:** `workspace:*` protocol via pnpm workspaces. No need to publish during dev.
- **TS config:** shared `tsconfig.base.json` at the root; each package extends it and uses project references so `tsc -b` builds in dependency order.
- **Module system:** ESM only (`"type": "module"`). Imports use explicit `.js` extensions for NodeNext/Bundler resolution.

## Commands

```bash
pnpm install         # install all workspaces
pnpm -r typecheck    # typecheck every package
pnpm -r build        # build every package
pnpm dashboard       # launch the status dashboard
```

## Local dev vs. published packages

Inside this monorepo, the three publishable packages reference one another via
the pnpm `workspace:*` protocol. That means `pnpm install` symlinks them
locally and **contributors do not need any GitHub Packages token to develop**.
The `.npmrc` at the repo root only takes effect when actually publishing or
when installing `@daana-health/*` from *outside* the monorepo (e.g. on a
Render build of `DaanaRx-Backend`).

When changesets bumps versions, the `workspace:*` ranges are rewritten to the
real published version at publish time — there is nothing to change manually.

## Publishing

The three packages — `@daana-health/inventory-core`,
`@daana-health/inventory-react`, and `@daana-health/domain-mass` — publish to
**GitHub Packages** under the `daana-health` org.

### One-time setup (org owner)

1. Create the GitHub org `daana-health` (it does not exist yet — until it does,
   the workflow below will 401 on publish).
2. Move this `daana-inventory` repo under the `daana-health` org (or any repo
   inside the org that owns the workflow). The default `GITHUB_TOKEN` needs
   `write:packages` permission, granted via the workflow's
   `permissions: packages: write` block (already configured).
3. No additional secrets are required for the publish workflow — it uses
   `GITHUB_TOKEN` automatically.

### Consumer setup (any repo that installs `@daana-health/*`)

Add a `.npmrc` next to that repo's `package.json`:

```
@daana-health:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_AUTH_TOKEN}
```

…and set `NPM_AUTH_TOKEN` in the environment (locally or on Render) to a
GitHub Personal Access Token with `read:packages` scope. On Render, declare
`NPM_AUTH_TOKEN` as a service env var (`sync: false`).

### Release flow

1. Make a change to a package and run `pnpm changeset` from the repo root.
   Pick the affected packages and bump type (`patch` / `minor` / `major`),
   write a short summary, commit the generated `.changeset/*.md` alongside
   your code.
2. Open the PR. CI (`.github/workflows/ci.yml`) runs `pnpm install`,
   `pnpm -r build`, and `pnpm -r typecheck` against `packages/**`.
3. Merge the PR. A second "Version Packages" PR will collect pending
   changesets and bump `packages/*/package.json` versions (run
   `pnpm version-packages` locally, or wire the `changesets/action` GitHub
   Action later — the workflow file is intentionally minimal for now).
4. Merging the version-bump PR triggers `.github/workflows/publish.yml`,
   which builds and runs `pnpm publish --filter <name> --no-git-checks
   --access restricted` for each affected package.

### Local manual publish (emergency only)

```bash
export GITHUB_TOKEN=<PAT with write:packages>
pnpm -r --filter "./packages/*" build
pnpm changeset publish
```

Avoid this once CI is the source of truth — it's here for the bootstrap
period before the org/secrets are wired up.
