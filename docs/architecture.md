# Daana Inventory Platform — Architecture Decision Record (ADR)

**Status:** Draft v0.1
**Date:** 2026-06-06
**Author:** `architecture-foundation` agent
**Scope:** Foundation layer — schema, TS contracts, and the core/domain split that every other agent will build against.

---

## 1. Context

DaanaRX MASS is the first deployment of a broader Daana Inventory platform. The MASS MVP spec describes a donated-medication inventory tool for a single clinic, but Daana intends to apply the same engine to other inventory problems (consumables, devices, lab supplies, possibly cross-clinic).

The prior system drifted within 48 hours of go-live because every state-changing event (check-in, check-out, edit, removal) had to be hand-walked through ad-hoc UI. The MVP must guarantee that every physical event has a corresponding database transaction, and the schema must make that easy.

This document records the foundational decisions that shape every later component.

---

## 2. Core / domain pack split

### Decision

Two layers:

- **`@daana-health/inventory-core`** — generic inventory engine. Status state machine, FEFO sort, code-template renderer, transaction log shapes, cart approval workflow contracts, validator registry. Knows nothing about medications.
- **Domain packs** (first: `@daana-health/domain-mass`) — register item types, attribute schemas, code-format templates, location classification, and domain-specific validators against the core.

### Rationale

- The MASS spec describes 14 specialty classifications and ~20 bin codes. Hardcoding these into the schema would force a migration every time MASS adds a class, and would not survive moving to a second clinic.
- The DRX code itself has three candidate formats in the spec (Option 1/2/3). Locking the format into a column constraint would make iteration painful; pushing it into a per-item-type template keeps it a configuration concern.
- Most behaviors the spec demands (status transitions, FEFO, transaction log, soft-delete, 24h cart expiry) are about *units of inventory*, not about *medications*. Those belong to the core.

### Alternatives considered

- **Single monolithic schema with all medication fields columnar.** Rejected: every new field is a migration; new domains (e.g. devices) duplicate the whole table.
- **EAV (entity-attribute-value) for everything.** Rejected: kills query ergonomics, indexing, and type safety; the team will regret it in week two.

---

## 3. JSONB attributes vs EAV vs per-domain tables

### Decision

A single `items.attributes` JSONB column, validated against a per-item-type JSON Schema stored in `item_types.attribute_schema`. Domain code reads/writes typed views over this blob.

### Rationale

- **Queryability:** Postgres GIN-indexes JSONB. We can index `attributes->>'medication_name'` directly if a hot search emerges.
- **Type safety:** JSON Schema is enforceable at write time (ajv in the RPC layer) and renderable into TS types via codegen.
- **Mobility:** Adding a new attribute is a schema-update on the `item_types` row, not a migration.
- **EAV comparison:** EAV requires N joins for N attributes and loses type info; JSONB carries the structure with the row.
- **Per-domain table comparison:** A `medications` table works fine for MASS, but doubles the schema for every domain pack and forces cross-table queries for generic operations like FEFO.

### Trade-offs

- Queries that aggregate across attributes (e.g. "all amoxicillin units across clinics") need explicit indexing decisions per attribute. We accept this cost; it scales with usage, not with schema size.
- JSON Schema validation must run on every write. This lives in the SECURITY DEFINER RPCs that own writes (see §7).

---

## 4. Status state machine

Every unit has exactly one status. Mirrors SQL enum `item_status`.

```
                             ┌──────────────────┐
                             │     active       │◀──────────────┐
                             └──────────────────┘               │
              ┌──────────────┬──────┴───────┬─────────┐         │
              │              │              │         │         │ (cart cleared,
              ▼              ▼              ▼         ▼         │  rejected, or
       ┌───────────┐ ┌─────────────────┐ ┌─────────┐ ┌───────┐  │  24h expiry)
       │  in_cart  │ │ pending_approval│ │ removed │ │expired│  │
       └─────┬─────┘ └────────┬────────┘ └─────────┘ └───┬───┘  │
             │ approved       │ approved                 │      │
             ▼                ▼                          ▼      │
       ┌──────────────────────────────┐           ┌──────────┐  │
       │        checked_out           │           │ removed  │  │
       └──────────────────────────────┘           │   /      │  │
                                                  │ override │  │
                                                  │ checkout │  │
                                                  └──────────┘  │
       in_cart ─────────────── (cart cleared / removed) ────────┘
       pending_approval ────── (rejected / expired) ────────────┘
```

