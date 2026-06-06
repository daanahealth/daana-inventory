// MASS medication label renderer.
//
// Renders the printable label per MASS MVP spec § Label Fields:
//
//   "Medication: {name}  Dose: {dosage} {unit}  Form: {form}  Code: {unit_code}"
//
// Labels are pre-printed with blank spaces and filled in by hand. This
// component is the on-screen "label overview" shown to the user during
// Check In step 6 (system displays label overview with all required fields)
// and is also reused on the print sheet via the `print:` Tailwind variants.
//
// Marked `'use client'` so it renders inside Next.js App Router server pages
// without forcing the whole tree to client-render. The component itself uses
// no hooks; the marker is a hedge for callers that wrap it in interactive UI.

"use client";

import type { Item } from "@daana-health/inventory-core";
import type { ReactElement } from "react";
import type { MedicationAttributes } from "./attribute-schema.js";

export interface MedicationLabelProps {
  /** The inventory item to render a label for. Attributes must conform to MedicationAttributes. */
  readonly item: Item;
  /** Optional extra className appended to the root container. */
  readonly className?: string;
}

/**
 * Render a MASS medication label.
 *
 * The DOM is monochrome by default and uses `print:` utilities so it is
 * legible when sent to a label printer. Fields are arranged in the exact
 * order specified by the spec.
 */
export function MedicationLabel({
  item,
  className,
}: MedicationLabelProps): ReactElement {
  const attrs = item.attributes as Partial<MedicationAttributes>;
  const medicationName = attrs.medication_name ?? "—";
  const dosage = attrs.dosage ?? "—";
  const unit = attrs.unit ?? "";
  const form = attrs.form ?? "—";
  const unitCode = item.unitCode || "—";

  const rootClass = [
    // On-screen: card-like, neutral palette so the label reads like physical paper.
    "inline-block",
    "border",
    "border-black",
    "bg-white",
    "text-black",
    "px-4",
    "py-3",
    "font-sans",
    "leading-snug",
    // Print: maximize contrast + size for the label sheet.
    "print:border-2",
    "print:border-black",
    "print:bg-white",
    "print:text-black",
    "print:p-4",
    "print:break-inside-avoid",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const rowClass =
    "flex flex-wrap items-baseline gap-x-4 gap-y-1 text-lg print:text-2xl";
  const labelClass =
    "font-semibold uppercase tracking-wide text-sm print:text-base";
  const valueClass = "font-medium";

  return (
    <div className={rootClass} data-testid="mass-medication-label">
      <div className={rowClass}>
        <span>
          <span className={labelClass}>Medication:</span>{" "}
          <span className={valueClass}>{medicationName}</span>
        </span>
        <span>
          <span className={labelClass}>Dose:</span>{" "}
          <span className={valueClass}>
            {dosage}
            {unit ? ` ${unit}` : ""}
          </span>
        </span>
        <span>
          <span className={labelClass}>Form:</span>{" "}
          <span className={valueClass}>{form}</span>
        </span>
        <span>
          <span className={labelClass}>Code:</span>{" "}
          <span className={`${valueClass} font-mono tracking-wider`}>
            {unitCode}
          </span>
        </span>
      </div>
    </div>
  );
}

export default MedicationLabel;
