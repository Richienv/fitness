import test from "node:test";
import assert from "node:assert/strict";
import { cleanNumeric, validateParsedNutrition } from "./nutritionSchema.ts";

test("cleanNumeric strips units and commas while rejecting negatives and garbage", () => {
  assert.equal(cleanNumeric("12,5 g"), 12.5);
  assert.equal(cleanNumeric("251 mg"), 251);
  assert.equal(cleanNumeric(0), 0);
  assert.equal(cleanNumeric("-5"), null);
  assert.equal(cleanNumeric(""), null);
  assert.equal(cleanNumeric("abc"), null);
});

test("validateParsedNutrition accepts valid Indonesian per-serving payload with serving mass", () => {
  const res = validateParsedNutrition(
    {
      product_name: "Keripik Kentang",
      brand: "Contoh",
      serving_size: 30,
      serving_unit: "g",
      nutrition_basis: "per_serving",
      energy_kcal: "150",
      energy_kj: null,
      protein_g: "2,5",
      fat_g: 8,
      saturated_fat_g: 3.5,
      carbohydrate_g: 17,
      sugar_g: 1,
      fiber_g: 1.5,
      sodium_mg: 180,
      salt_g: null,
      confidence: 0.92,
      warnings: [],
    },
    "Takaran Saji 30 g\nEnergi Total 150 kkal",
  )!;
  assert.equal(res.productName, "Keripik Kentang");
  assert.equal(res.brand, "Contoh");
  assert.deepEqual(res.label.basis, { amount: 1, unit: "serving" });
  assert.deepEqual(res.label.servingSize, { amount: 30, unit: "g" });
  assert.equal(res.label.values.kcal, 150);
  assert.equal(res.label.values.protein, 2.5);
  assert.equal(res.label.values.sodium, 180);
  assert.equal(res.confidence, 92);
  assert.deepEqual(res.rejectedFields, []);
});

test("validateParsedNutrition converts Chinese kJ-only energy and keeps sodium separate from salt", () => {
  const res = validateParsedNutrition({
    nutrition_basis: "per_100g",
    energy_kcal: null,
    energy_kj: 2228,
    protein_g: 8.2,
    fat_g: 28.6,
    carbohydrate_g: 60.6,
    sodium_mg: 251,
    salt_g: null,
    confidence: 0.95,
    warnings: [],
  })!;
  assert.ok(Math.abs(res.label.values.kcal! - 2228 / 4.184) < 0.001);
  assert.equal(res.label.energyKj, 2228);
  assert.equal(res.label.values.sodium, 251);
  assert.equal(res.label.values.salt, null);
});

test("validateParsedNutrition rejects implausible per-100g values and flags rule violations", () => {
  const res = validateParsedNutrition({
    nutrition_basis: "per_100g",
    energy_kcal: 2200, // kJ mistakenly put in kcal field!
    protein_g: 150, // > 100 g per 100 g
    fat_g: 0,
    carbohydrate_g: 0,
    sodium_mg: 8000,
    confidence: 0.65,
    warnings: [],
  })!;
  assert.equal(res.label.values.kcal, null);
  assert.equal(res.label.values.protein, null);
  assert.ok(res.rejectedFields.includes("energy_kcal"));
  assert.ok(res.rejectedFields.includes("protein_g"));
  assert.ok(res.label.warnings.some((w) => w.includes("Natrium")));
  assert.ok(res.label.warnings.some((w) => w.includes("Keyakinan")));
});

test("validateParsedNutrition flags per_serving without serving size and zero macros with high energy", () => {
  const res = validateParsedNutrition({
    nutrition_basis: "per_serving",
    serving_size: null,
    serving_unit: null,
    energy_kcal: 200,
    protein_g: 0,
    fat_g: 0,
    carbohydrate_g: 0,
    confidence: 0.9,
    warnings: [],
  })!;
  assert.ok(res.label.warnings.some((w) => w.includes("takaran saji")));
  assert.ok(res.label.warnings.some((w) => w.includes("semua makro 0")));
});
