# Daana Inventory — Cross-Branch Merge Strategy

**Author:** `coordinator` agent
**Date:** 2026-06-06
**Scope:** Survey of every feature branch in `DaanarRX` (frontend) and `DaanaRx-Backend` (backend), the file-level overlap between them, the cross-repo API contracts that link them, and the merge order that will minimize conflict-resolution work.

This document is **advisory and read-only**. The orchestrator owns the actual merge mechanics.

---

## 1. Branch inventory

### Frontend — `DaanarRX`

Base reference for all FE feature branches: `feature/platform-integration` (commit `270b55f`). That branch is itself 1 commit ahead of `main` (`e9a09f5`), adding only the platform wiring (`next.config.js`, `package.json`, `package-lock.json`, `src/lib/platform.ts`).

| Branch | Commits vs base | Files changed | Lines (+/-) | Purpose (one sentence) |
|---|---:|---:|---|---|
| `feature/platform-integration` | 1 (vs `main`) | 4 | +N/+N | Wires `@daana-health/inventory-core`, `inventory-react`, `domain-mass` into the Next app and exposes a re-export shim. |
| `feature/shell-polish` | 1 | 4 | +598 / −191 | Redesigned `AppShell` sidebar, glass header, floating feedback button + modal, and a shared `StatusChip`. |
| `feature/home-search` | 1 | 8 | +683 / −3 | Replaces `/` with a centered FEFO search hero, insight cards, and a `StatusChip` (duplicate file). |
| `feature/checkin-rebuild` | 1 | 6 | +1225 / −339 | Rebuilds the 10-step intake flow against `domain-mass` (MedicationForm, LocationSuggestion, DrxCodePreview, LabelPreview, IntakeSuccess). |
| `feature/fe-checkout-cart` | 1 | 8 | +1749 / −349 | New `/checkout` page, `CartContext` provider, `CartSidebar`, AddToCartButton, ExpiredOverrideModal, and `cartApi.ts`. Also re-ships `StatusChip`. |
| `feature/fe-inventory-table` | 1 | 4 | +1538 / −822 | Superadmin inventory table with edit / remove / history modals. |

### Backend — `DaanaRx-Backend`

Base reference for BE feature branches: `feature/platform-integration` (commit `e4d01ac`). It is 1 commit ahead of `main` (`53ac6da`), adding `lib/platform-types.ts` and `file:` deps in each service's `package.json`.

| Branch | Commits vs base | Files changed | Lines (+/-) | Purpose (one sentence) |
|---|---:|---:|---|---|
| `feature/architecture-foundation` | 1 (vs `main`) | 1 | (SQL) | Draft migration `002_core_inventory_platform.sql` (unapplied; review-gated). |
| `feature/platform-integration` | 1 (vs `main`) | 7 | — | File-dep wiring of `@daana-health/inventory-core` into all 5 services + root + a `lib/platform-types.ts` re-export. |
| `feature/be-items-api` | 1 | 4 | +786 / 0 | `services/inventory` adds `routes/items.ts` (POST/GET `/items`, GET/PATCH `/items/:id`, POST `/items/:id/remove`, GET `/items/:id/transactions`), jest config, and tests. |
| `feature/be-checkout-cart` | 1 | 4 | +1169 / 0 | `services/transaction` adds `routes/carts.ts` (POST/GET `/carts`, items add/remove, submit, approve, reject, expire-stale), jest config, and tests. |
| `feature/be-reports-api` | 1 | 3 | +1105 / 0 | `services/transaction` adds `routes/reports.ts` (7 endpoints under `/reports/*` + `/transactions`) and tests. |

**Totals:** 6 frontend branches and 5 backend branches (4 + 1 SQL).

---

## 2. Conflict matrix

A "conflict" here means two feature branches modify the same file. Because every feature branch is exactly **one commit** ahead of the same base, conflict detection collapses to "do their file lists intersect?"

### 2a. Frontend conflicts (DaanarRX)

Rows are files; a `X` means the branch in that column edits the file.

