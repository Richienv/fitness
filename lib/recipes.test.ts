import test from "node:test";
import assert from "node:assert/strict";
import { recipeNutrition } from "./recipes.ts";
import { parseBarcodeProduct } from "./barcode.ts";
const rice = {
  id: "rice",
  name: "Nasi",
  unit: "100 g",
  gramsPerUnit: 100,
  kcal: 130,
  protein: 2.5,
  carbs: 28,
  fat: 0.3,
};
test("recipe divides ingredients and added oil across servings without rounding each ingredient", () => {
  const oil = {
    ...rice,
    id: "oil",
    name: "Minyak",
    kcal: 884,
    protein: 0,
    carbs: 0,
    fat: 100,
  };
  const n = recipeNutrition(
    [
      { food: rice, quantity: 300, estimated: false },
      { food: oil, quantity: 10, estimated: true },
    ],
    2,
  );
  assert.equal(n.kcal, 239.2);
  assert.equal(n.carbs, 42);
  assert.equal(n.grams, 155);
});
test("unknown ingredient weights stay unknown while unit counts retain nutrient totals", () => {
  const egg = { ...rice, unit: "1 butir", gramsPerUnit: undefined, kcal: 72 };
  const n = recipeNutrition(
    [
      { food: rice, quantity: 100, estimated: false },
      { food: egg, quantity: 2, estimated: false },
    ],
    2,
  );
  assert.equal(n.kcal, 137);
  assert.equal(n.grams, null);
});
test("barcode keeps missing nutrients null and actual zero values zero", () => {
  const p = parseBarcodeProduct(
    {
      product: {
        product_name: "Produk",
        nutriments: { "energy-kcal_100g": 0, proteins_100g: 0 },
      },
    },
    "12345678",
  );
  assert.equal(p?.kcal, 0);
  assert.equal(p?.protein, 0);
  assert.equal(p?.carbs, null);
  assert.equal(p?.fat, null);
});
test("barcode recognizes per-serving values and converts documented kJ energy", () => {
  const p = parseBarcodeProduct(
    {
      product: {
        product_name: "Minuman",
        serving_size: "200 ml",
        nutriments: { energy_serving: 418.4, proteins_serving: 2 },
      },
    },
    "12345678",
  );
  assert.equal(p?.basis, "serving");
  assert.ok(Math.abs(p!.kcal! - 100) < 1e-9);
  assert.equal(p?.protein, 2);
});
test("barcode recognizes volume without a space and does not mix serving with 100g values", () => {
  const p = parseBarcodeProduct(
    {
      product: {
        product_name: "Susu",
        quantity: "1L",
        nutriments: {
          "energy-kcal_100g": 40,
          proteins_serving: 8,
          carbohydrates_100g: 5,
          fat_100g: 1,
        },
      },
    },
    "12345678",
  );
  assert.equal(p?.basis, "ml");
  assert.equal(p?.protein, null);
  assert.equal(p?.kcal, 40);
});
test("recipe carries unknown sugar and declared household weights honestly", () => {
  const food = { ...rice, gramsPerUnit: undefined, unit: "1 mangkuk (200 g)" };
  const n = recipeNutrition([{ food, quantity: 400, estimated: true }], 2);
  assert.equal(n.kcal, 130);
  assert.equal(n.grams, 200);
  assert.equal(n.sugar, null);
});
test("recipe retains known label extras and leaves incomplete mixtures unknown", () => {
  const parts = [
    {
      food: {
        id: "label",
        name: "Label",
        unit: "100g",
        gramsPerUnit: 100,
        kcal: 533,
        protein: 8.2,
        carbs: 60.6,
        fat: 28.6,
        sodium: 251,
        sugar: 18,
        saturatedFat: 16,
        transFat: 0,
      },
      quantity: 30,
      estimated: false,
    },
  ];
  const n = recipeNutrition(parts, 2);
  assert.equal(n.sodium, 37.65);
  assert.equal(n.saturatedFat, 2.4);
  assert.equal(n.transFat, 0);
  assert.equal(n.salt, null);
  const mixed = recipeNutrition([
    ...parts,
    {
      food: {
        id: "plain",
        name: "Plain",
        unit: "100g",
        gramsPerUnit: 100,
        kcal: 100,
        protein: 1,
        carbs: 20,
        fat: 1,
      },
      quantity: 100,
      estimated: false,
    },
  ]);
  assert.equal(mixed.sodium, null);
});
