// Validator framework.
//
// Domain packs register validators against item-type names. The platform
// runs the JSON-Schema check against item.attributes FIRST (handled by a
// separate ajv-based runtime), and THEN invokes every registered validator
// for the item's type. Validators are pure functions; they may inspect any
// part of the item but must not perform I/O.

import type { Item } from "./types.js";

export interface ValidationIssue {
  readonly path: string;          // dotted path into the item, e.g. "attributes.dosage"
  readonly message: string;
  readonly code?: string;         // stable machine-readable code for i18n / tests
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

export type Validator<T = Item> = (value: T) => ValidationResult;

/**
 * Registry of (itemTypeName -> Validator[]) pairs. Domain packs call
 * `register(itemTypeName, validator)` at module init time.
 */
export class ValidatorRegistry {
  private readonly byType = new Map<string, Validator<Item>[]>();

  register(itemTypeName: string, validator: Validator<Item>): void {
    const list = this.byType.get(itemTypeName) ?? [];
    list.push(validator);
    this.byType.set(itemTypeName, list);
  }

  /**
   * Get all validators registered for a given item-type name. Returns an
   * empty array if none registered (not an error — many item types only
   * need JSON-Schema validation).
   */
  get(itemTypeName: string): readonly Validator<Item>[] {
    return this.byType.get(itemTypeName) ?? [];
  }

  /**
   * Run every validator registered for the item's type. Aggregates all
   * issues; does NOT short-circuit on first failure.
   */
  validate(itemTypeName: string, item: Item): ValidationResult {
    const validators = this.get(itemTypeName);
    const issues: ValidationIssue[] = [];
    for (const v of validators) {
      const r = v(item);
      if (!r.ok) issues.push(...r.issues);
    }
    return { ok: issues.length === 0, issues };
  }
}

/**
 * Helper: build a successful ValidationResult.
 */
export const ok: ValidationResult = { ok: true, issues: [] };

/**
 * Helper: build a failing ValidationResult from one or more issues.
 */
export function fail(...issues: ValidationIssue[]): ValidationResult {
  return { ok: false, issues };
}
