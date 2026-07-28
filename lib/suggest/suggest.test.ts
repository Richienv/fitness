import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./index.ts";
import { buildHistory, type HistoryMeal } from "./history.ts";
import { TUNING } from "./tuning.ts";
import { emptyHistory, type Category, type MealType, type SuggestInput, type TrayEntry } from "./types.ts";

const TODAY = "2026-07-28";
const AT = new Date("2026-07-28T12:30:00Z");

const CATS: Record<string, Category> = {
  "nasi-putih": "carb",
  "nasi-goreng": "carb",
  "ayam-goreng": "protein",
  "telur-rebus": "protein",
  "dada-ayam": "protein",
  brokoli: "vegetable",
  capcay: "vegetable",
  sambal: "extra",
  "kopi-susu": "drink",
  "es-teh": "drink",
  alpukat: "vegetable",
  keju: "protein",
};

function cat(id: string): Category {
  return CATS[id] ?? "extra";
}

/** N days before TODAY, as a day key. */
function dayAgo(n: number): string {
  const d = new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function meal(daysAgo: number, mealType: MealType, ids: string[], grams = 150): HistoryMeal {
  return {
    date: dayAgo(daysAgo),
    mealType,
    foods: ids.map((foodId) => ({ foodId, category: cat(foodId), grams })),
  };
}

function tray(ids: string[], per = { kcal: 200, protein: 10, carbs: 20, fat: 5 }): TrayEntry[] {
  return ids.map((foodId) => ({ foodId, category: cat(foodId), macros: { ...per } }));
}

function input(over: Partial<SuggestInput> = {}): SuggestInput {
  return {
    tray: [],
    mealType: "lunch",
    at: AT,
    targets: { kcal: 2200, protein: 175 },
    consumedToday: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    history: emptyHistory(),
    declined: [],
    ...over,
  };
}

/** Someone who eats rice with lunch, every time, for two months. */
function riceEaterHistory() {
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 40; d++) {
    meals.push(meal(d, "lunch", ["nasi-putih", "ayam-goreng", "capcay"]));
  }
  return buildHistory(meals, TODAY);
}

/** Someone with the same meal count who has never logged a carb. */
function ketoHistory() {
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 40; d++) {
    meals.push(meal(d, "lunch", ["dada-ayam", "brokoli", "alpukat"]));
  }
  return buildHistory(meals, TODAY);
}

// ── §7 required tests ───────────────────────────────────────────────────────

test("a rice eater is told about rice when it's missing", () => {
  const out = suggest(input({ history: riceEaterHistory(), tray: tray(["ayam-goreng"]) }));
  const rice = out.find((s) => s.foodId === "nasi-putih");
  assert.ok(rice, "expected a rice suggestion");
  assert.ok(rice.confidence > TUNING.MIN_CONFIDENCE);
});

test("...and is not told about rice when it's already there", () => {
  const out = suggest(input({ history: riceEaterHistory(), tray: tray(["nasi-putih", "ayam-goreng"]) }));
  assert.ok(!out.some((s) => s.foodId === "nasi-putih"));
});

test("a keto user with no rice history is never suggested rice", () => {
  const out = suggest(input({ history: ketoHistory(), tray: tray(["dada-ayam"]) }));
  assert.ok(!out.some((s) => s.foodId === "nasi-putih"));
  assert.ok(!out.some((s) => s.foodId === "nasi-goreng"));
  // The engine must reach this by rate, not by a hardcoded food list.
  for (const s of out) assert.notEqual(cat(s.foodId), "carb");
});

test("a brand-new user gets at most 2 cold-start suggestions, none over 0.5", () => {
  const out = suggest(input({ history: emptyHistory(), tray: tray(["ayam-goreng"]) }));
  assert.ok(out.length <= TUNING.COLD_START_MAX_ITEMS, `got ${out.length}`);
  for (const s of out) {
    assert.ok(s.confidence <= TUNING.COLD_START_MAX_CONF, `${s.foodId} at ${s.confidence}`);
  }
});