| File | shell-polish | home-search | checkin-rebuild | fe-checkout-cart | fe-inventory-table |
|---|:---:|:---:|:---:|:---:|:---:|
| `src/components/ui/status-chip.tsx` | X | X | | X | |
| `src/app/page.tsx` | | X | | | |
| `src/app/checkin/page.tsx` | | | X | | |
| `src/app/checkout/page.tsx` | | | | X | |
| `src/app/inventory/page.tsx` | | | | | X |
| `src/components/layout/AppShell.tsx` | X | | | | |
| `src/components/FeedbackButton.tsx`, `FeedbackModal.tsx` | X | | | | |
| `src/components/home/*` (6 files) | | X | | | |
| `src/components/checkin/*` (5 files) | | | X | | |
| `src/components/cart/*`, `checkout/*` (5 files) + `src/lib/cartApi.ts` | | | | X | |
| `src/components/inventory/*` (3 files) | | | | | X |

**The single shared file is `src/components/ui/status-chip.tsx`**, touched by `shell-polish`, `home-search`, and `fe-checkout-cart`. All three create the file from scratch (it does not exist in `feature/platform-integration`). The implementations are functionally equivalent — they all key on `ItemStatus` from `@daana-health/inventory-core` and apply the spec colour map — but they differ in:

- Quote style (`"` in shell-polish, `'` elsewhere).
- Class composition (shell-polish inlines hex/literal Tailwind colours; home-search and fe-checkout-cart use semantic `success`/`primary`/`warning` tokens). The `fe-checkout-cart` copy explicitly notes the duplication in a header comment and asserts it is "intentionally identical so a literal de-dup is safe".

That assertion is **only true if all three resolve to the same semantic-token implementation**. The shell-polish copy uses different class names, so the orchestrator MUST diff the three and pick one canonical copy at merge time, not blindly accept the first.

No other file overlaps in FE land.

### 2b. Backend conflicts (DaanaRx-Backend)

| File | be-items-api | be-checkout-cart | be-reports-api |
|---|:---:|:---:|:---:|
| `services/inventory/src/index.ts` | (no — not modified)* | | |
| `services/inventory/src/routes/items.ts` | X | | |
| `services/inventory/jest.config.js` | X | | |
| `services/transaction/src/index.ts` | | **X** | **X** |
| `services/transaction/src/routes/carts.ts` | | X | |
| `services/transaction/src/routes/reports.ts` | | | X |
| `services/transaction/jest.config.js` | | X | |

\* `be-items-api` does mount `routes/items.ts` from `services/inventory/src/index.ts`; verify on merge that the file list above is the authoritative one. The diff stat shows 4 files including `services/inventory/src/index.ts`.

**The single shared file is `services/transaction/src/index.ts`**, touched by both `be-checkout-cart` and `be-reports-api`. The two diffs are non-overlapping in intent:

- `be-checkout-cart` adds `import cartsRoutes from './routes/carts'` and `app.use('/carts', cartsRoutes)`.
- `be-reports-api` adds `import reportsRoutes, { transactionLogRoutes } from './routes/reports'` and `app.use('/reports', reportsRoutes)` + `app.use('/transactions', transactionLogRoutes)`.

Both insertions are in the same two regions (the imports block and the `app.use` block, right before `app.use('/', transactionRoutes)`). A 3-way merge will produce a textual conflict because both branches add adjacent lines. Resolution is mechanical: take the union of both imports and both `app.use` mounts, preserving the order `/carts`, `/reports`, `/transactions`, `/`. A `jest.config.js` is added by `be-checkout-cart` only — if `be-reports-api` is rebased on top of `be-checkout-cart` first, the second branch will inherit the jest config cleanly.

No other backend conflicts.

---

## 3. Recommended merge order

### Goal
Minimize manual conflict-resolution time. With only two shared files (one per repo), the optimal order is: merge the cleanest branches first, then the ones that touch the contested file last, and resolve the contested file once.

### 3a. Frontend (DaanarRX)

Target branch for the final integration: `feature/platform-integration` (then forward to `main` once green).

