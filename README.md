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
