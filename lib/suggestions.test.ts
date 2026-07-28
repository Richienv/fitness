import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestions, MAX_SUGGESTIONS, PROTEIN_FLOOR_G } from "./suggestions.ts";
import { modDelta, modSummary, modsFor, FOOD_MODS } from "./foodMods.ts";

test("an empty plate gets no suggestions — there's nothing to be missing from", () => {
  assert.deepEqual(suggestions({ tray: [], protein: 0 }), []);
});

test("a plate with no carb is told about rice, most confidently", () => {
  const out = suggestions({ tray: [{ id: "ayam-goreng", cat: "protein" }], protein: 40 });
  assert.equal(out[0].key, "nasi");
  assert.ok(out[0].conf > 0.9);
});

test("low protein surfaces the egg", () => {
  const out = suggestions({
    tray: [{ id: "nasi-putih", cat: "carb" }],
    protein: PROTEIN_FLOOR_G - 1,
  });
  assert.ok(out.some((s) => s.key === "telur"));
});

test("enough protein means no egg suggestion", () => {
  const out = suggestions({
    tray: [{ id: "nasi-putih", cat: "carb" }],
    protein: PROTEIN_FLOOR_G + 10,
  });
  assert.ok(!out.some((s) => s.key === "telur"));
});

test("something already in the tray is never suggested back", () => {
  const out = suggestions({
    tray: [{ id: "nasi-putih", cat: "carb" }, { id: "brokoli", cat: "vegetable" }],
    protein: 0,
  });
  assert.ok(!out.some((s) => s.key === "nasi"));
  assert.ok(!out.some((s) => s.key === "sayur"));
});

test("dismissed suggestions stay dismissed", () => {
  const tray = [{ id: "ayam-goreng", cat: "protein" }];
  assert.ok(suggestions({ tray, protein: 40 }).some((s) => s.key === "nasi"));
  const after = suggestions({ tray, protein: 40, dismissed: ["nasi"] });
  assert.ok(!after.some((s) => s.key === "nasi"));
});

test("every suggestion can be resolved by id OR by name", () => {
  // The ids come from the design prototype and may not exist in this app's
  // catalogue — the name matcher is what stops the feature silently vanishing.
  const out = suggestions({ tray: [{ id: "x", cat: "protein" }], protein: 0 });
  assert.ok(out.length > 0);
  for (const s of out) {
    assert.ok(s.candidates.length > 0, `${s.key} has candidate ids`);
    assert.ok(s.match instanceof RegExp, `${s.key} has a name matcher`);
    // The matcher must actually match at least one of its own candidates,
    // otherwise the two resolution paths disagree.
    assert.ok(
      s.candidates.some((c) => s.match.test(c.replace(/-/g, " "))),
      `${s.key}: matcher should match its own candidates`
    );
  }
});

test("the list is capped and ordered by confidence", () => {
  const out = suggestions({ tray: [{ id: "ayam-goreng", cat: "protein" }], protein: 0 });
  assert.ok(out.length <= MAX_SUGGESTIONS);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].conf >= out[i].conf);
});

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