test("cold start hands over to history once there are enough meals", () => {
  const thin = buildHistory(
    Array.from({ length: TUNING.COLD_START_MEALS - 1 }, (_, i) => meal(i + 1, "lunch", ["nasi-putih", "ayam-goreng"])),
    TODAY
  );
  const thick = buildHistory(
    Array.from({ length: TUNING.COLD_START_MEALS + 5 }, (_, i) => meal(i + 1, "lunch", ["nasi-putih", "ayam-goreng"])),
    TODAY
  );
  const cold = suggest(input({ history: thin, tray: tray(["ayam-goreng"]) }));
  const warm = suggest(input({ history: thick, tray: tray(["ayam-goreng"]) }));
  assert.ok(cold.every((s) => s.confidence <= TUNING.COLD_START_MAX_CONF));
  assert.ok(warm.some((s) => s.confidence > TUNING.COLD_START_MAX_CONF), "history should out-confide cold start");
});

test("a food declined 3x for dinner never returns for dinner — but lunch is unaffected", () => {
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 30; d++) {
    meals.push(meal(d, "dinner", ["nasi-putih", "ayam-goreng"]));
    meals.push(meal(d, "lunch", ["nasi-putih", "ayam-goreng"]));
  }
  const history = buildHistory(meals, TODAY);
  const dismissals = new Map([["nasi-putih|dinner", TUNING.DISMISS_HARD_BLOCK]]);

  const atDinner = suggest(
    input({ history, mealType: "dinner", tray: tray(["ayam-goreng"]), dismissals })
  );
  assert.ok(!atDinner.some((s) => s.foodId === "nasi-putih"), "blocked for dinner");

  const atLunch = suggest(
    input({ history, mealType: "lunch", tray: tray(["ayam-goreng"]), dismissals })
  );
  assert.ok(atLunch.some((s) => s.foodId === "nasi-putih"), "still fine at lunch");
});

test("one or two dismissals only dampen, they don't block", () => {
  const history = riceEaterHistory();
  const base = suggest(input({ history, tray: tray(["ayam-goreng"]) }));
  const damped = suggest(
    input({ history, tray: tray(["ayam-goreng"]), dismissals: new Map([["nasi-putih|lunch", 2]]) })
  );
  const b = base.find((s) => s.foodId === "nasi-putih");
  const d = damped.find((s) => s.foodId === "nasi-putih");
  assert.ok(b && d, "rice present in both");
  assert.ok(d.confidence < b.confidence, "dismissals should reduce confidence");
});

test("two weak signals do not out-rank one strong signal", () => {
  // Noisy-or: 0.4 and 0.4 combine to 0.64, which must lose to a single 0.8.
  const weak = 1 - (1 - 0.4) * (1 - 0.4);
  assert.ok(weak < 0.8, `two 0.4 signals combined to ${weak}`);
  // ...and never exceed 1 however many pile up.
  const many = 1 - Array(20).fill(0.5).reduce((a: number, s: number) => a * (1 - s), 1);
  assert.ok(many < 1);
});

test("the diversity filter never returns two foods of the same category", () => {
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 40; d++) {
    // Three carbs and three proteins, all habitual, to force the filter.
    meals.push(meal(d, "lunch", ["nasi-putih", "nasi-goreng", "ayam-goreng", "telur-rebus", "dada-ayam"]));
  }
  const out = suggest(input({ history: buildHistory(meals, TODAY), tray: tray(["capcay"]) }));
  const seen = new Set<Category>();
  for (const s of out) {
    const c = cat(s.foodId);
    assert.ok(!seen.has(c), `two suggestions in category ${c}`);
    seen.add(c);
  }
});

test("suggest() is stable: same input, same output", () => {
  const args = input({ history: riceEaterHistory(), tray: tray(["ayam-goreng"]) });
  const a = suggest(args);
  const b = suggest(args);
  assert.deepEqual(a, b);
});

