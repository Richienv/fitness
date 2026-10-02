import test from "node:test";
import assert from "node:assert/strict";
import { INGREDIENTS } from "./ingredients.ts";
import { satuanFor } from "./satuan.ts";
import {
  gramBasis,
  gramsToSave,
  itemMacros,
  portionModel,
  qtyFromGrams,
  trayTotals,
} from "./trayMath.ts";
import { modDelta, FOOD_MODS } from "./foodMods.ts";

// The 14 curated staples an audit found priced wrong at their DEFAULT portion.
// Each of these is a number a person logged as truth.
const WAS_MISPRICED = [
  "noodle-soup", "es-teh-manis", "caffe-latte", "es-kopi-susu", "starbucks-matcha-latte",
  "matcha-latte", "coconut-latte", "wonton-soup", "egg-drop-soup", "es-kopi-hitam",
  "sate-ayam", "sate-kambing", "telur-balado", "siomay-sambal",
];

const byId = (id: string) => {
  const f = INGREDIENTS.find((i) => i.id === id);
  assert.ok(f, `staple ${id} not found`);
  return f;
};

/** kcal at the sheet's DEFAULT portion, the way the new sheet computes it. */
function defaultKcal(id: string): number {
  const f = byId(id);
  const model = portionModel(f, satuanFor(f).portionG);
  const qty = qtyFromGrams(model.unitG, model.defaultG);
  return itemMacros(f, qty).kcal;
}

test("a food with no gram basis defaults to ONE unit — noodle soup is 380, not 950", () => {
  const f = byId("noodle-soup");
  assert.equal(gramBasis(f), null, "noodle soup has no real gram weight");
  assert.equal(Math.round(defaultKcal("noodle-soup")), Math.round(f.kcal));
});

test("every previously mispriced staple now opens at a sane multiple of its own number", () => {
  for (const id of WAS_MISPRICED) {
    const f = byId(id);
    const shown = defaultKcal(id);
    const ratio = shown / f.kcal;
    // Within a factor of 1.5 of the food's own stored number, i.e. about one unit.
    // The bug was ×2.5 and ×3.
    assert.ok(ratio > 0.6 && ratio < 1.5, `${id}: opens at ${Math.round(shown)} kkal vs stored ${f.kcal} (×${ratio.toFixed(2)})`);
  }
});

test("no curated staple opens at more than 1.6x its stored macros", () => {
  // The general property behind the list above: if a new staple is added with
  // no gram basis, this catches it before a user does.
  const worst: string[] = [];
  for (const f of INGREDIENTS) {
    const ratio = defaultKcal(f.id) / (f.kcal || 1);
    if (f.kcal > 0 && ratio > 1.6) worst.push(`${f.id} ×${ratio.toFixed(2)}`);
  }
  assert.deepEqual(worst, []);
});

test("a food WITH a gram basis still portions in grams, anchored on its serving", () => {
  const model = portionModel({ gramsPerUnit: 100 }, 120);
  assert.equal(model.mode, "grams");
  assert.equal(model.defaultG, 120);
  assert.equal(qtyFromGrams(100, 120), 1.2);
});

test("add-ons are part of the number — the tray total includes them", () => {
  // The bug: the sheet showed +35 kkal for extra sambal and the tray did not.
  const food = { name: "Test", kcal: 200, protein: 10, carbs: 20, fat: 8 };
  const plain = trayTotals([{ food, qty: 1 }]);
  const withSambal = trayTotals([{ food, qty: 1, mods: ["sambal"] }]);
  const d = modDelta(["sambal"]);
  assert.equal(withSambal.kcal, plain.kcal + d.kcal);
  assert.ok(d.kcal > 0);
});

test("add-ons are flat per entry, not scaled by portion", () => {
  const food = { kcal: 100, protein: 5, carbs: 10, fat: 4 };
  const half = itemMacros(food, 0.5, ["sambal"]);
  const triple = itemMacros(food, 3, ["sambal"]);
  const d = modDelta(["sambal"]);
  assert.equal(half.kcal, 50 + d.kcal);
  assert.equal(triple.kcal, 300 + d.kcal);
});

test("a subtractive add-on cannot make a negative meal", () => {
  const subtractive = FOOD_MODS.filter((m) => m.kcal < 0);
  assert.ok(subtractive.length > 0, "expected at least one subtractive mod to test with");
  const tiny = { kcal: 10, protein: 1, carbs: 1, fat: 1 };
  for (const m of subtractive) {
    const r = itemMacros(tiny, 1, [m.key]);
    assert.ok(r.kcal >= 0 && r.protein >= 0 && r.carbs >= 0 && r.fat >= 0, m.key);
  }
});

test("saved grams are 0 when the weight is unknown, never the quantity", () => {
  // "4 g" of soto: grams was set to qty for any food without gramsPerUnit.
  assert.equal(gramsToSave({ unit: "1 porsi" }, 4), 0);
  assert.equal(gramsToSave({ gramsPerUnit: 100 }, 1.5), 150);
  assert.equal(gramsToSave({ unit: "1 bowl (300g)" }, 2), 600);
});

test("the SIMPAN number and the saved number are the same function", () => {
  const entries = [
    { food: { kcal: 250, protein: 20, carbs: 10, fat: 15 }, qty: 1, mods: ["minyak"] },
    { food: { kcal: 130, protein: 3, carbs: 28, fat: 0 }, qty: 1.5 },
  ];
  const t = trayTotals(entries);
  const sum = entries.reduce((n, e) => n + itemMacros(e.food, e.qty, e.mods ?? []).kcal, 0);
  assert.equal(Math.round(t.kcal), Math.round(sum));
});
