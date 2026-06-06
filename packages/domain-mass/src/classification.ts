// Medication classification rules (controlled substance schedules, etc.).
// TODO: domain-mass agent fills this in

export interface ClassificationRule {
  readonly id: string;
  readonly label: string;
}

export const massClassifications: readonly ClassificationRule[] = [];