Terminal states: `checked_out`, `removed`. (`expired` is recoverable by superadmin override into `checked_out`, or finalized into `removed`.)

The canonical transition table lives in `packages/inventory-core/src/status.ts` (`allowedTransitions`). `assertTransition(from, to)` is the only sanctioned way to validate a status change; UI and RPCs both consult it.

---

## 5. DRX code generation

### Decision

- Codes are rendered from a per-item-type **template string** in `item_types.code_format_template`.
- Counter values come from `code_counters(item_type_id, location_code)` — a per-`(item_type, location)` sequential integer.
- Allocation is atomic via a `SECURITY DEFINER` RPC (`generate_unit_code`) that `INSERT ... ON CONFLICT DO UPDATE SET next_value = code_counters.next_value + 1 RETURNING ...`.
- Codes are never reused. The counter only ever increments, even when items are removed.
- Codes are `UNIQUE` at the `items.unit_code` column level. Concurrent inserts that race past the RPC fail fast on the unique violation, not silently corrupt the sequence.

### Templates supported in MVP

- Spec Option 1 (chosen default for MASS): `DRX-MASS-{LOCATION}-{counter:05d}` → `DRX-MASS-CARDIO1-00042`
- Spec Option 2: `DRX-MASS-{attr.specialty_code}{attr.specialty_num}{attr.lr_code}-{attr.med_initial}{attr.dose_initial}-{counter:05d}`
- Spec Option 3: `DRXM-{attr.specialty_code}{attr.specialty_num}{attr.lr_code}{attr.med_initial}{attr.dose_initial}{counter:03d}`

All three render through the same engine; the domain pack picks which template the MASS `medication` item type uses.

---

## 6. Soft-delete strategy

- Every state-changing action writes a `transactions` row.
- Removal does **not** delete the `items` row. It sets `removed_at`, `removed_by`, `removed_reason`, and transitions `status` to `removed`.
- Search excludes `status = removed` by default. Reports include it.
- Locations are similarly soft-deactivated via `deactivated_at` so that historical items still resolve their location.
- Hard deletes are forbidden by RLS + by the lack of any DELETE RPC.

---

## 7. Cart reservation + 24h expiry

- A cart is a row in `carts` with `expires_at = now() + interval '24 hours'`.
- Adding an item to a cart sets `items.status` to `in_cart` (superadmin owner) or `pending_approval` (restricted-user owner) and inserts into `cart_items`.
- Items in `in_cart` or `pending_approval` status are excluded from restricted-user search results (per spec). They remain visible to superadmins in inventory.
- A background job (pg_cron, defined in a follow-up migration) runs every 5 minutes:
  - Finds carts with `status IN ('active','pending_approval')` and `expires_at < now()`.
  - Transitions cart to `status = 'expired'`.
  - For each `cart_items` row: transition the item back to `status = 'active'`, log a transaction with action `edit` and reason `cart_expired`.
- Concurrent-checkout safety: the cart-add RPC asserts `items.status = 'active'` at the moment of insert, inside a transaction. The second writer hits the assertion failure and surfaces the "just checked out" message.

### Open question

A partial unique index "one open cart per item" cannot be expressed in pure SQL because the predicate references another table. We will enforce this with a BEFORE INSERT trigger on `cart_items` that joins to `carts`. The illustrative partial index in the migration is dropped to keep the file applyable.

---

## 8. Tables at a glance

