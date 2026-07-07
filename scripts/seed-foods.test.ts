// Validation for the food-composition seed. No DB required — parses the real
// data/tkpi_2019_full.csv + data/custom_foods.csv via the same module the seed
// uses (scripts/foodCsv.ts), plus the derived helpers in lib/foodComposition.ts.
//
//   node --experimental-strip-types --test scripts/seed-foods.test.ts
//   npm run test:foods

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFoodCsv, clampCopper, type FoodRow } from "./foodCsv.ts";
import {
  vitaminA_RAE,
  chlorideEst_mg,
  perServing,
} from "../lib/foodComposition.ts";

const DATA = join(process.cwd(), "data");
const tkpi = parseFoodCsv(readFileSync(join(DATA, "tkpi_2019_full.csv"), "utf8"));
const custom = parseFoodCsv(readFileSync(join(DATA, "custom_foods.csv"), "utf8"));

const byCode = (rows: FoodRow[], code: string): FoodRow => {
  const r = rows.find((x) => x.code === code);
  assert.ok(r, `row ${code} not found`);
  return r;
};

test("row counts", () => {
  assert.equal(tkpi.length, 1148);
  assert.equal(custom.length, 6);
});

test("spot values — DP031 (Gado-gado)", () => {
  const r = byCode(tkpi, "DP031");
  assert.equal(r.nutrients.energy_kcal, 137);
  assert.equal(r.nutrients.iron_mg, 7.5);
  assert.equal(r.nutrients.calcium_mg, 301);
});

test("spot values — FP062 (Rendang sapi)", () => {
  const r = byCode(tkpi, "FP062");
  assert.equal(r.nutrients.protein_g, 22.6);
  assert.equal(r.nutrients.iron_mg, 14.9);
});

test("spot values — AP019 (Maizena)", () => {
  const r = byCode(tkpi, "AP019");
  assert.equal(r.nutrients.energy_kcal, 341);
});

test("NULL handling — AP026 empty mineral cells parse to null (not 0)", () => {
  const r = byCode(tkpi, "AP026");
  assert.equal(r.nutrients.calcium_mg, null);
  assert.equal(r.nutrients.phosphorus_mg, null);
  assert.equal(r.nutrients.iron_mg, null);
  assert.equal(r.nutrients.sodium_mg, null);
  // sanity: a present value on the same row is a real number, not null
  assert.equal(r.nutrients.carb_g, 34.0);
});

test("copper clamp — value > 20 → null, normal value kept", () => {
  // Spec literal: a copper reading of 91.4 (implausible) clamps to null.
  assert.equal(clampCopper(91.4), null);
  // Exercise the clamp on a REAL parsed row: CP006 copper = 26.3 (data error).
  const cp006 = byCode(tkpi, "CP006");
  assert.equal(cp006.nutrients.copper_mg, 26.3);
  assert.equal(clampCopper(cp006.nutrients.copper_mg), null);
  // A plausible copper value is preserved.
  assert.equal(clampCopper(0.2), 0.2);
  // Null in → null out (never 0).
  assert.equal(clampCopper(null), null);
});

test("derived — vitaminA_RAE falls back to total/12 when beta null", () => {
  assert.equal(vitaminA_RAE(3, null, 5929), 3 + 5929 / 12);
});

test("derived — vitaminA_RAE all-null → null", () => {
  assert.equal(vitaminA_RAE(null, null, null), null);
});

test("derived — vitaminA_RAE prefers beta when present", () => {
  assert.equal(vitaminA_RAE(3, 120, 5929), 3 + 120 / 12);
});

test("derived — chlorideEst_mg", () => {
  assert.equal(chlorideEst_mg(100), 154);
  assert.equal(chlorideEst_mg(null), null);
});

test("derived — perServing null propagation", () => {
  assert.equal(perServing(null, 50), null);
  assert.equal(perServing(200, 50), 100);
});

test("custom foods carry portionGCooked", () => {
  const cf001 = byCode(custom, "CF001");
  assert.equal(cf001.portionGCooked, 323.0);
  assert.ok(cf001.note && cf001.note.length > 0);
});