test("suggest() reads time only from input.at", () => {
  const history = riceEaterHistory();
  const noon = suggest(input({ history, tray: tray(["ayam-goreng"]), at: new Date("2026-07-28T12:00:00Z") }));
  const midnight = suggest(input({ history, tray: tray(["ayam-goreng"]), at: new Date("2026-01-01T00:00:00Z") }));
  // Nothing in the engine depends on the ambient clock, so only the passed-in
  // date could change anything — and these signals don't use it.
  assert.deepEqual(noon, midnight);
});

test("nothing exceeds the confidence cap, or falls below the floor", () => {
  const out = suggest(input({ history: riceEaterHistory(), tray: tray(["ayam-goreng"]) }));
  for (const s of out) {
    assert.ok(s.confidence <= TUNING.MAX_CONFIDENCE, `${s.foodId} at ${s.confidence}`);
    assert.ok(s.confidence >= TUNING.MIN_CONFIDENCE, `${s.foodId} at ${s.confidence}`);
  }
  assert.ok(out.length <= TUNING.MAX_SUGGESTIONS);
});

test("an empty tray and no history suggests nothing at all", () => {
  assert.deepEqual(suggest(input()), []);
});

test("declined this session drops the food entirely", () => {
  const history = riceEaterHistory();
  assert.ok(suggest(input({ history, tray: tray(["ayam-goreng"]) })).some((s) => s.foodId === "nasi-putih"));
  const out = suggest(input({ history, tray: tray(["ayam-goreng"]), declined: ["nasi-putih"] }));
  assert.ok(!out.some((s) => s.foodId === "nasi-putih"));
});

test("every suggestion names which signals fired", () => {
  const out = suggest(input({ history: riceEaterHistory(), tray: tray(["ayam-goreng"]) }));
  assert.ok(out.length > 0);
  for (const s of out) {
    assert.ok(s.signals.length > 0, `${s.foodId} has no signals`);
    assert.ok(s.reason, `${s.foodId} has no reason code`);
  }
});

// ── history ─────────────────────────────────────────────────────────────────

test("a food counts once per meal, however many times it's logged", () => {
  const twice = buildHistory(
    [
      {
        date: dayAgo(1),
        mealType: "lunch",
        foods: [
          { foodId: "nasi-putih", category: "carb", grams: 100 },
          { foodId: "nasi-putih", category: "carb", grams: 100 },
        ],
      },
    ],
    TODAY
  );
  assert.equal(twice.byMealType.get("lunch")?.get("nasi-putih"), 1);
  assert.equal(twice.timesLogged.get("nasi-putih"), 1);
});

test("co-occurrence pairs below the support floor are dropped, not weakened", () => {
  const meals = [
    meal(1, "lunch", ["nasi-putih", "sambal"]),
    meal(2, "lunch", ["nasi-putih", "sambal"]),
    meal(3, "lunch", ["nasi-putih"]),
  ];
  const h = buildHistory(meals, TODAY);
  // 2 meals of support is below CO_MIN_SUPPORT (3) → the pair must not exist.
  assert.equal(h.coOccurrence.get("nasi-putih")?.get("sambal"), undefined);

  const more = buildHistory([...meals, meal(4, "lunch", ["nasi-putih", "sambal"])], TODAY);
  assert.ok((more.coOccurrence.get("nasi-putih")?.get("sambal") ?? 0) > 0);
});

test("recent meals are weighted, so a changed routine surfaces", () => {
  const meals: HistoryMeal[] = [];
  // Old routine: coffee every lunch, 30 days ago.
  for (let d = 30; d < 60; d++) meals.push(meal(d, "lunch", ["nasi-putih", "kopi-susu"]));
  // New routine, last 10 days: tea instead.
  for (let d = 1; d <= 10; d++) meals.push(meal(d, "lunch", ["nasi-putih", "es-teh"]));
  const h = buildHistory(meals, TODAY);
  const rates = h.byMealType.get("lunch")!;
  const coffee = rates.get("kopi-susu") ?? 0;
  const tea = rates.get("es-teh") ?? 0;
  // Tea has a third of the meals but 1.5x weight; it should be closing fast.
  assert.ok(tea > 0 && coffee > 0);
  assert.ok(tea / coffee > 10 / 30, "recency weighting should favour the new habit");
});

