import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getHybridFoodCatalogue,
  loadBundledFoodCatalogue,
  mergeFoodCatalogue,
  resetBundledFoodCatalogueCacheForTest,
  searchHybridFoods,
  type DbOverlayFood,
} from "./serverFoodCatalogue.ts";

test("bundled CSV loader loads all 4,871+ foods across all 16 CSV packs", () => {
  resetBundledFoodCatalogueCacheForTest();
  const foods = loadBundledFoodCatalogue();
  assert.ok(foods.length >= 4871, `expected >= 4871 bundled foods, got ${foods.length}`);
  assert.ok(foods.some((f) => f.sourceCode === "DAY:day-babi-has-dalam"));
  assert.ok(foods.some((f) => f.sourceCode === "DFR:dfr-zh-fanqie-chaodan-light"));
});

test("hybrid catalogue and search work seamlessly when DB fails or is empty", async () => {
  const failingDb = async (): Promise<DbOverlayFood[]> => {
    throw new Error("Simulated Neon connection timeout");
  };
  const emptyDb = async (): Promise<DbOverlayFood[]> => [];

  const allFromFailedDb = await getHybridFoodCatalogue({ loadDb: failingDb });
  assert.ok(allFromFailedDb.length >= 4871);

  const queries = [
    ["babi", "babi"],
    ["daging babi", "babi"],
    ["samcan", "samcan"],
    ["has dalam babi", "has dalam"],
    ["char siu", "char siu"],
    ["番茄炒蛋", "tomat"],
    ["malatang", "malatang"],
  ] as const;

  for (const [q, expectedSubstr] of queries) {
    const hitsOnErr = await searchHybridFoods({ query: q, loadDb: failingDb });
    assert.ok(
      hitsOnErr.length > 0,
      `expected hits for "${q}" when DB throws`,
    );
    assert.ok(
      hitsOnErr.some((h) => h.name.toLowerCase().includes(expectedSubstr)),
      `expected "${expectedSubstr}" in results for "${q}", got: ${hitsOnErr.slice(0, 3).map((x) => x.name).join(", ")}`,
    );

    const hitsOnEmpty = await searchHybridFoods({ query: q, loadDb: emptyDb });
    assert.ok(hitsOnEmpty.length > 0, `expected hits for "${q}" with empty DB`);
  }
});

test("hybrid merge preserves canonical bundled CSV rows against stale DB and includes USER: additions", async () => {
  const bundled = loadBundledFoodCatalogue();
  const staleAndCustomDb: DbOverlayFood[] = [
    {
      id: "db-stale-1",
      sourceCode: "DAY:day-babi-has-dalam",
      name: "Stale Old DB Name Should Lose",
      nameEn: null,
      aliases: null,
      state: "Olahan",
      foodGroup: "Daging",
      cuisine: null,
      portionG: 50,
      energy_kcal: 999,
      protein_g: 1,
      fat_g: 1,
      carb_g: 1,
      sugar_g: 0,
      popularity: 1,
    },
    {
      id: "db-user-1",
      sourceCode: "USER:warung-babi-spesial-kampus",
      name: "Babi Panggang Kantin Timur",
      nameEn: null,
      aliases: null,
      state: "Olahan",
      foodGroup: "Custom/Estimasi",
      cuisine: "chinese",
      portionG: 180,
      servings: [{ label: "1 porsi", grams: 180 }],
      energy_kcal: 265,
      protein_g: 21,
      fat_g: 16,
      carb_g: 8,
      sugar_g: 2,
      popularity: 6,
    },
  ];

  const { entries, hasDbExtras } = mergeFoodCatalogue(bundled, staleAndCustomDb);
  assert.equal(hasDbExtras, true);

  const canonical = entries.find((e) => e.sourceCode === "DAY:day-babi-has-dalam");
  assert.ok(canonical);
  assert.notEqual(canonical.name, "Stale Old DB Name Should Lose");
  assert.equal(canonical.energy_kcal, 143);

  const userHits = await searchHybridFoods({
    query: "Kantin Timur",
    loadDb: async () => staleAndCustomDb,
  });
  assert.equal(userHits[0]?.sourceCode, "USER:warung-babi-spesial-kampus");
});
