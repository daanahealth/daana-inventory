// Medication Classification Guide.
//
// Verbatim from the MASS MVP spec § "Medication Classification Guide" table.
// 14 rows: 13 specialty classes + 1 Hold/uncertain fallback.
//
// Each row carries:
//   - class_name        machine-friendly identifier matching attributes.specialty_class
//   - common_examples   example medications (for the in-app guide UI)
//   - location_code     the bin location code (e.g. "CARDIO", "Hold")
//   - two_digit_code    the 2-letter code reserved for barcode use
//   - supervisor_review true when a superadmin must personally review intake
//
// suggestLocationForClass() implements simple substring matching:
//   1. Exact match on class_name (case-insensitive)
//   2. Exact match on location_code
//   3. Match where the query is contained in any common_examples entry
//   4. Match where the query is contained in class_name
//   5. Fallback to the "Hold" row (supervisor_review required)

export interface ClassificationEntry {
  /** Stable identifier; matches `attributes.specialty_class`. */
  readonly class_name: string;
  /** Human-readable list of common medications in this class. */
  readonly common_examples: readonly string[];
  /** Bin location code suggested for this class (matches `locations.code`). */
  readonly location_code: string;
  /** 2-letter abbreviation reserved for barcode / Option-2/3 code templates. */
  readonly two_digit_code: string;
  /** When true, intake must be reviewed by a superadmin before completion. */
  readonly supervisor_review: boolean;
}

export const MASS_CLASSIFICATION_GUIDE: readonly ClassificationEntry[] = [
  {
    class_name: "CARDIO",
    common_examples: ["Lisinopril", "Metoprolol", "Amlodipine", "Furosemide"],
    location_code: "CARDIO",
    two_digit_code: "CD",
    supervisor_review: false,
  },
  {
    class_name: "LIPID",
    common_examples: ["Atorvastatin", "Rosuvastatin", "Simvastatin"],
    location_code: "LIPID",
    two_digit_code: "LD",
    supervisor_review: false,
  },
  {
    class_name: "PSYCH",
    common_examples: ["Sertraline", "Escitalopram", "Quetiapine", "Lithium"],
    location_code: "PSYCH",
    two_digit_code: "PS",
    supervisor_review: true,
  },
  {
    class_name: "PULM",
    common_examples: ["Albuterol", "Fluticasone", "Montelukast"],
    location_code: "PULM",
    two_digit_code: "PU",
    supervisor_review: false,
  },
  {
    class_name: "ENDOCRINE",
    common_examples: ["Metformin", "Glipizide", "Levothyroxine"],
    location_code: "ENDOCRINE",
    two_digit_code: "EN",
    supervisor_review: false,
  },
  {
    class_name: "INFECT",
    common_examples: ["Amoxicillin", "Azithromycin", "Fluconazole"],
    location_code: "INFECT",
    two_digit_code: "ID",
    supervisor_review: false,
  },
  {
    class_name: "PAINFLAM",
    common_examples: ["Ibuprofen", "Naproxen", "Meloxicam", "Gabapentin"],
    location_code: "PAINFLAM",
    two_digit_code: "NS",
    supervisor_review: false,
  },
  {
    class_name: "GASTRO",
    common_examples: ["Omeprazole", "Ondansetron", "Lactulose"],
    location_code: "GASTRO",
    two_digit_code: "GI",
    supervisor_review: false,
  },
  {
    class_name: "UROL",
    common_examples: ["Tamsulosin", "Oxybutynin", "Finasteride"],
    location_code: "UROL",
    two_digit_code: "UR",
    supervisor_review: false,
  },
  {
    class_name: "NEPHRO",
    common_examples: ["Sevelamer", "Sodium bicarbonate", "Calcitriol"],
    location_code: "NEPHRO",
    two_digit_code: "NP",
    supervisor_review: true,
  },
  {
    class_name: "SLEEP",
    common_examples: ["Zolpidem", "Melatonin", "Trazodone"],
    location_code: "SLEEP",
    two_digit_code: "SL",
    supervisor_review: true,
  },
  {
    class_name: "NEURO",
    common_examples: [
      "Donepezil",
      "Memantine",
      "Rivastigmine",
      "Topiramate",
      "Levetiracetam",
    ],
    location_code: "NEURO",
    two_digit_code: "NE",
    supervisor_review: true,
  },
  {
    class_name: "VITSUP",
    common_examples: ["Vitamin D", "B12", "Iron", "Folic acid", "Fish oil"],
    location_code: "VITSUP",
    two_digit_code: "VS",
    supervisor_review: false,
  },
  {
    class_name: "Hold",
    common_examples: [],
    location_code: "Hold",
    two_digit_code: "XX",
    supervisor_review: true,
  },
] as const;