| Step | Branch | Base (rebase onto) | Expected conflicts | Resolution hint |
|---|---|---|---|---|
| 1 | `feature/checkin-rebuild` | `feature/platform-integration` | none | Clean merge. No file overlap with any other FE branch. |
| 2 | `feature/fe-inventory-table` | `feature/platform-integration` (post-step-1) | none | Clean merge. No file overlap. |
| 3 | `feature/shell-polish` | `feature/platform-integration` (post-step-2) | none (creates `status-chip.tsx`) | First writer wins for `status-chip.tsx`. Confirm the chosen implementation uses the semantic-token classes (see §2a). If shell-polish's literal-colour copy lands first, replace it after step 4 with the home-search version. |
| 4 | `feature/home-search` | `feature/platform-integration` (post-step-3) | `src/components/ui/status-chip.tsx` | Keep the semantic-token implementation (recommended). Drop home-search's copy of `status-chip.tsx` if shell-polish already shipped semantic-token version; otherwise overwrite shell-polish's literal-colour version with home-search's. |
| 5 | `feature/fe-checkout-cart` | `feature/platform-integration` (post-step-4) | `src/components/ui/status-chip.tsx` | Drop fe-checkout-cart's copy of `status-chip.tsx` (it is the duplicate the branch's own comment warns about). Take the existing file from step 3/4 unchanged. |

**Rationale for order:** Steps 1, 2 are conflict-free and can land in any sub-order. Step 3 (shell-polish) lands the AppShell rewrite that the other UI pages will visually depend on, so it should land before pages that render inside the shell are exercised. Steps 4 and 5 are the only branches with overlap and are resolved by a single decision on `status-chip.tsx`.

### 3b. Backend (DaanaRx-Backend)

The architecture-foundation branch is not part of the feature-integration merge train — it is a **SQL migration awaiting human review** (see status file: `mcp__supabase__apply_migration` was unavailable in the sandbox, advisors must be re-run after apply). Treat it as a separate pre-merge dependency.

| Step | Branch | Base (rebase onto) | Expected conflicts | Resolution hint |
|---|---|---|---|---|
| 0 | `feature/architecture-foundation` | `main` | none (migration file only) | **Apply migration to Supabase + re-run advisors before any item/cart/report endpoint is exercised against real data.** Can land any time before backend goes live; not a prerequisite for the TypeScript merges below. |
| 1 | `feature/be-items-api` | `feature/platform-integration` | none | Clean merge. Adds `services/inventory/routes/items.ts` and mounts it. |
| 2 | `feature/be-checkout-cart` | `feature/platform-integration` (post-step-1) | none | Clean merge. Touches only `services/transaction`. |
| 3 | `feature/be-reports-api` | `feature/platform-integration` (post-step-2) | `services/transaction/src/index.ts` | 3-way merge of the imports block and the `app.use` block. Take the union: add `import reportsRoutes, { transactionLogRoutes } from './routes/reports'`; mount `/reports`, `/transactions` before `/`. The `jest.config.js` from be-checkout-cart is preserved as-is. |

**Rationale for order:** items-api first (foundation for everything else), then carts (sets up `jest.config.js` and the first import in `services/transaction/src/index.ts`), then reports (the only branch that requires manual merge of `index.ts`).

### 3c. Cross-repo ordering

Backend feature branches should land **before** their FE consumers exercise the new endpoints. Per §4, every FE branch already calls endpoints that the BE feature branches own. The recommended global order is:

1. BE step 0 (`feature/architecture-foundation`) — applied to Supabase.
2. BE steps 1 → 2 → 3 — merged into `feature/platform-integration` and deployed.
3. FE steps 1 → 5 — merged into `feature/platform-integration` and verified against the now-live BE.

If FE merges before BE, expect runtime 404s and the `feature/fe-inventory-table` contract drift (§4) will not be caught until manual testing.

---

## 4. Cross-repo dependencies

The frontend feature branches consume the following endpoints from the backend feature branches. "Status" reflects whether the FE call site matches the BE route surface as currently implemented.

