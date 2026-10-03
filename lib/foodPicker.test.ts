import test from "node:test";
import assert from "node:assert/strict";
import { buildFamilies } from "./foodFamilies.ts";
import { applyPick, buildTiles, facetRows, leavesFor } from "./foodTiles.ts";
import { makePredictor } from "./foodPredict.ts";
import { openingChoice, stableOptionOrder } from "./foodPicker.ts";
import { normalizeFoodPicks, recordFoodPick, getFoodPicks } from "./foodPicks.ts";
import { normalizeAffinity, recordAffinity, topAffinity } from "./foodAffinity.ts";
import { setActiveUser } from "./userScope.ts";
import { normalizeCatalogueFoods } from "./foodCatalogue.ts";

const now = 1_000_000_000;
const foods = [
  { id: "plain", name: "Ayam goreng", popularity: 100 },
  { id: "thigh", name: "Ayam goreng paha", popularity: 20 },
  { id: "breast", name: "Ayam rebus dada", popularity: 30 },
];
const family = buildTiles(buildFamilies(foods)).find((t) => t.id === "ayam")!.family;
const predictor = (history: { id: string; count: number; last: number }[] = []) => makePredictor({ affinity: () => 0, history, now });

test("first-time opening selects a real plain preparation", () => {
  const choice = openingChoice(family, predictor())!;
  assert.equal(choice.leaf.food.id, "plain");
  assert.ok(leavesFor(family, choice.picks).includes(choice.leaf));
});

test("cold-start rice prefers the available plain staple over a variety bucket", () => {
  const rice = buildTiles(buildFamilies([{ id: "white-rice", name: "White rice", popularity: 130 }, { id: "yellow", name: "Nasi kuning", popularity: 130 }])).find((t) => t.id === "nasi")!;
  assert.equal(openingChoice(rice.family, predictor())?.leaf.food.id, "white-rice");
});

test("returning user opens on the confirmed usual cut, not the generic row", () => {
  const p = predictor([{ id: "thigh", count: 12, last: now }]);
  assert.equal(openingChoice(family, p)?.leaf.food.id, "thigh");
  assert.equal(openingChoice(family, p)?.picks.cut, "paha");
});

test("a recent new usual overtakes an abandoned habit", () => {
  const p = predictor([
    { id: "thigh", count: 30, last: now - 365 * 86_400_000 },
    { id: "breast", count: 4, last: now },
  ]);
  assert.equal(openingChoice(family, p)?.leaf.food.id, "breast");
});

test("unavailable saved food is ignored; an empty category has no selection", () => {
  const p = predictor([{ id: "removed", count: 100, last: now }]);
  assert.equal(openingChoice(family, p)?.leaf.food.id, "plain");
  assert.equal(openingChoice({ ...family, leaves: [] }, p), null);
});

test("corrupt history and non-finite affinity cannot poison ranking", () => {
  const p = makePredictor({ affinity: () => NaN, now, history: [{ id: "thigh", count: NaN, last: now }] });
  assert.equal(openingChoice(family, p)?.leaf.food.id, "plain");
  for (const raw of [null, [], 4, "bad", { wrong: { id: "x", count: 2 } }]) {
    assert.deepEqual(normalizeFoodPicks(raw), {});
    assert.deepEqual(normalizeAffinity(raw).foods, {});
  }
});

test("corrupt catalogue rows are discarded without losing healthy rows", () => {
  assert.deepEqual(normalizeCatalogueFoods({ foods: "bad" }), []);
  const rows = normalizeCatalogueFoods([null, { sourceCode: "broken" }, { sourceCode: "bad-number", name: "Ayam", energy_kcal: "200" }, { sourceCode: "good", name: "Ayam", energy_kcal: 200, popularity: NaN, portionG: -1 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceCode, "good");
  assert.equal(rows[0].popularity, null);
  assert.equal(rows[0].portionG, null);
});

test("equal scores have stable id ties even if catalogue input reverses", () => {
  const pool = buildFamilies([{ id: "z", name: "Ayam dada" }, { id: "a", name: "Ayam paha" }]).families.get("ayam")!.leaves;
  assert.deepEqual(predictor().orderLeaves(pool).map((l) => l.food.id), predictor().orderLeaves([...pool].reverse()).map((l) => l.food.id));
});

test("an incompatible cooking choice drops the cut and still lands on a real food", () => {
  const initial = openingChoice(family, predictor([{ id: "thigh", count: 10, last: now }]))!;
  assert.ok(facetRows(family, initial.picks).find((r) => r.axis === "prep")?.options.some((o) => o.value === "rebus"));
  const next = applyPick(family, initial.picks, "prep", "rebus");
  assert.equal(next.prep, "rebus");
  assert.equal(next.cut, undefined);
  assert.equal(leavesFor(family, next)[0]?.food.id, "breast");
});

test("option filtering never reorders existing controls during interaction", () => {
  const initial = stableOptionOrder(["paha", "dada", "sayap"], [], (x) => x);
  const next = stableOptionOrder(["sayap", "paha", "baru"], initial.order, (x) => x);
  assert.deepEqual(next.options, ["paha", "sayap", "baru"]);
});

test("ranking does not learn; confirmed additions learn once and stay per-user", () => {
  const data = new Map<string, string>();
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } } });
  try {
    setActiveUser("test-a");
    openingChoice(family, predictor());
    assert.equal(data.size, 0);
    const input = { id: "thigh", name: "Ayam goreng paha", kcal: 100, protein: 10, fat: 5, carbs: 0 };
    recordFoodPick(input); recordAffinity(input.id);
    assert.equal(getFoodPicks()[0]?.count, 1);
    assert.equal(topAffinity(1)[0]?.id, "thigh");
    setActiveUser("test-b");
    assert.deepEqual(topAffinity(1), []);
    recordAffinity("breast");
    assert.equal(topAffinity(1)[0]?.id, "breast");
    setActiveUser("test-a");
    assert.equal(topAffinity(1)[0]?.id, "thigh");
  } finally {
    setActiveUser(null);
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