/** Quick lookup map by class_name (uppercased) for O(1) exact-match. */
const BY_CLASS_NAME = new Map<string, ClassificationEntry>(
  MASS_CLASSIFICATION_GUIDE.map((e) => [e.class_name.toUpperCase(), e]),
);

/** Quick lookup map by location_code (uppercased). */
const BY_LOCATION_CODE = new Map<string, ClassificationEntry>(
  MASS_CLASSIFICATION_GUIDE.map((e) => [e.location_code.toUpperCase(), e]),
);

export interface LocationSuggestion {
  /** Suggested location_code (always non-null; defaults to "Hold"). */
  readonly location_code: string;
  /** The full classification entry chosen. */
  readonly entry: ClassificationEntry;
  /** How the suggestion was reached. Useful for explaining the choice in UI. */
  readonly match: "class_name" | "location_code" | "example" | "substring" | "fallback";
  /** True for the Hold fallback. */
  readonly requires_supervisor_review: boolean;
}

/**
 * Suggest a location bin code for a free-text class or medication name.
 *
 * Uses simple case-insensitive substring matching (no fuzzy/Levenshtein
 * matching). When no candidate is found, falls back to the "Hold" bin which
 * requires supervisor review per the classification guide.
 */
export function suggestLocationForClass(query: string): LocationSuggestion {
  const holdEntry = BY_CLASS_NAME.get("HOLD")!;
  const trimmed = query?.trim() ?? "";
  if (trimmed.length === 0) {
    return {
      location_code: holdEntry.location_code,
      entry: holdEntry,
      match: "fallback",
      requires_supervisor_review: true,
    };
  }
  const q = trimmed.toUpperCase();

  // 1. Exact class_name match.
  const byClass = BY_CLASS_NAME.get(q);
  if (byClass) {
    return {
      location_code: byClass.location_code,
      entry: byClass,
      match: "class_name",
      requires_supervisor_review: byClass.supervisor_review,
    };
  }

  // 2. Exact location_code match.
  const byLoc = BY_LOCATION_CODE.get(q);
  if (byLoc) {
    return {
      location_code: byLoc.location_code,
      entry: byLoc,
      match: "location_code",
      requires_supervisor_review: byLoc.supervisor_review,
    };
  }

  // 3. Query is contained in one of the common_examples (medication name match).
  for (const entry of MASS_CLASSIFICATION_GUIDE) {
    for (const example of entry.common_examples) {
      if (example.toUpperCase().includes(q) || q.includes(example.toUpperCase())) {
        return {
          location_code: entry.location_code,
          entry,
          match: "example",
          requires_supervisor_review: entry.supervisor_review,
        };
      }
    }
  }

  // 4. Query is contained in class_name (substring).
  for (const entry of MASS_CLASSIFICATION_GUIDE) {
    if (
      entry.class_name.toUpperCase().includes(q) ||
      q.includes(entry.class_name.toUpperCase())
    ) {
      return {
        location_code: entry.location_code,
        entry,
        match: "substring",
        requires_supervisor_review: entry.supervisor_review,
      };
    }
  }

  // 5. Fallback to Hold.
  return {
    location_code: holdEntry.location_code,
    entry: holdEntry,
    match: "fallback",
    requires_supervisor_review: true,
  };
}

/** Return the classification entry for a given class_name (case-insensitive), or undefined. */
export function findClassification(
  className: string,
): ClassificationEntry | undefined {
  return BY_CLASS_NAME.get(className.trim().toUpperCase());
}