| FE branch | FE call site | Endpoint | Owning BE branch | Status |
|---|---|---|---|---|
| `feature/home-search` | `HomeClient.tsx` | `GET /api/items?q=…&status=active` | `feature/be-items-api` | ready (path-prefix `/api` is the Next rewrite; the BE route is `GET /items`) |
| `feature/checkin-rebuild` | `DrxCodePreview.tsx` | `GET /api/items/next-code` (with mock fallback) | none (gap) | **PENDING — endpoint does not exist** on `feature/be-items-api`. The check-in flow ships with a mock fallback so it does not break, but the production code-generator counter must come from a backend RPC. See risk callout in §6. |
| `feature/checkin-rebuild` | `MedicationForm.tsx` (intended) | `POST /api/items` | `feature/be-items-api` | ready (path matches `POST /items`). Status file confirms it is wired via the mock and "Future: wire POST /api/items once be-items-api merges." |
| `feature/fe-inventory-table` | `inventory/page.tsx` | `GET /api/items`, `GET /api/locations` | `feature/be-items-api` (items), **none for `/locations`** | **PENDING for `/locations`** — no backend branch provides `/locations`. Either an existing legacy route handles it (verify in `services/inventory/src/index.ts` on `main`) or this is a gap. |
| `feature/fe-inventory-table` | `inventory/page.tsx` | `POST /api/carts/current/items`, `POST /api/carts/:id/approve` | `feature/be-checkout-cart` | **CONTRACT DRIFT** — BE exposes `POST /carts/:id/items` and requires a real cart `id`. There is **no `/carts/current` shortcut** on the BE. The FE either needs to first call `POST /carts` and remember the id, or the BE needs to add `/carts/current` as an alias. Approve path matches. |
| `feature/fe-checkout-cart` | `cartApi.ts` | `GET /api/items?…`, `POST /api/carts`, `GET /api/carts/:id`, `POST /api/carts/:id/items`, `DELETE /api/carts/:id/items/:item_id`, `POST /api/carts/:id/submit`, `POST /api/carts/:id/approve`, `POST /api/carts/:id/reject`, `GET /api/carts?status=pending_approval` | `feature/be-items-api`, `feature/be-checkout-cart` | ready for everything except `GET /carts?status=pending_approval` — verify the BE `/carts` route accepts a query filter (the route file shows only `GET /:id`, no list endpoint). **PENDING — verify with be-checkout-cart owner.** |
| `feature/fe-reports-dashboard` (pending agent, not yet started) | — | `GET /reports/*`, `GET /transactions` | `feature/be-reports-api` | ready when FE starts. |
| `feature/fe-auth-polish` (pending) | — | (auth flows) | none in scope | n/a — touches FE only. |
| `feature/fe-settings` (pending) | — | (locations, users) | none implemented yet | gap — settings will block until backend support is added. |

**Path convention note:** FE branches call `/api/<resource>`; the BE feature branches expose `/<resource>` on the relevant microservice. The gateway / Next rewrite layer is responsible for the `/api` prefix mapping. This mapping is not in scope of any current feature branch — assume it is handled by `services/gateway` on `main` and verify on the first end-to-end test.

---

## 5. Pre-merge checklist

Before kicking off the merge train, the following must be true:

1. **Apply `migrations/002_core_inventory_platform.sql`** to the Supabase project (`feature/architecture-foundation`). Re-run `mcp__supabase__get_advisors` and resolve any new findings before merging any BE feature branch that writes to the new tables.
2. **Verify `services/gateway` `/api` rewrite** routes `/api/items` → `services/inventory`, `/api/carts` → `services/transaction`, `/api/reports` → `services/transaction`, `/api/transactions` → `services/transaction`. If a route is missing, the FE branches will 404 at runtime even though the merge is clean.
3. **Per-branch typecheck + test** (already green per status files, but re-run after each step):
   - FE: `npx tsc --noEmit` from `/Users/rithik/Code/DaanarRX`.
   - BE inventory: `npm test --prefix services/inventory` (jest, 19 tests).
   - BE transaction (cart): `npm test --prefix services/transaction` (node:test, 5 tests).
   - BE transaction (reports): `npm test --prefix services/transaction` (node:test, 6 tests). Note: tests are split between jest and `node:test` because `inventory-core` is ESM-only — see §6.
