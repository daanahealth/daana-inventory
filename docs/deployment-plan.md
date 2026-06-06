# Daana Inventory Platform - Deployment Plan

**Status:** Draft v0.1 (survey-only, no deploys executed)
**Date:** 2026-06-06
**Author:** `deployment` agent
**Scope:** Map current Render deployment state vs. declared IaC, sequence feature-branch
rollouts, document rollback. **Nothing in this document has been executed.**

---

## 0. Constraint encountered

The Render MCP tools (`mcp__render__*`) were **not available** to this agent's
session. The deferred-tools index was searched (`render`, `mcp render`, `onrender`,
`workspace deploy service`) and returned no Render tool schemas — only Supabase,
Excalidraw, shadcn, and Google MCPs are connected.

Consequence: **live Render state is unverified.** Every "live" claim in this
document is inferred from `render.yaml` plus the `*.onrender.com` hostnames it
declares. The user must confirm the live state via the Render dashboard (or
re-run this agent in a session that has the Render MCP attached) before
executing any deploy step.

Action for the user: run the Render dashboard checks listed in
[§9 Open Questions](#9-open-questions) before kicking off [§6 Deploy Sequence](#6-recommended-deploy-sequence).

---

## 1. Current Render state (inferred from IaC + hostnames)

**Workspace name:** *unknown — not retrievable without Render MCP.*

**Inferred services** (from URLs hardcoded in `render.yaml`):

| Service name (Render) | URL | Type | Inferred from |
|---|---|---|---|
| `daanarx-api-gateway` | (root) | web | render.yaml gateway entry |
| `daanarx-auth-service` | `daanarx-auth-service.onrender.com` | web | gateway env var |
| `daanarx-inventory-service` | `daanarx-inventory-service.onrender.com` | web | gateway env var |
| `daanarx-transaction-service` | `daanarx-transaction-service.onrender.com` | web | gateway env var |
| `daanarx-notification-service` | `daanarx-notification-service.onrender.com` | web | gateway env var |

For each: **last deploy time, current branch SHA, current status (healthy /
deploying / suspended), env var values** — *not retrievable from this session.*
The user must read these off the Render dashboard.

---

## 2. Local IaC state — `DaanaRx-Backend/render.yaml`

Five Node web services declared. All share the same shape:

- `runtime: node`
- `plan: free`
- `region: oregon`
- `branch: main`
- `autoDeploy: true`
- `healthCheckPath: /health`

Per-service deltas:

| Service | buildCommand | startCommand | Port |
|---|---|---|---|
| daanarx-api-gateway | `cd gateway && npm install && npm run build` | `cd gateway && npm start` | 4000 |
| daanarx-auth-service | `cd services/auth && npm install && npm run build` | `cd services/auth && npm start` | 3001 |
| daanarx-inventory-service | `cd services/inventory && npm install && npm run build` | `cd services/inventory && npm start` | 3002 |
| daanarx-transaction-service | `cd services/transaction && npm install && npm run build` | `cd services/transaction && npm start` | 3003 |
| daanarx-notification-service | `cd services/notification && npm install && npm run build` | `cd services/notification && npm start` | 3004 |

### Env vars declared

**Gateway:** `PORT=4000`, `NODE_ENV=production`, `ALLOWED_ORIGINS` (secret),
plus four `*_SERVICE_URL` literals pointing to the four `*.onrender.com`
hostnames listed above.

**All 4 service-tier services share:** `PORT=<svc port>`, `NODE_ENV=production`,
`JWT_SECRET` (secret), `SUPABASE_URL` (secret), `SUPABASE_SERVICE_ROLE_KEY`
(secret), `SUPABASE_ANON_KEY` (secret), `ALLOWED_ORIGINS` (secret).

### Build risk identified

Every service `package.json` declares
`"@daana-health/inventory-core": "file:../../../daana-inventory/packages/inventory-core"`
(and the gateway uses `../../daana-inventory/...`). **Render builds each service
from the DaanaRx-Backend repo in isolation; the `daana-inventory` repo is not
on Render's build filesystem.** Today's `npm install` succeeded locally only
because the worktree-adjacent `daana-inventory` is present at that relative
path. **On Render this `file:` dependency will fail to resolve and break the
build.**

Mitigation options (must be picked before first deploy):

1. **Publish `@daana-health/inventory-core` to npm (or a private registry).**
   Pin every service to the published version. Cleanest.
2. **Vendor the core package into `DaanaRx-Backend/lib/inventory-core` at build
   time** and switch the `file:` dep to point inside the repo. Lower-trust but
   no registry needed.
3. **Add a Render Git submodule for `daana-inventory`** at the expected
   relative path. Render supports submodules; ergonomically the worst of the
   three.

This is a **blocker** for the first deploy. Recommendation: option 2 for the
MVP (zero infra change), migrate to option 1 once the package stabilizes.

---

## 3. Drift report — live vs. declared

Because live state is not readable, **drift items below are predicted, not
observed.** The user should reconcile against the dashboard.

| # | Drift item | Severity | Notes |
|---|---|---|---|
| D1 | `file:` dep to `daana-inventory` will fail on Render build | **Blocker** | See §2 build risk. Will surface as "module not found" on every service. |
| D2 | The legacy Dockerfile at repo root (`FROM node:18-alpine`, single `npm run build`/`npm start`, port 4000) describes a monolithic Apollo server, while `render.yaml` describes 5 Node web services. | High | Likely-stale artifact from the pre-microservices era. Render will *ignore* the Dockerfile because `render.yaml` declares `runtime: node` (not `docker`), but the Dockerfile's existence is confusing and may cause a future maintainer to assume Docker is the deploy path. Recommend: delete or rename to `Dockerfile.legacy`. |
| D3 | Legacy migration `001_daanarx_updates.sql` references tables `lots/drugs/clinics` (old schema). Migration 002 (the new `items/item_types/transactions/...` schema) lives only on `feature/architecture-foundation` and is unapplied. The live Supabase database is therefore on the **legacy schema**, but every backend feature branch was built against the **new schema**. | **Blocker** | Backend services will start but every `/items`, `/carts`, `/reports/*` route will 404/500 against missing tables. Migration 002 must be reviewed and applied before any backend redeploy. |
| D4 | `render.yaml` `branch: main` for all services with `autoDeploy: true`. If any feature branch is merged into `main` without first applying migration 002, **all five services will auto-redeploy at once** against a schema they expect but isn't there. | **Blocker** | Recommend: flip `autoDeploy: false` on all services *before* the first feature-branch merge, re-enable after the first manual rollout is verified. |
| D5 | `ALLOWED_ORIGINS` is `sync: false` (secret-managed) on every service. We have no way to verify it includes the eventual frontend origin. | Medium | User must check dashboard. The frontend isn't deployed yet (see §5), so this likely contains `http://localhost:3000` or similar — must be updated when the frontend deploys. |
| D6 | The legacy backend at `DaanarRX` (Next.js, with its own Apollo server in-process per `next.config.js`) may still be receiving traffic. | Unknown | The Next.js app `transpilePackages` the new `@daana-health/inventory-core`, suggesting the frontend is migrating *toward* the microservices but may still embed an Apollo server today. User to confirm. |

---

## 4. Branch deploy readiness

All five feature branches live in `DaanaRx-Backend`. None has a PR open
(`pr_url: null` in every status file).

| Branch | Owner agent | Status | Touches services | Depends on |
|---|---|---|---|---|
| `feature/architecture-foundation` | architecture-foundation | done | (migrations + shared `lib/`) | — |
| `feature/platform-integration` | be-base-integration | done | all 5 services (adds `file:` dep) | architecture-foundation merged |
| `feature/be-items-api` | be-items-api | done | `services/inventory` | architecture-foundation + migration 002 applied |
| `feature/be-checkout-cart` | be-checkout-cart | done | `services/transaction` (carts) | architecture-foundation + migration 002 applied |
| `feature/be-reports-api` | be-reports-api | done | `services/transaction` (reports) | architecture-foundation + migration 002 applied |

### Per-branch deploy readiness

- **`feature/architecture-foundation`** — Carries `migrations/002_core_inventory_platform.sql`
  (draft, **unapplied**), plus TS contracts and the ADR. **Not deploy-ready
  until the SQL file is reviewed and applied to Supabase** (see §9 Q1). Once
  applied, the branch itself contains no service-runtime code changes, so
  merging it to `main` will not change Render service behavior.
- **`feature/platform-integration`** — Adds the `file:` dep to every service.
  See §2: **this is the change that will break Render builds** until the
  registry/vendoring decision is made. Not deploy-ready as-is.
- **`feature/be-items-api`** — Implements `/items` routes on the inventory
  service against the new schema. Depends on migration 002. Tests pass
  locally. Deploy-ready *after* 002 is applied and platform-integration's
  build problem is fixed.
- **`feature/be-checkout-cart`** — Cart + approval + 24h expiry on the
  transaction service. Same dependency chain as items.
- **`feature/be-reports-api`** — 7 report endpoints on the transaction
  service. Same dependency chain.

---

## 5. Frontend deployment

The frontend lives at `/Users/rithik/Code/DaanarRX` (Next.js 16+ per
`next.config.js`). **It is not declared in any `render.yaml`** and there is
no `vercel.json` / `netlify.toml` at the repo root. The single config hint
is a generic `DEPLOYMENT_CHECKLIST.md` that pre-dates the microservices
migration and references no specific host.

Educated guess: the frontend is **not yet deployed anywhere** for the
microservices era. The Next.js app currently bundles `@daana-health/inventory-core`
via `transpilePackages` — meaning it consumes the contracts directly. It will
need an env var pointing at `daanarx-api-gateway.onrender.com` once deployed.

Recommendations (do **not** execute as part of this plan):
- Most natural fit: **Vercel** (Next.js native). Alternative: Render Static
  Site or Render web service running `next start`.
- Defer frontend deploy until backend microservices are green on Render.
- When deployed, the frontend's public origin must be appended to the
  `ALLOWED_ORIGINS` secret on every Render backend service.

---

## 6. Recommended deploy sequence

Each step has a verification gate. Do not advance until the prior gate passes.

### Step 0 — Pre-flight (user actions, no deploys)

0.1. **In Render dashboard**, for each of the 5 services: confirm existence,
read current branch + last-deploy SHA, snapshot env-var names (not values),
note current health. Record as the "live baseline" before anything changes.

0.2. **In Render dashboard**, flip `autoDeploy: false` on all 5 services
**temporarily**, OR push a one-line edit of `render.yaml` to `main` that
sets `autoDeploy: false` for all services. (Reverts at the end.) This
prevents D4 — accidental cascade redeploy on the first merge.

0.3. **Pick the inventory-core distribution strategy** (§2 options 1/2/3).
The repo cannot deploy on Render without this.

### Step 1 — Apply migration 002 to Supabase

1.1. Review `DaanaRx-Backend/migrations/002_core_inventory_platform.sql` on
the `feature/architecture-foundation` branch.

1.2. Apply via `mcp__supabase__apply_migration` (the Supabase MCP **is**
available in this session for the orchestrator, per §9 advisor warnings in
the ADR).

1.3. **Verify:** run `mcp__supabase__list_tables` and confirm
`item_types`, `locations`, `items`, `transactions`, `carts`, `cart_items`,
`code_counters` all exist. Run `mcp__supabase__get_advisors` and
attach the report to the deploy ticket.

### Step 2 — Merge `feature/architecture-foundation` to `main`

2.1. Squash-merge (or rebase-merge, per repo convention) `feature/architecture-foundation`
into `main`. This brings the migration file + ADR + shared contracts onto
`main` but does **not** change any service runtime code.

2.2. **Verify:** `autoDeploy` is still off → no redeploy should happen.
If `autoDeploy` was left on, all 5 services will redeploy from `main`;
this is harmless because no service code changed, but it eats a free-tier
build minute on each service. Either is acceptable.

### Step 3 — Solve the `file:` dep build problem

3.1. Implement the strategy chosen in step 0.3 on `feature/platform-integration`:
either publish `@daana-health/inventory-core` and bump the deps, or
vendor it into `DaanaRx-Backend/lib/inventory-core` and rewrite the deps.

3.2. Locally run `npm install && npm run build` from a fresh clone in each
of `gateway/`, `services/auth/`, `services/inventory/`, `services/transaction/`,
`services/notification/` to confirm it works **without** the sibling
`daana-inventory` directory present.

3.3. Merge `feature/platform-integration` into `main`.

3.4. **Verify (no deploy yet, autoDeploy still off):** rerun the local
green-field build to make sure no regression.

### Step 4 — Deploy gateway first (smallest blast radius)

4.1. In the Render dashboard, click **Manual Deploy** on `daanarx-api-gateway`,
pulling latest `main`.

4.2. **Verify:** `https://daanarx-api-gateway.onrender.com/health` returns
2xx. Inspect deploy logs for the inventory-core resolution.

### Step 5 — Merge `feature/be-items-api`, redeploy inventory service

5.1. Squash-merge into `main`.

5.2. Manual Deploy `daanarx-inventory-service`.

5.3. **Verify:** `GET /health` 2xx; smoke-test
`POST /items` (check-in) and `GET /items` against staging credentials.
Confirm a `transactions` row was written.

### Step 6 — Merge `feature/be-checkout-cart`, redeploy transaction service

6.1. Squash-merge into `main`.

6.2. Manual Deploy `daanarx-transaction-service`.

6.3. **Verify:** create a cart, add an item, submit, approve. Confirm the
item status walked `active → in_cart → checked_out`. Verify the 24h expiry
endpoint (`POST /carts/expire-stale`) responds even if it does nothing.

### Step 7 — Merge `feature/be-reports-api`, redeploy transaction service

7.1. Squash-merge into `main`.

7.2. Manual Deploy `daanarx-transaction-service` again.

7.3. **Verify:** `GET /reports/expiring?days=30`, `/reports/capacity`,
`/reports/high-use`, `/transactions?limit=10` all return 200 with shaped JSON.

### Step 8 — Re-enable autoDeploy

8.1. In the dashboard (or via a final `render.yaml` PR), set `autoDeploy: true`
on all 5 services.

8.2. Confirm by pushing a no-op whitespace change to `main` and watching
all 5 services pick it up.

### Step 9 — Frontend (out of scope here)

When ready, deploy `DaanarRX` to Vercel (recommended), set
`NEXT_PUBLIC_GATEWAY_URL=https://daanarx-api-gateway.onrender.com`, and
append the resulting Vercel origin to `ALLOWED_ORIGINS` on every backend
service. Then redeploy backends to pick up the new CORS allowlist.

---

## 7. Rollback plan

Render's per-service "Rollback" button reverts to the previous successful
deploy on that service. Per-service rollback procedure:

| Failure mode | Action | Cost |
|---|---|---|
| Service won't build (build log error) | No rollback needed — the previous deploy is still serving. Investigate logs and push fix to `main`. | None (traffic unaffected). |
| Service builds but health check fails | Render automatically holds traffic on the previous deploy; the new deploy never goes live. Same as above. | None. |
| Service builds + passes health check but throws on real requests | Render dashboard → service → "Deploys" → click previous deploy → "Rollback". Takes ~30s. | One bad deploy in the audit trail. |
| Database migration 002 caused data corruption | Migration 002 is mostly additive (`CREATE TABLE`, `ALTER ... ADD COLUMN`). For each new table: `DROP TABLE ... CASCADE` (after backing up). For any altered legacy table: revert that specific `ALTER`. Recommend writing `002_rollback.sql` *before* applying 002 (see §9 Q3). | High — manual SQL. |
| Cascade failure (multiple services broken at once) | Roll all 5 services back to the pre-step-0 deploy SHA, then disable `autoDeploy`. Keep traffic warm via legacy Next.js Apollo server if it's still up. | High — coordinated multi-service rollback. |

**Pre-deploy snapshot** (mandatory before step 1): record the current
deploy SHA of every service from the Render dashboard. That's the
rollback target.

---

## 8. Verification matrix

| After step | Smoke command | Pass criterion |
|---|---|---|
| 1 (migration) | `mcp__supabase__list_tables` filter on `public` | 7 new tables present |
| 4 (gateway) | `curl /health` on gateway | 200 |
| 5 (items)   | `curl -X POST /items` with payload through gateway | 201 + transaction row appended |
| 6 (carts)   | walk a cart through approve+checkout | item ends in `checked_out`, cart in `submitted` |
| 7 (reports) | `curl /reports/expiring?days=30` through gateway | 200, JSON array |

---

## 9. Open questions

1. **Q1 — Migration 002 readiness.** The architecture ADR §9 notes the
   advisor tools were unavailable to the foundation agent and the migration
   was never applied. Has anyone since reviewed and applied it? *User must
   confirm.* If no — step 1 of this plan is the first action.
2. **Q2 — Render workspace identity + permissions.** Which Render workspace
   owns these 5 services? Does the user's Render account have admin? Is
   there a separate `staging` workspace, or is `main` deploying straight to
   prod? *Cannot determine without Render MCP or dashboard access.*
3. **Q3 — Rollback SQL for 002.** No `002_rollback.sql` exists. Recommend
   writing one before applying 002.
4. **Q4 — Inventory-core distribution strategy** (§2). Must be decided
   before any backend redeploy. Recommended: vendor for MVP, publish later.
5. **Q5 — Frontend host.** Vercel? Render Static? Existing Netlify? Not
   determinable from the repo.
6. **Q6 — Legacy traffic cutover.** The `DaanarRX` Next.js app appears to
   embed an Apollo server (it depends on `apollo-server` and
   `transpilePackages` the GraphQL toolchain). Is that server currently
   serving production traffic? If yes, the microservices rollout needs a
   coexistence/cutover plan, not a hard switch.
7. **Q7 — pg_cron for cart expiry.** `be-checkout-cart` agent noted
   `expireOldCarts()` exists as an endpoint but no scheduled job calls it.
   For production we need either a pg_cron job inside Supabase or an
   external scheduler (Render Cron Job — a separate `type: cron` block in
   `render.yaml`). Not blocking deploy, but blocking spec compliance
   (24h expiry guarantee).
8. **Q8 — Notification service has no feature branch.** All four backend
   feature agents wrote to `inventory` or `transaction`. The notification
   service is declared in `render.yaml` and gets the file:dep, but has no
   route work attached to it yet. Confirm it should still be deployed (it
   will just expose `/health`).
9. **Q9 — Render free-tier sleep.** Free plan services sleep after 15min
   idle. Five always-on services + the gateway probably hit free-tier
   limits. Plan upgrade decision before go-live.

---

## 10. Files referenced

- `DaanaRx-Backend/render.yaml`
- `DaanaRx-Backend/package.json`, plus `gateway/package.json` and four
  `services/*/package.json`
- `DaanaRx-Backend/Dockerfile` (legacy, recommend remove)
- `DaanaRx-Backend/migrations/001_daanarx_updates.sql` (legacy schema)
- `DaanaRx-Backend/migrations/002_core_inventory_platform.sql` (on
  `feature/architecture-foundation`, unapplied)
- `daana-inventory/docs/architecture.md`
- `daana-inventory/docs/status-protocol.md`
- `DaanarRX/next.config.js` (frontend hints)

---

**End of plan. No deployments have been executed. Awaiting user review.**

---

## 11. Inventory-core distribution (GitHub Packages wiring)

*Added 2026-06-06 by the `github-packages-setup` agent on
`feature/publish-workflow` in `daana-inventory`.*

This section directly resolves [§2 build risk](#2-local-iac-state--daanarx-backendrenderyaml)
and [§9 Q4](#9-open-questions): how the BE repos consume
`@daana-health/inventory-core` on Render once published.

### What was added to `daana-inventory`

- `.npmrc` at the repo root pinning `@daana-health` → `https://npm.pkg.github.com`,
  authenticated via `${GITHUB_TOKEN}`.
- `.github/workflows/publish.yml` — on push to `main` when a
  `packages/*/package.json` version changes, builds and publishes the affected
  package with `pnpm publish --no-git-checks --access restricted` using
  `actions/setup-node@v4` with `registry-url: 'https://npm.pkg.github.com'`.
- `.github/workflows/ci.yml` — runs `pnpm install`, `pnpm -r build`,
  `pnpm -r typecheck` on every PR touching `packages/**`.
- `.changeset/config.json` configured with `access: "restricted"` and
  `ignore: ["@daana-health/dashboard"]` so the internal dashboard app is
  never versioned alongside the engine packages.
- `pnpm release` script at root that runs `changeset publish`.
- Versions on all three packages bumped from `0.0.1` → `0.1.0` (still
  pre-release but signals first publishable cut).
- `publishConfig` now includes `"provenance": false` on each package
  (GitHub Packages does not support the same provenance flow npmjs.com does
  for public packages — set explicitly to suppress any client default).

### Prerequisites the user must satisfy before this works end-to-end

1. **Create the GitHub org `daana-health`** and move `daana-inventory` (and
   ideally the backend repos) under it. Until the org exists, the publish
   workflow will 401.
2. Confirm the default `GITHUB_TOKEN` on the `daana-inventory` repo has
   `write:packages` permission. The workflow already requests it via
   `permissions: { packages: write }`.
3. Push a `.changeset/*.md` describing the initial `0.1.0` cut so the
   release flow has a first artifact to publish.

### Render-build-time wiring for `DaanaRx-Backend`

Today every service in `DaanaRx-Backend/{gateway,services/*}` declares
`"@daana-health/inventory-core": "file:../../../daana-inventory/packages/inventory-core"`.
That works locally because the sibling `daana-inventory` worktree is present;
**on Render it will fail** (the build container only sees one repo).

Two viable strategies — recommendation: **option (a)**.

#### (a) Recommended — consume from GitHub Packages

After the three `@daana-health/*` packages publish at `0.1.0`:

1. In `DaanaRx-Backend`, add a `.npmrc` at the repo root (and one in each
   service subdirectory that runs its own `npm install` on Render —
   currently every `services/*` and `gateway/`):

   ```
   @daana-health:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NPM_AUTH_TOKEN}
   ```

2. Rewrite the `file:` deps in every service `package.json` to pinned
   versions:

   ```jsonc
   "@daana-health/inventory-core": "^0.1.0"
   ```

3. In **every** Render service for the BE (gateway + 4 services), add an
   env var:

   ```yaml
   - key: NPM_AUTH_TOKEN
     sync: false   # set the PAT value in the dashboard
   ```

   The PAT must have `read:packages` scope and access to the
   `daana-health` org.

4. Render auto-injects env vars into `npm install` since
   [Render env vars are present at build time](https://render.com/docs/configure-environment-variables).
   No build-command change is needed.

5. Verify locally first by `rm -rf node_modules && NPM_AUTH_TOKEN=<PAT> npm
   install` from a service directory **without** the sibling
   `daana-inventory` directory present.

#### (b) Fallback — vendor the dist

If for any reason GitHub Packages can't be wired (org not created in time,
PAT distribution friction, etc.), check the built
`packages/inventory-core/dist` (and `inventory-react/dist`,
`domain-mass/dist`) into `DaanaRx-Backend/lib/inventory-core/` (etc.) and
rewrite the `file:` paths to `file:../../lib/inventory-core`. Acceptable as a
bridge for the MVP deploy; do not let it persist past the first sprint.

### Sequencing relative to [§6 Deploy Sequence](#6-recommended-deploy-sequence)

- **Step 0.3** is where this decision lives. Pick (a). The `.npmrc` plus
  PAT secret is fully prepared on the inventory side; the BE-side edits
  (`.npmrc` + env var + dep rewrite) are the only remaining work.
- **Step 3** (solve the `file:` dep build problem) becomes a thin patch
  to `feature/platform-integration`: drop the `file:` paths, add `.npmrc`,
  configure the `NPM_AUTH_TOKEN` secret in Render.

### Caveats

- GitHub Packages restricted packages **cannot be installed by anonymous
  CI**. Every Render service plus any future CI that touches the BE must
  carry the `NPM_AUTH_TOKEN`. Treat the PAT like a deploy key.
- Token rotation: GitHub PATs (classic) are user-owned. Prefer a
  **fine-grained PAT** scoped to the `daana-health` org with `Packages:
  read` only, owned by a bot account so rotation isn't blocked on a single
  human leaving.
- `workspace:*` ranges in `packages/*/package.json` are automatically
  rewritten by changesets/pnpm at publish time — no manual replacement
  needed before pushing the publish workflow.

