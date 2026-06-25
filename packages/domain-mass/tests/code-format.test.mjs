// Tests for the NEW specialty-based DRX code format.
// Runs against the built package (pnpm build first): node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDrxCodeGenerator,
  deriveMassCodeAttributes,
  specialtyCodeFor,
  splitSpecialtyBin,
  medInitial,
  doseInitial,
  DRX_CODE_TEMPLATE,
} from "../dist/index.js";

function render(bin, name, dose, counter) {
  const attributes = deriveMassCodeAttributes({
    specialtyBin: bin,
    medicationName: name,
    dosage: dose,
  });
  return createDrxCodeGenerator().generate({
    itemTypeId: "t",
    itemTypeName: "medication",
    locationCode: bin,
    counter,
    attributes,
  });
}

test("template is the specialty-based format", () => {
  assert.equal(
    DRX_CODE_TEMPLATE,
    "DRX-MASS-{attr.specialty_code}{attr.specialty_num}{attr.med_initial}{attr.dose_initial}{counter:03d}",
  );
});

test("matches the team's worked example: Diabetes-2 Metformin 500mg -> D2ME5001", () => {
  assert.equal(render("DIABETES 2", "Metformin", "500", 1), "DRX-MASS-D2ME5001");
});

test("derives the four code attributes", () => {
  assert.deepEqual(
    deriveMassCodeAttributes({ specialtyBin: "DIABETES 2", medicationName: "Metformin", dosage: "500" }),
    { specialty_code: "D", specialty_num: "2", med_initial: "ME", dose_initial: "5" },
  );
});

test("specialty letters + bin numbers across bins", () => {
  assert.equal(specialtyCodeFor("PSYCH 1"), "P");
  assert.equal(specialtyCodeFor("CARDIO 1"), "C");
  assert.equal(specialtyCodeFor("CARDIOLOGY 3"), "C");
  assert.equal(specialtyCodeFor("NSAID 1"), "N");
  assert.equal(specialtyCodeFor("NEURO 1"), "R"); // distinct from NSAID's N
  assert.equal(specialtyCodeFor("UROLOGY 2"), "U");
  assert.equal(specialtyCodeFor("ENDOCRINE/THYROID/DIABETES"), "E"); // first token wins
  assert.equal(splitSpecialtyBin("CARDIOLOGY 3").num, "3");
  assert.equal(splitSpecialtyBin("THYROID").num, "1"); // no number -> default 1
});

test("med initial = first two letters; dose initial = first digit", () => {
  assert.equal(medInitial("Lisinopril"), "LI");
  assert.equal(medInitial("CO Q"), "CO");
  assert.equal(doseInitial("8.6-50"), "8");
  assert.equal(doseInitial("500"), "5");
});

test("counter zero-pads to 3 digits and stays unique per render", () => {
  assert.equal(render("CARDIO 1", "Atorvastatin", "40", 42), "DRX-MASS-C1AT4042");
  assert.equal(render("CARDIO 1", "Atorvastatin", "40", 7), "DRX-MASS-C1AT4007");
});

test("unmapped specialty falls back to Z, never throws", () => {
  assert.equal(specialtyCodeFor("MADE UP BIN"), "Z");
  assert.equal(render("MADE UP BIN", "Aspirin", "325", 1), "DRX-MASS-Z1AS3001");
});
