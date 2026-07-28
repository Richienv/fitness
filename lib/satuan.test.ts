import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSatuan,
  resolveSatuan,
  satuanLine,
  satuanFor,
  nearestStep,
  gramsFromUnit,
  baseGrams,
  PORTION_STEPS,
} from "./satuan.ts";

test("a measure splits into its count and its noun", () => {
  assert.deepEqual(parseSatuan("5 tusuk"), { n: 5, noun: "tusuk" });
  assert.deepEqual(parseSatuan("1 porsi"), { n: 1, noun: "porsi" });
  assert.deepEqual(parseSatuan("6 pcs"), { n: 6, noun: "pcs" });
});

test("a bare noun counts as one of it", () => {
  assert.deepEqual(parseSatuan("mangkok"), { n: 1, noun: "mangkok" });
});

test("missing or junk serving data still yields a usable measure", () => {
  assert.deepEqual(parseSatuan(""), { n: 1, noun: "porsi" });
  assert.deepEqual(parseSatuan(undefined), { n: 1, noun: "porsi" });
  assert.deepEqual(parseSatuan("0 tusuk"), { n: 1, noun: "tusuk" });
});

test("doubling multiplies the count through — never '2 × 5 tusuk'", () => {
  assert.equal(resolveSatuan("5 tusuk", 2), "10 tusuk");
  assert.equal(resolveSatuan("1 butir", 0.5), "0.5 butir");
  assert.equal(resolveSatuan("2 potong", 1.5), "3 potong");
  assert.ok(!resolveSatuan("5 tusuk", 2).includes("×"));
});

test("a food with no serving info falls back to porsi", () => {
  assert.equal(resolveSatuan(null, 3), "3 porsi");
});

test("the descriptor line pairs the measure with its grams", () => {
  assert.equal(satuanLine("1 porsi", 200), "1 porsi · 200g");
  assert.equal(satuanLine("5 tusuk", 120), "5 tusuk · 120g");
});

test("satuanFor prefers the serving matching the default portion", () => {
  const f = {
    portionG: 120,
    servings: [
      { label: "1 tusuk", grams: 24 },
      { label: "5 tusuk", grams: 120 },
    ],
  };
  assert.equal(satuanFor(f).label, "5 tusuk");
  assert.equal(satuanFor(f).portionG, 120);
});

test("satuanFor degrades to '1 porsi' rather than showing 100 g", () => {
  const got = satuanFor({ name: "Zzz unknown thing", portionG: null, servings: [], gramsPerUnit: 100 });
  assert.equal(got.label, "1 porsi");
  assert.equal(got.portionG, 100);
  assert.equal(satuanLine(got.label, got.portionG), "1 porsi · 100g");
});

test("a catalogue row with no serving data still gets a human measure", () => {
  const cases: [string, string, number][] = [
    ["Nasi putih", "1 porsi", 200],
    ["Nasi goreng spesial", "1 porsi", 300],
    ["Telur rebus", "1 butir", 50],
    ["Ayam goreng", "1 potong", 120],
    ["Dada ayam panggang", "1 fillet", 150],
    ["Sate ayam (5 skewers)", "5 tusuk", 120],
    ["Tempe goreng", "2 potong", 80],
    ["Mie ayam", "1 mangkok", 250],
    ["Bakso sapi", "1 mangkok", 200],
    ["Soto ayam", "1 mangkok", 400],
    ["Oat instan", "1 saset", 40],
    ["Pisang ambon", "1 buah", 120],
    ["Sushi salmon", "6 pcs", 150],
    ["Sambal terasi", "1 sdm", 25],
    ["Es teh manis", "1 gelas", 300],
  ];
  for (const [name, label, grams] of cases) {
    const got = satuanFor({ name, portionG: null, servings: [] });
    assert.equal(got.label, label, `${name} label`);
    assert.equal(got.portionG, grams, `${name} grams`);
  }
});

test("nasi goreng is matched before the generic 'nasi' rule", () => {
  assert.equal(satuanFor({ name: "Nasi goreng" }).portionG, 300);
  assert.equal(satuanFor({ name: "Nasi uduk" }).portionG, 200);
});

test("real serving data always beats the name guess", () => {
  const got = satuanFor({
    name: "Nasi putih",
    portionG: 175,
    servings: [{ label: "1 centong", grams: 175 }],
  });
  assert.equal(got.label, "1 centong");
  assert.equal(got.portionG, 175);
});

test("a declared portion is kept even when the name is guessable", () => {
  // The food said 250 g; the heuristic must not override that to 200 g.
  assert.equal(satuanFor({ name: "Nasi putih", portionG: 250 }).portionG, 250);
});

test("a weight named in the unit string is read out", () => {
  assert.equal(gramsFromUnit("1 bowl (300g)"), 300);
  assert.equal(gramsFromUnit("150g"), 150);
  assert.equal(gramsFromUnit("1 breast (250g)"), 250);
  assert.equal(gramsFromUnit("1 scoop"), null);
  assert.equal(gramsFromUnit(undefined), null);
});

test("baseGrams says what the stored macros actually describe", () => {
  // DB rows and most library rows declare it.
  assert.equal(baseGrams({ gramsPerUnit: 100 }), 100);
  assert.equal(baseGrams({ gramsPerUnit: 250 }), 250);
  // No gramsPerUnit: the unit string names the weight. Defaulting to 100 here
  // is what turned one 350 kcal bowl of bubur into 875.
  assert.equal(baseGrams({ unit: "1 bowl (300g)" }), 300);
  // Neither: one stored unit is one portion, so the scale must come out as 1.
  assert.equal(baseGrams({ unit: "1 scoop", portionG: 40 }), 40);
  assert.equal(baseGrams({ unit: "1 porsi" }), 100);
});

test("a bowl of bubur stays one bowl of bubur", () => {
  // lib/ingredients shape: kcal is for ONE unit, and the unit weighs 300 g.
  const bubur = { name: "Bubur ayam", unit: "1 bowl (300g)", kcal: 350 };
  const { label, portionG } = satuanFor(bubur);
  assert.equal(portionG, 300, "the real weight beats the heuristic's 250 g");
  assert.equal(label, "1 mangkok", "but the Indonesian noun is still used");
  const portionKcal = Math.round((bubur.kcal * portionG) / baseGrams(bubur));
  assert.equal(portionKcal, 350);
});

test("a per-100g DB row scales to its portion", () => {
  const sate = { name: "Sate Ayam", gramsPerUnit: 100, kcal: 211, portionG: 200 };
  const { portionG } = satuanFor(sate);
  assert.equal(portionG, 200);
  assert.equal(Math.round((sate.kcal * portionG) / baseGrams(sate)), 422);
});

test("a typed weight snaps to the nearest slider stop", () => {
  // 200 g default portion: 100 g is the ½ stop, 600 g is the 3 stop.
  assert.equal(PORTION_STEPS[nearestStep(100, 200)].mult, 0.5);
  assert.equal(PORTION_STEPS[nearestStep(200, 200)].mult, 1);
  assert.equal(PORTION_STEPS[nearestStep(600, 200)].mult, 3);
  // Off-grid weights still land somewhere sane rather than index 0.
  assert.equal(PORTION_STEPS[nearestStep(210, 200)].mult, 1);
});

test("nearestStep survives a zero portion instead of dividing by it", () => {
  assert.equal(PORTION_STEPS[nearestStep(150, 0)].mult, 1);
});
