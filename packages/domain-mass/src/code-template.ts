// DRX code template / generator for MASS.
// TODO: domain-mass agent fills this in

import type { CodeGenerator } from "@daana-health/inventory-core";

export const drxCodeGenerator: CodeGenerator = {
  format: "DRX-MASS-{LOCATION}-{counter:05d}",
  generate: () => "DRX-MASS-PLACEHOLDER",
};
