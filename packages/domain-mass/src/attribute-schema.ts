// Medication attribute schema for the MASS domain.
//
// Mirrors the "Required Fields" + "Editable Fields" sections of the MASS MVP spec.
// Required: medication_name, dosage, unit, form, specialty_class
// Optional: quantity, notes
//
// `form` enum tracks the spec's Label Fields enumeration:
//   Bottle, Card, Cream, Nasal Spray, Insulin Pen, Injection, Other.
//
// Note: `expiry_date` is NOT in this schema — it lives on the core `items.expiry_date`
// column (every item type tracks expiry generically). The MASS-specific *requirement*
// that medications must have an expiry date is enforced by a domain validator
// (see validators.ts → requireExpiryForMedications) which also encodes the spec's
// fallback rule: "10 years before today's date".

import type { AttributeSchema } from "@daana-health/inventory-core";

/** Allowed values for `attributes.form`. Source: MASS MVP spec § Label Fields. */
export const MEDICATION_FORMS = [
  "Bottle",
  "Card",
  "Cream",
  "Nasal Spray",
  "Insulin Pen",
  "Injection",
  "Other",
] as const;

export type MedicationForm = (typeof MEDICATION_FORMS)[number];

export const medicationAttributeSchema: AttributeSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    medication_name: {
      type: "string",
      description: "Generic or brand name as written on the donor packaging.",
    },
    dosage: {
      type: "string",
      description:
        "Numeric dose value as a string to preserve donor labeling (e.g. '10', '0.5', '500/125'). Unit lives in `unit`.",
    },
    unit: {
      type: "string",
      description: "Dose unit, e.g. 'mg', 'mcg', 'mL', 'IU', 'puffs'.",
    },
    form: {
      type: "string",
      enum: MEDICATION_FORMS,
      description: "Physical form of the medication unit.",
    },
    specialty_class: {
      type: "string",
      description:
        "Classification label from the Medication Classification Guide (e.g. 'CARDIO', 'PSYCH', 'Hold').",
    },
    quantity: {
      type: "integer",
      minimum: 0,
      description: "Optional unit count (tablets per bottle, mL per vial, etc.).",
    },
    notes: {
      type: "string",
      description: "Free-text intake notes.",
    },
    /**
     * Set to true by a superadmin after they personally reviewed a high-risk
     * class. Consumed by requireSpecialtyReviewForHighRisk in validators.ts.
     */
    supervisor_acknowledged: {
      type: "boolean",
      description:
        "Marks supervisor sign-off for classes whose Medication Classification Guide row sets supervisor_review: true.",
    },
  },
  required: ["medication_name", "dosage", "unit", "form", "specialty_class"],
  additionalProperties: true,
};

/**
 * Typed view over `Item.attributes` for code that operates strictly within the
 * MASS medication item type. Use this when you've already type-narrowed by item
 * type; the core platform does not enforce this shape at the row level — only
 * the JSON Schema above is enforced at write time.
 */
export interface MedicationAttributes {
  medication_name: string;
  dosage: string;
  unit: string;
  form: MedicationForm;
  specialty_class: string;
  quantity?: number;
  notes?: string;
  supervisor_acknowledged?: boolean;
  // Optional extra fields used by code template Option 2/3 if it is ever swapped in.
  med_initial?: string;
  dose_initial?: string;
  specialty_code?: string;
  specialty_num?: string;
  lr_code?: string;
}