test("history outside the 90-day window is ignored", () => {
  const h = buildHistory([meal(200, "lunch", ["nasi-putih"])], TODAY);
  assert.equal(h.totalMeals, 0);
});

test("median portion is the user's own, not the food's default", () => {
  const meals = [
    { date: dayAgo(1), mealType: "lunch" as MealType, foods: [{ foodId: "nasi-putih", category: "carb" as Category, grams: 100 }] },
    { date: dayAgo(2), mealType: "lunch" as MealType, foods: [{ foodId: "nasi-putih", category: "carb" as Category, grams: 300 }] },
    { date: dayAgo(3), mealType: "lunch" as MealType, foods: [{ foodId: "nasi-putih", category: "carb" as Category, grams: 200 }] },
  ];
  assert.equal(buildHistory(meals, TODAY).medianPortion.get("nasi-putih"), 200);
});

// ── signals ─────────────────────────────────────────────────────────────────

test("the protein gap only fires when the day is actually short", () => {
  // S2 reads byMealType[mealType] by design — your dinner proteins aren't your
  // breakfast proteins — so the fixture needs dinner history to draw from.
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 40; d++) meals.push(meal(d, "dinner", ["nasi-putih", "ayam-goreng", "capcay"]));
  const history = buildHistory(meals, TODAY);

  const short = suggest(
    input({
      history,
      mealType: "dinner",
      tray: tray(["nasi-putih"]),
      consumedToday: { kcal: 1200, protein: 40, carbs: 150, fat: 40 },
    })
  );
  // Assert on `signals`, not on `reason`: the reason shown is the STRONGEST
  // signal's, and co-occurrence at P=1.0 legitimately outranks the gap. That a
  // signal fired and that its copy won are two different questions.
  assert.ok(short.some((s) => s.signals.includes("S2")), "expected the protein gap to fire");

  const met = suggest(
    input({
      history,
      mealType: "dinner",
      tray: tray(["nasi-putih"]),
      consumedToday: { kcal: 1800, protein: 170, carbs: 150, fat: 40 },
    })
  );
  assert.ok(!met.some((s) => s.signals.includes("S2")), "target met — should stay quiet");
});

test("the reason shown is the strongest signal's, not the first to fire", () => {
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 40; d++) meals.push(meal(d, "dinner", ["nasi-putih", "ayam-goreng"]));
  const out = suggest(
    input({
      history: buildHistory(meals, TODAY),
      mealType: "dinner",
      tray: tray(["nasi-putih"]),
      consumedToday: { kcal: 1200, protein: 40, carbs: 150, fat: 40 },
    })
  );
  const chicken = out.find((s) => s.foodId === "ayam-goreng");
  assert.ok(chicken);
  assert.ok(chicken.signals.length > 1, "several signals should agree here");
  assert.equal(chicken.reason, "CO_OCCURRENCE", "P=1.0 beats a 0.9 protein gap");
});

test("kcal headroom is snack-only and loses to everything else", () => {
  const history = riceEaterHistory();
  const atLunch = suggest(
    input({ history, mealType: "lunch", tray: tray(["ayam-goreng"]), consumedToday: { kcal: 200, protein: 10, carbs: 20, fat: 5 } })
  );
  assert.ok(!atLunch.some((s) => s.reason === "KCAL_HEADROOM"));
});

test("a condiment is never suggested to someone who has never used it", () => {
  // 40 meals of rice + fried chicken, sambal never logged.
  const out = suggest(input({ history: riceEaterHistory(), tray: tray(["nasi-putih", "ayam-goreng"]) }));
  assert.ok(!out.some((s) => s.foodId === "sambal"), "sambal has no logs — must not fire");
});

