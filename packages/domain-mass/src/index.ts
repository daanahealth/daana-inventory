// @daana-health/domain-mass
// DaanaRX MASS Clinic domain pack: medication attribute schema, DRX codes,
// classification rules, label renderer, and validators.
//
// Quick start:
//
//   import { MASS_ITEM_TYPE } from "@daana-health/domain-mass";
//   platform.registerItemType(MASS_ITEM_TYPE);
//
// Individual modules are re-exported for callers that want narrower imports
// (e.g. just the classification guide for a settings UI, or just the label
// component for a print sheet).

export * from "./attribute-schema.js";
export * from "./classification.js";
export * from "./code-template.js";
export * from "./labels.js";
export * from "./validators.js";
export * from "./config.js";
