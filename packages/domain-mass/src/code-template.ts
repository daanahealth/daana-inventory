// DRX code template + generator for the MASS medication item type.
//
// ─── Why Option 1? ──────────────────────────────────────────────────────────
// The MASS MVP spec proposes three DRX code formats:
//
//   Option 1: DRX-MASS-{LOCATION}-{counter:05d}
//             e.g. DRX-MASS-CARDIO1-00042
//
//   Option 2: DRX-MASS-{specialty}{specialty_num}{lr}-{med_initial}{dose_initial}-{counter:05d}
//             e.g. DRX-MASS-CD1L-L1-12345
//             Encodes specialty + 1st-letter-of-medication + 1st-digit-of-dose
//             into the code itself as redundancy if the physical label is
//             damaged or detached.
//
//   Option 3: DRXM-{specialty}{specialty_num}{lr}{med_initial}{dose_initial}{counter:03d}
//             e.g. DRXM-C1LL1123
//             Compact 11-char form, same redundancy, only 3-digit counter
//             (1000-unit ceiling per (specialty, med, dose) tuple).
//
// We pick **Option 1** for the MVP because:
//   1. The label is written by hand by interns and volunteers. A 22-char,
//      hyphen-delimited code with one obvious counter is dramatically easier
//      to copy without transcription errors than Option 2's two embedded
//      "what's the first digit of the dose?" lookups.
//   2. The location code is already on the bin — the human can verify the
//      code against the bin label by eye, which is the redundancy Options 2
//      and 3 try to encode into the code itself.
//   3. 5-digit counter gives 99,999 codes per location. MASS expects ~20
//      bins and donated medication volume in the hundreds per month. Option
//      3's 3-digit ceiling (999) would force a code-format migration within
//      the first year of operation for high-traffic bins.
//   4. Option 1 has zero dependency on `attributes` (no `med_initial`,
//      `dose_initial`, `specialty_num`, `lr_code` to extract). That removes
//      a class of write-time failure where check-in cannot proceed because
//      a derived attribute is empty.
//
// ─── Switching to Option 2 or 3 ─────────────────────────────────────────────
// To swap templates, change DRX_CODE_TEMPLATE to one of:
//
//   Option 2: "DRX-MASS-{attr.specialty_code}{attr.specialty_num}{attr.lr_code}-{attr.med_initial}{attr.dose_initial}-{counter:05d}"
//   Option 3: "DRXM-{attr.specialty_code}{attr.specialty_num}{attr.lr_code}{attr.med_initial}{attr.dose_initial}{counter:03d}"
//
// Both require:
//   - The Check In form to capture (or derive) `med_initial`, `dose_initial`,
//     `specialty_code`, `specialty_num`, `lr_code` and write them into
//     `attributes` BEFORE generate_unit_code runs.
//   - The MedicationAttributes interface in attribute-schema.ts already
//     declares these fields as optional so they can be populated when the
//     domain switches templates.
//   - Option 3 additionally requires a smaller counter ceiling — the platform
//     should monitor `code_counters.next_value` for any location nearing 999
//     and prompt a bin overflow before the format breaks.

import {
  createTemplateCodeGenerator,
  type CodeGenerator,
} from "@daana-health/inventory-core";

/**
 * Selected DRX code template for the MASS medication item type.
 *
 * NEW (specialty-based) format — adopted per the clinic's request to encode the
 * specialty location rather than the lot number:
 *
 *   Format:  `DRX-MASS-{specialty_code}{specialty_num}{med_initial}{dose_initial}{counter:03d}`
 *   Example: `DRX-MASS-D2ME5001`  (Diabetes-2, Metformin, 500 mg, unit 001)
 *
 * The four embedded fields come from `deriveMassCodeAttributes()` in
 * `specialty-codes.ts` and must be present in `attributes` before render. The
 * counter is still allocated per-location by the platform (`code_counters`),
 * which keeps each rendered code unique within a bin.
 *
 * Ceiling note: the 3-digit counter caps a bin at 999 units (current busiest
 * bin ≈ 112). Monitor `code_counters.next_value`; widen to `{counter:04d}` if a
 * bin approaches the limit.
 *
 * Migration note: existing units keep their already-assigned codes — they are
 * never regenerated. Only new check-ins use this template.
 */
export const DRX_CODE_TEMPLATE =
  "DRX-MASS-{attr.specialty_code}{attr.specialty_num}{attr.med_initial}{attr.dose_initial}{counter:03d}" as const;

/**
 * Previous location-based format, retained for reference and historical codes.
 * Format: `DRX-MASS-{LOCATION}-{counter:05d}` (e.g. `DRX-MASS-CARDIO1-00042`).
 */
export const DRX_CODE_TEMPLATE_LOCATION = "DRX-MASS-{LOCATION}-{counter:05d}" as const;

/**
 * Build a CodeGenerator for the MASS medication item type. The returned
 * generator is a thin closure over the shared template renderer; it does NOT
 * allocate counter values — that is the platform's responsibility (atomic
 * RPC against `code_counters`).
 */
export function createDrxCodeGenerator(): CodeGenerator {
  return createTemplateCodeGenerator(DRX_CODE_TEMPLATE);
}
