// Specialty code derivation for the NEW DRX code format.
//
// MASS moved their barcode scheme from lot-based to specialty-based:
//
//   OLD:  DRX-MASS-{lot}{med}{dose}{counter}        e.g. ALLI5003  (Lot AL, Lisinopril 50)
//   NEW:  DRX-MASS-{specialty}{med}{dose}{counter}  e.g. D2ME5001  (Diabetes-2, Metformin 500)
//
// The 8-char body is {specialty_code:1}{specialty_num:1}{med_initial:2}{dose_initial:1}{counter:03d}.
// This module derives those pieces from a unit's specialty bin + medication so
// `code-template.ts` can render them. The counter is still allocated per-location
// by the platform (see code_counters), which keeps each rendered code unique.
//
// NOTE (this is a DRAFT map): the single-letter specialty codes below are a
// proposal drawn from the clinic's SPECIALTY LOCATION sheet (27 bins). Every
// letter is distinct; tweak `SPECIALTY_LETTERS` if the team wants different
// initials — nothing else depends on the specific letters.

/**
 * Base specialty (uppercased, no bin number) -> single-letter code.
 * Diabetes = "D" is fixed by the team's example (D2ME5001); the rest are a
 * mnemonic proposal with no collisions.
 */
export const SPECIALTY_LETTERS: Readonly<Record<string, string>> = {
  CARDIO: "C",
  CARDIOLOGY: "C",
  GI: "G",
  PSYCH: "P",
  NSAID: "N",
  NEURO: "R", // neuRo — keeps N free for NSAID
  NEUROLOGY: "R",
  UROLOGY: "U",
  URO: "U",
  OTC: "O",
  DIABETES: "D",
  THYROID: "T",
  ENDOCRINE: "E",
  MISC: "M",
  EYE: "Y",
  OPTHO: "Y",
  ANTIVIRAL: "A",
  BACT: "A",
  PAA: "Q",
  EPINEPHRINE: "X",
};

/** Fallback letter when a specialty has no mapping (mirrors the "Hold" bin). */
export const UNMAPPED_SPECIALTY_LETTER = "Z";

export interface MassCodeAttributes {
  readonly specialty_code: string;
  readonly specialty_num: string;
  readonly med_initial: string;
  readonly dose_initial: string;
}

/**
 * Split a specialty bin label into its base specialty word and bin number.
 * Examples: "PSYCH 1" -> ["PSYCH","1"];  "CARDIOLOGY 3" -> ["CARDIOLOGY","3"];
 *           "ENDOCRINE/THYROID/DIABETES" -> ["ENDOCRINE","1"] (first token, default num 1).
 */
export function splitSpecialtyBin(bin: string): { base: string; num: string } {
  const raw = (bin ?? "").trim().toUpperCase();
  const numMatch = raw.match(/(\d+)\s*$/);
  const num = numMatch?.[1] ?? "1";
  const word = raw
    .replace(/\d+\s*$/, "")
    .split(/[\s/]+/)
    .filter(Boolean)[0];
  return { base: word ?? "", num };
}

/** Single-letter specialty code for a bin label (e.g. "DIABETES 1" -> "D"). */
export function specialtyCodeFor(bin: string): string {
  const { base } = splitSpecialtyBin(bin);
  return SPECIALTY_LETTERS[base] ?? UNMAPPED_SPECIALTY_LETTER;
}

/** First two alphabetic characters of a medication name, uppercased ("Metformin" -> "ME"). */
export function medInitial(name: string): string {
  const letters = (name ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return letters.slice(0, 2) || "XX";
}

/** First digit of a dosage string ("500" -> "5", "8.6-50" -> "8", "X" -> "0"). */
export function doseInitial(dosage: string): string {
  const m = (dosage ?? "").match(/\d/);
  return m?.[0] ?? "0";
}

/**
 * Derive the four NEW-format code attributes for a unit. Merge the result into
 * the item's `attributes` before rendering DRX_CODE_TEMPLATE (the template reads
 * them via {attr.specialty_code} etc.).
 */
export function deriveMassCodeAttributes(input: {
  specialtyBin: string;
  medicationName: string;
  dosage: string;
}): MassCodeAttributes {
  const { base, num } = splitSpecialtyBin(input.specialtyBin);
  return {
    specialty_code: SPECIALTY_LETTERS[base] ?? UNMAPPED_SPECIALTY_LETTER,
    specialty_num: num,
    med_initial: medInitial(input.medicationName),
    dose_initial: doseInitial(input.dosage),
  };
}