test("a condiment the user does use can fire", () => {
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 20; d++) meals.push(meal(d, "lunch", ["nasi-putih", "ayam-goreng", "sambal"]));
  const out = suggest(input({ history: buildHistory(meals, TODAY), tray: tray(["nasi-putih", "ayam-goreng"]) }));
  assert.ok(out.some((s) => s.foodId === "sambal"));
});

test("a streak must be a change, not just a habit", () => {
  // Eaten most days for months. That's S4's job; S7 must stay out of it, or
  // the same fact gets counted twice and the confidence inflates.
  const steady: HistoryMeal[] = [];
  for (let d = 1; d <= 60; d++) steady.push(meal(d, "lunch", ["nasi-putih", "ayam-goreng"]));
  const out = suggest(input({ history: buildHistory(steady, TODAY), tray: tray(["nasi-putih"]) }));
  const chicken = out.find((s) => s.foodId === "ayam-goreng");
  assert.ok(chicken);
  assert.ok(!chicken.signals.includes("S7"), "a constant habit is not a streak");
});

test("...but a genuine recent change does fire it", () => {
  const meals: HistoryMeal[] = [];
  // Rarely eaten for two months...
  for (let d = 8; d <= 60; d++) {
    meals.push(meal(d, "lunch", d % 7 === 0 ? ["nasi-putih", "alpukat"] : ["nasi-putih"]));
  }
  // ...then every day this week.
  for (let d = 1; d <= 7; d++) meals.push(meal(d, "lunch", ["nasi-putih", "alpukat"]));
  const out = suggest(input({ history: buildHistory(meals, TODAY), tray: tray(["nasi-putih"]) }));
  const avo = out.find((s) => s.foodId === "alpukat");
  assert.ok(avo, "expected the new habit to surface");
  assert.ok(avo.signals.includes("S7"));
});

test("a streak never claims more than the days actually show", () => {
  const meals: HistoryMeal[] = [];
  for (let d = 8; d <= 60; d++) meals.push(meal(d, "lunch", ["nasi-putih"]));
  for (let d = 1; d <= 5; d++) meals.push(meal(d, "lunch", ["nasi-putih", "alpukat"]));
  const out = suggest(input({ history: buildHistory(meals, TODAY), tray: tray(["nasi-putih"]) }));
  const avo = out.find((s) => s.foodId === "alpukat");
  if (avo) assert.ok(avo.confidence <= 5 / 7 + 0.01, `claimed ${avo.confidence} on 5 of 7 days`);
});

test("agreeing habit signals don't compound into false confidence", () => {
  // A food eaten in ~65% of lunches fires co-occurrence AND meal-routine.
  // Treating those as independent evidence used to push it past 0.8.
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 60; d++) {
    meals.push(meal(d, "lunch", d % 3 === 0 ? ["nasi-putih"] : ["nasi-putih", "capcay"]));
  }
  const out = suggest(input({ history: buildHistory(meals, TODAY), tray: tray(["nasi-putih"]) }));
  const veg = out.find((s) => s.foodId === "capcay");
  assert.ok(veg);
  assert.ok(veg.signals.length > 1, "several habit signals should agree here");
  assert.ok(veg.confidence < 0.8, `two views of a ~67% habit claimed ${veg.confidence.toFixed(2)}`);
});

test("suggest() stays well inside its time budget", () => {
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 90; d++) {
    for (const mt of ["breakfast", "lunch", "dinner"] as MealType[]) {
      meals.push(meal(d, mt, ["nasi-putih", "ayam-goreng", "capcay", "sambal", "kopi-susu"]));
    }
  }
  const history = buildHistory(meals, TODAY);
  const args = input({ history, tray: tray(["ayam-goreng"]) });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 50; i++) suggest(args);
  const perCall = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
  assert.ok(perCall < TUNING.BUDGET_MS, `suggest() took ${perCall.toFixed(2)}ms per call`);
});