4. **Decide canonical `status-chip.tsx` implementation** (semantic-token vs literal-colour) before merging step 3 (shell-polish) on the FE.
5. **Resolve `/locations` and `/carts/current` gaps** (§4) — either by adding compat shims in BE or by patching the FE call sites — before `feature/fe-inventory-table` is exercised.
6. **No coordinator-owned code changes** between now and the merge — the conflict matrix is computed against the current SHAs (FE: `48f84dc / 3801700 / ba2d0cb / 13c4bf0 / 512efe1` rebased on `270b55f`; BE: `d6967d4 / 05628ab / a5fbd11` rebased on `e4d01ac`). New commits invalidate this plan.

---

## 6. Risk callouts

### High

- **ESM/CJS interop in BE services.** `be-checkout-cart` had to use `node:test` instead of `jest` because `@daana-health/inventory-core` is ESM-only; `be-items-api` worked around the same problem with a jest config that maps the ESM core to TS source. After all three BE branches merge, the `services/transaction` package will mix `jest` (carts) and `node:test` (reports) in the same module, which means `npm test` may run only one of the two suites unless explicitly configured. **Action:** at merge step BE-3, consolidate the test runners or have `npm test` run both.
- **`status-chip.tsx` triple-duplicate.** Three FE branches create the same file from scratch with two different implementations. If the orchestrator does a naive merge without de-duping, the last writer wins and the previous semantic-token version is overwritten. The `fe-checkout-cart` branch acknowledges this in a code comment but does not enforce it. **Action:** §3a step 4/5 explicitly de-dup.
- **Contract drift on `feature/fe-inventory-table`.** It calls `POST /api/carts/current/items` and `GET /api/locations`, neither of which exists in any backend branch. The inventory table will partially work (list/edit/remove via `/items`) but the "Check Out direct" action will 404. **Action:** track in §4; either add `/carts/current` to be-checkout-cart or patch the FE call site before the inventory branch ships.

### Medium

- **`GET /api/carts?status=pending_approval` not implemented.** `feature/fe-checkout-cart` calls this for the Pending Approvals tab; the BE `routes/carts.ts` does not register a list endpoint. **Action:** verify with be-checkout-cart owner; likely a small addition.
- **`GET /api/items/next-code` not implemented.** `feature/checkin-rebuild` falls back to a mock if the endpoint is missing, so the FE merge is safe — but the production check-in flow will allocate codes locally until a BE endpoint exists. The architecture doc (§5) describes this as an atomic SECURITY DEFINER RPC. **Action:** track as follow-up backend work post-merge; do not block the FE merge.
- **`migrations/002_core_inventory_platform.sql` unapplied.** Every BE feature branch reads from `items`, `carts`, `cart_items`, `transactions`, `code_counters` — tables the migration creates. Merging the BE branches without applying the migration leaves a clean codebase that 500s at runtime. **Action:** §5 step 1.

### Low

- **Author "intentionally identical" assertion in `fe-checkout-cart`'s `status-chip.tsx`** is false vs `shell-polish`. The two implementations differ in Tailwind class composition. The orchestrator should not trust the comment; diff explicitly.
- **`feature/platform-integration` divergence between repos.** FE and BE both have a branch named `feature/platform-integration`, and they were authored independently (FE: `270b55f`, BE: `e4d01ac`). Confirm with the orchestrator that the naming collision is intentional and does not confuse downstream tooling.
- **Pending FE branches** (`fe-auth-polish`, `fe-reports-dashboard`, `fe-settings`) are in `status: pending` and have no commits yet. They are excluded from the merge plan; revisit when they enter `in_progress`.

---

## 7. Summary

- **Frontend:** 5 feature branches, **1 conflict file** (`status-chip.tsx`), merge order checkin → inventory → shell → home → checkout-cart.
- **Backend:** 3 feature branches (+ 1 SQL migration), **1 conflict file** (`services/transaction/src/index.ts`), merge order items-api → checkout-cart → reports-api.
- **Cross-repo gaps:** `/api/items/next-code`, `/api/carts/current`, `/api/carts?status=…`, `/api/locations`. Two are FE-fallback-safe; two will surface as runtime 404s on `fe-inventory-table`.
- **Biggest risk:** ESM/CJS test-runner split inside `services/transaction` after the BE-3 merge.

End of plan.
