import { test } from "node:test";
import assert from "node:assert/strict";
import { modDelta, modSummary, modsFor, FOOD_MODS } from "./foodMods.ts";

test("add-on deltas are flat and sum together", () => {
  const d = modDelta(["minyak", "telur"]);
  assert.equal(d.kcal, 90 + 78);
  assert.equal(d.p, 6);
  assert.equal(d.f, 15);
});

test("a removed add-on can push macros down", () => {
  assert.equal(modDelta(["bakar"]).kcal, -80);
});

test("an unknown add-on key is ignored rather than throwing", () => {
  assert.deepEqual(modDelta(["nope"]), { kcal: 0, p: 0, c: 0, f: 0 });
  assert.equal(modDelta(["minyak", "nope"]).kcal, 90);
});

test("drinks are offered sugar options and never kerupuk", () => {
  const keys = modsFor("drink").map((m) => m.key);
  assert.ok(keys.includes("nogula"));
  assert.ok(!keys.includes("kerupuk"));
});

test("food is offered kerupuk and never 'tanpa gula'", () => {
  const keys = modsFor("carb").map((m) => m.key);
  assert.ok(keys.includes("kerupuk"));
  assert.ok(!keys.includes("nogula"));
});

test("'dibakar bukan goreng' is only offered on protein", () => {
  assert.ok(modsFor("protein").some((m) => m.key === "bakar"));
  assert.ok(!modsFor("carb").some((m) => m.key === "bakar"));
});

test("every add-on key is unique", () => {
  const keys = FOOD_MODS.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("the tray row reads as the dish plus what was added", () => {
  assert.equal(modSummary(["minyak", "nokulit"]), "extra minyak, tanpa kulit");
  assert.equal(modSummary([]), "");
});
