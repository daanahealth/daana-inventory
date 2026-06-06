// MASS_ITEM_TYPE — the single ItemTypeConfig that a backend or frontend
// imports to register the MASS medication domain with the core platform.
//
// Bundles together:
//   - the JSON Schema for medication attributes
//   - the DRX-MASS-{LOCATION}-{counter:05d} code template
//   - the cross-field validators (expiry required, supervisor review)
//   - a `labelComponent` reference so generic UI can render the printable label
//
// Note: `ItemTypeConfig` (from inventory-core) does not currently include a
// labelComponent slot. We extend it here with a domain-pack-specific shape so
// MASS consumers get a single source of truth. Generic platform code that
// only needs the core fields can still consume it as `ItemTypeConfig` via
// structural typing.

import type { ItemTypeConfig } from "@daana-health/inventory-core";
import { medicationAttributeSchema } from "./attribute-schema.js";
import { DRX_CODE_TEMPLATE } from "./code-template.js";
import { MedicationLabel } from "./labels.js";
import { massMedicationValidators } from "./validators.js";

/** Stable item-type name. Must match the `item_types.name` row in the DB. */
export const MASS_ITEM_TYPE_NAME = "medication" as const;

/**
 * MASS domain pack registration. This is the **single import** a backend
 * (RPC registry) or frontend (form/label registry) needs to wire up the
 * MASS medication item type against the generic core platform.
 */
export interface MassItemTypeConfig extends ItemTypeConfig {
  /** React component that renders the printable label for an item of this type. */
  readonly labelComponent: typeof MedicationLabel;
}

export const MASS_ITEM_TYPE: MassItemTypeConfig = {
  name: MASS_ITEM_TYPE_NAME,
  codeFormatTemplate: DRX_CODE_TEMPLATE,
  attributeSchema: medicationAttributeSchema,
  validators: massMedicationValidators,
  labelComponent: MedicationLabel,
};