| Table | Purpose |
|---|---|
| `item_types` | Registry of item kinds, code templates, attribute schemas |
| `locations` | Bins/drawers. Capacity-bounded, specialty-coded, soft-deactivatable |
| `items` | Unit-level inventory. Status, location, expiry, code, JSONB attributes |
| `transactions` | Append-only audit log keyed on item_id |
| `carts` | Checkout carts with 24h expiry and approval state |
| `cart_items` | Many-to-many between carts and items |
| `code_counters` | Per-(item_type, location) sequential counter |

See `DaanaRx-Backend/migrations/002_core_inventory_platform.sql` for definitions.

---

## 9. Supabase advisor findings

**Blocker noted in agent run:** `mcp__supabase__get_advisors` was unavailable in this agent's sandbox (permission denied). The migration was not applied; advisors should be re-run by the reviewer after apply.

### Anticipated findings (to verify on apply)

- **RLS placeholders:** every table has RLS enabled but only SELECT policies. No INSERT/UPDATE/DELETE policies. Advisor will likely flag `rls_disabled_in_public` as resolved but `rls_policies_missing` for writes. This is intentional — writes go through SECURITY DEFINER RPCs (to be added).
- **`auth.users` FK on delete behavior:** all FKs to `auth.users` use `ON DELETE SET NULL` so audit history survives user removal. Advisor may flag dangling references; the design intent is that user rows are never hard-deleted in production.
- **GIN index on `items.attributes`:** added preemptively. If write throughput becomes a concern, this should be re-evaluated.
- **`code_counters` without a created_at:** intentional — the row's value is the count, not the history. History lives in `transactions`.

---

## 10. Open questions for follow-up

1. **User roles model.** The spec names `superadmin` and `restricted_user` but does not define where the role lives. Options: `auth.users.raw_user_meta_data`, a `user_roles` table, or Supabase RLS via `auth.jwt() -> 'app_metadata'`. Recommendation: dedicated `user_roles(user_id, clinic_id, role)` table for future multi-tenancy.
2. **Multi-tenancy.** The MVP is single-clinic (MASS), but every table currently lacks a `clinic_id`. Should we add it now (cheap) or wait for the second clinic (likely-painful migration)? Recommendation: add `clinic_id` in a follow-up migration before MASS go-live; the cost is trivial.
3. **Expired transition trigger.** `items.status = 'expired'` is computed from `expiry_date < today`. Do we want a database trigger that flips status on date crossover, or a query-time filter, or a daily job? Recommendation: scheduled job + an `expired` view; avoids surprise writes.
4. **Cart write policies vs RPCs.** All writes are currently locked out. The RPC surface needs to be designed before Phase 1 backend can be built. Suggested RPCs: `check_in`, `check_out_direct`, `cart_add`, `cart_remove`, `cart_submit`, `cart_approve`, `cart_reject`, `item_edit`, `item_remove`, `expired_override`.
5. **Concurrent counter contention.** `code_counters` row-level UPDATE locks may bottleneck under heavy parallel check-in. Acceptable for MASS (single clinic, low write rate); should benchmark before second deployment.
6. **Offline mode.** Spec says out-of-scope but "should be architected in a way that does not foreclose future offline support." Open question: do we want client-generated UUIDs for items (today: server `gen_random_uuid`) to enable optimistic offline writes? Recommendation: allow client-supplied id on the check_in RPC.
7. **Legacy backfill.** `001_daanarx_updates.sql` operates on a `lots/drugs/clinics` schema. Do we backfill those into `items` + `item_types`, or run them in parallel for the MASS pilot? Recommendation: pilot from a clean slate; backfill is non-trivial because of the unit-level granularity change.

---

## 11. References

- `DaanaRX MASS MVP Spec` v1.1 (May 2026)
- `DaanaRx-Backend/migrations/001_daanarx_updates.sql` (legacy lots/drugs/clinics)
- `DaanaRx-Backend/migrations/002_core_inventory_platform.sql` (this migration, draft, unapplied)
- `packages/inventory-core/src/*` (TS contracts)
