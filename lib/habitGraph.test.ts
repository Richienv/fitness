import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comboNodeId,
  createHabitGraph,
  decayWeight,
  FOOD_HALF_LIFE_DAYS,
  foodNodeId,
  macroBudgetFit,
  normalizeHabitGraph,
  recordMealEvent,
  recordShadowConfirm,
  recordShadowDismiss,
  recordWorkoutEvent,
  scoreMealRecommendations,
  scoreWorkoutRecommendations,
  timeBucketForHour,
  userNodeId,
  workoutNodeId,
  type HabitFoodSnapshot,
} from "./habitGraph.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 25, 8, 0, 0);

const oats: HabitFoodSnapshot = {
  foodKey: "day-oat-rolled",
  name: "Rolled Oats",
  grams: 60,
  kcal: 230,
  protein: 8,
  carbs: 40,
  fat: 4,
};

const whey: HabitFoodSnapshot = {
  foodKey: "day-whey-isolate",
  name: "Whey Isolate",
  grams: 30,
  kcal: 115,
  protein: 25,
  carbs: 1,
  fat: 0.5,
};

const nasiPutih: HabitFoodSnapshot = {
  foodKey: "day-nasi-putih",
  name: "Nasi Putih",
  grams: 150,
  kcal: 195,
  protein: 4,
  carbs: 42,
  fat: 0.4,
};

const dadaAyam: HabitFoodSnapshot = {
  foodKey: "day-dada-ayam-panggang",
  name: "Dada Ayam Panggang",
  grams: 150,
  kcal: 248,
  protein: 46,
  carbs: 0,
  fat: 5.4,
};

const telurRebus: HabitFoodSnapshot = {
  foodKey: "day-telur-rebus",
  name: "Telur Rebus",
  grams: 100,
  qty: 2,
  unit: "butir",
  kcal: 155,
  protein: 13,
  carbs: 1.1,
  fat: 11,
};

const bobaMilkTea: HabitFoodSnapshot = {
  foodKey: "dfr-snack-boba",
  name: "Brown Sugar Boba",
  grams: 450,
  kcal: 540,
  protein: 4,
  carbs: 98,
  fat: 14,
};

test("timeBucketForHour and decayWeight behave deterministically", () => {
  assert.equal(timeBucketForHour(5), "early_morning");
  assert.equal(timeBucketForHour(8), "morning");
  assert.equal(timeBucketForHour(12), "midday");
  assert.equal(timeBucketForHour(15), "afternoon");
  assert.equal(timeBucketForHour(20), "evening");
  assert.equal(timeBucketForHour(23), "late_night");
  assert.equal(timeBucketForHour(2), "late_night");

  assert.equal(decayWeight(4, 0, FOOD_HALF_LIFE_DAYS), 4);
  assert.ok(Math.abs(decayWeight(4, FOOD_HALF_LIFE_DAYS, FOOD_HALF_LIFE_DAYS) - 2) < 1e-6);
  assert.equal(decayWeight(0, 5, 14), 0);
});

test("recordMealEvent builds nodes/edges, deduplicates eventId, and merges duplicate foods", () => {
  const g = createHabitGraph("richie", NOW);

  recordMealEvent(g, {
    eventId: "meal-1",
    date: "2026-11-25",
    mealType: "breakfast",
    at: NOW,
    hour: 8,
    dayType: "gym",
    items: [
      oats,
      { ...oats, grams: 20, kcal: 76, protein: 2.7, carbs: 13.3, fat: 1.3 },
      whey,
    ],
  });

  // Duplicate eventId should be ignored cleanly.
  recordMealEvent(g, {
    eventId: "meal-1",
    date: "2026-11-25",
    mealType: "breakfast",
    at: NOW,
    hour: 8,
    dayType: "gym",
    items: [oats, whey],
  });

  const oatNode = g.nodes[foodNodeId(oats.foodKey)];
  assert.ok(oatNode);
  assert.equal(oatNode.reinforcements, 1);
  assert.equal((oatNode.payload as HabitFoodSnapshot).grams, 80);

  const cid = comboNodeId("breakfast", [oats, whey]);
  assert.ok(g.nodes[cid]);
  assert.equal(g.edges[`${cid}|EATEN_AT|slot:breakfast`]?.count, 1);
  assert.equal(g.edges[`${cid}|EATEN_AT|time:morning`]?.count, 1);
  assert.equal(g.edges[`${cid}|EATEN_AT|day:gym`]?.count, 1);

  const pairKey = `${foodNodeId(oats.foodKey)}|PAIRED_WITH|${foodNodeId(whey.foodKey)}`;
  assert.equal(g.edges[pairKey]?.count, 1);
});

test("scoreMealRecommendations respects time-of-day, meal-slot, and recency decay", () => {
  const g = createHabitGraph("richie", NOW - 35 * DAY_MS);

  // Stale breakfast habit logged 30 days ago twice
  for (let i = 0; i < 2; i++) {
    recordMealEvent(g, {
      eventId: `stale-bf-${i}`,
      date: "2026-10-25",
      mealType: "breakfast",
      at: NOW - 30 * DAY_MS - i * 1000,
      hour: 8,
      dayType: "gym",
      items: [telurRebus],
    });
  }

  // Fresh breakfast combo logged today & yesterday
  for (let i = 0; i < 2; i++) {
    recordMealEvent(g, {
      eventId: `fresh-bf-${i}`,
      date: `2026-11-2${4 + i}`,
      mealType: "breakfast",
      at: NOW - (1 - i) * DAY_MS,
      hour: 8,
      dayType: "gym",
      items: [oats, whey],
    });
  }

  // Lunch habit logged at noon
  for (let i = 0; i < 2; i++) {
    recordMealEvent(g, {
      eventId: `lunch-${i}`,
      date: `2026-11-2${4 + i}`,
      mealType: "lunch",
      at: NOW - (1 - i) * DAY_MS + 4 * HOUR_MS,
      hour: 12,
      dayType: "gym",
      items: [nasiPutih, dadaAyam],
    });
  }

  const morningRecs = scoreMealRecommendations(g, {
    now: NOW,
    hour: 8,
    mealSlot: "breakfast",
    dayType: "gym",
    remainingKcal: 1800,
    remainingProtein: 130,
    kcalTarget: 2200,
    proteinTarget: 160,
    limit: 3,
  });
  assert.ok(morningRecs.length >= 2);
  assert.equal(morningRecs[0].targetNodeId, comboNodeId("breakfast", [oats, whey]));

  const lunchRecs = scoreMealRecommendations(g, {
    now: NOW + 4 * HOUR_MS,
    hour: 12,
    mealSlot: "lunch",
    dayType: "gym",
    remainingKcal: 1400,
    remainingProtein: 100,
    kcalTarget: 2200,
    proteinTarget: 160,
    limit: 3,
  });
  assert.equal(lunchRecs[0].targetNodeId, comboNodeId("lunch", [nasiPutih, dadaAyam]));
});

test("PAIRED_WITH surfaces co-logged add-ons and excludes foods already on the plate", () => {
  const g = createHabitGraph("renita", NOW);

  for (let i = 0; i < 3; i++) {
    recordMealEvent(g, {
      eventId: `pair-${i}`,
      date: `2026-11-2${2 + i}`,
      mealType: "lunch",
      at: NOW - (2 - i) * DAY_MS,
      hour: 12,
      dayType: "rest",
      items: [nasiPutih, dadaAyam],
    });
  }

  const recs = scoreMealRecommendations(g, {
    now: NOW,
    hour: 12,
    mealSlot: "lunch",
    dayType: "rest",
    remainingKcal: 800,
    remainingProtein: 60,
    kcalTarget: 1600,
    proteinTarget: 110,
    slotAlreadyLogged: true,
    currentPlateFoodKeys: [nasiPutih.foodKey],
    limit: 5,
  });

  const addon = recs.find((r) => r.kind === "paired_addon" && r.targetNodeId === foodNodeId(dadaAyam.foodKey));
  assert.ok(addon, "expected Dada Ayam to surface as a paired_addon when Nasi Putih is on plate");
  assert.equal(recs.some((r) => r.targetNodeId === foodNodeId(nasiPutih.foodKey)), false);
});

test("recordShadowConfirm boosts priority and clears dismissal cooldown; dismiss enforces progressive cooldown", () => {
  const g = createHabitGraph("richie", NOW);

  recordMealEvent(g, {
    eventId: "a1",
    date: "2026-11-24",
    mealType: "dinner",
    at: NOW - DAY_MS,
    hour: 19,
    dayType: "gym",
    items: [dadaAyam],
  });
  recordMealEvent(g, {
    eventId: "b1",
    date: "2026-11-24",
    mealType: "dinner",
    at: NOW - DAY_MS,
    hour: 19,
    dayType: "gym",
    items: [telurRebus],
  });

  const chickenComboId = comboNodeId("dinner", [dadaAyam]);
  const eggComboId = comboNodeId("dinner", [telurRebus]);

  // Dismiss chicken -> blocked immediately for 12h cooldown
  recordShadowDismiss(g, chickenComboId, NOW, 12);
  const blockedRecs = scoreMealRecommendations(g, {
    now: NOW + 2 * HOUR_MS,
    hour: 19,
    mealSlot: "dinner",
    dayType: "gym",
    remainingKcal: 700,
    remainingProtein: 50,
    kcalTarget: 2200,
    proteinTarget: 150,
    limit: 5,
  });
  assert.equal(blockedRecs.some((r) => r.targetNodeId === chickenComboId), false);
  assert.equal(blockedRecs.some((r) => r.targetNodeId === eggComboId), true);

  // Confirming chicken explicitly overrides cooldown & clears dismissal streak
  recordShadowConfirm(g, chickenComboId, NOW + 3 * HOUR_MS);
  const uid = userNodeId("richie");
  assert.equal(g.edges[`${uid}|DISMISSED_SHADOW|${chickenComboId}`]?.consecutiveDismissals, 0);

  const afterConfirmRecs = scoreMealRecommendations(g, {
    now: NOW + 3 * HOUR_MS,
    hour: 19,
    mealSlot: "dinner",
    dayType: "gym",
    remainingKcal: 700,
    remainingProtein: 50,
    kcalTarget: 2200,
    proteinTarget: 150,
    limit: 5,
  });
  assert.equal(afterConfirmRecs[0].targetNodeId, chickenComboId);

  // Consecutive dismissals double cooldown (12h -> 24h) and dampen even after cooldown expires
  recordShadowDismiss(g, chickenComboId, NOW + 4 * HOUR_MS, 12);
  recordShadowDismiss(g, chickenComboId, NOW + 5 * HOUR_MS, 12);
  const disEdge = g.edges[`${uid}|DISMISSED_SHADOW|${chickenComboId}`];
  assert.equal(disEdge?.consecutiveDismissals, 2);
  assert.ok((disEdge?.cooldownUntil ?? 0) >= NOW + 5 * HOUR_MS + 24 * HOUR_MS);
});

test("macroBudgetFit breaks ties in favor of high-protein light options when budget is tight", () => {
  const tightBudget = {
    remainingKcal: 120,
    remainingProtein: 35,
    kcalTarget: 2000,
    proteinTarget: 150,
  };
  assert.ok(macroBudgetFit(150, 26, tightBudget) > macroBudgetFit(540, 4, tightBudget));

  const g = createHabitGraph("richie", NOW);
  recordMealEvent(g, {
    eventId: "s-whey",
    date: "2026-11-24",
    mealType: "snack",
    at: NOW - DAY_MS,
    hour: 16,
    dayType: "gym",
    items: [whey],
  });
  recordMealEvent(g, {
    eventId: "s-boba",
    date: "2026-11-24",
    mealType: "snack",
    at: NOW - DAY_MS,
    hour: 16,
    dayType: "gym",
    items: [bobaMilkTea],
  });

  const recs = scoreMealRecommendations(g, {
    now: NOW,
    hour: 16,
    mealSlot: "snack",
    dayType: "gym",
    ...tightBudget,
    limit: 4,
  });
  assert.equal(recs[0].targetNodeId, comboNodeId("snack", [whey]));
});

test("recordWorkoutEvent and scoreWorkoutRecommendations distinguish gym vs rest days and fallbacks", () => {
  const g = createHabitGraph("renita", NOW);

  const upperA = {
    kind: "session" as const,
    title: "Upper A",
    sessionType: "Upper A",
    setsCount: 16,
    exercisesCount: 5,
    durationMin: 48,
    estimatedKcal: 260,
    exercises: [{ name: "Lat Pulldown", sets: 4, repsLabel: "8-12", targetReps: 10, weightKg: 40 }],
  };
  const restWalk = {
    kind: "activity" as const,
    title: "Jalan Santai 30m",
    activityKind: "jalan_santai",
    minutes: 30,
    setsCount: 0,
    exercisesCount: 0,
    durationMin: 30,
    estimatedKcal: 110,
  };

  // Twice at gym on Monday evening (weekday 1)
  recordWorkoutEvent(g, {
    eventId: "w-gym-1",
    date: "2026-11-16",
    at: NOW - 7 * DAY_MS,
    hour: 18,
    weekday: 1,
    dayType: "gym",
    payload: upperA,
  });
  recordWorkoutEvent(g, {
    eventId: "w-gym-2",
    date: "2026-11-23",
    at: NOW - 2 * DAY_MS,
    hour: 18,
    weekday: 1,
    dayType: "gym",
    payload: upperA,
  });

  // Twice on rest day Sunday morning (weekday 0)
  recordWorkoutEvent(g, {
    eventId: "w-rest-1",
    date: "2026-11-15",
    at: NOW - 8 * DAY_MS,
    hour: 9,
    weekday: 0,
    dayType: "rest",
    payload: restWalk,
  });
  recordWorkoutEvent(g, {
    eventId: "w-rest-2",
    date: "2026-11-22",
    at: NOW - 3 * DAY_MS,
    hour: 9,
    weekday: 0,
    dayType: "rest",
    payload: restWalk,
  });

  const gymRecs = scoreWorkoutRecommendations(g, {
    now: NOW,
    hour: 18,
    weekday: 1,
    dayType: "gym",
    limit: 3,
  });
  assert.equal(gymRecs[0].targetNodeId, workoutNodeId(upperA));
  assert.equal(gymRecs[0].kind, "workout");

  const restRecs = scoreWorkoutRecommendations(g, {
    now: NOW,
    hour: 9,
    weekday: 0,
    dayType: "rest",
    limit: 3,
  });
  assert.equal(restRecs[0].targetNodeId, workoutNodeId(restWalk));
  assert.equal(restRecs[0].kind, "activity");

  // Empty graph uses plannedWorkout on gym days and fallbackRestActivity on rest days.
  const cold = createHabitGraph("richie", NOW);
  const coldGym = scoreWorkoutRecommendations(cold, {
    now: NOW,
    hour: 17,
    weekday: 2,
    dayType: "gym",
    plannedWorkout: upperA,
  });
  assert.equal(coldGym[0].badge, "Jadwal hari latihan");
  assert.equal(coldGym[0].targetNodeId, workoutNodeId(upperA));

  const coldRest = scoreWorkoutRecommendations(cold, {
    now: NOW,
    hour: 9,
    weekday: 0,
    dayType: "rest",
    fallbackRestActivity: restWalk,
  });
  assert.equal(coldRest[0].badge, "Pemulihan hari istirahat");
  assert.equal(coldRest[0].targetNodeId, workoutNodeId(restWalk));
});

test("normalizeHabitGraph recovers safely from malformed inputs", () => {
  const gNull = normalizeHabitGraph(null, "renita");
  assert.equal(gNull.userKey, "renita");
  assert.ok(gNull.nodes[userNodeId("renita")]);

  const gCorrupt = normalizeHabitGraph(
    {
      version: 99,
      userKey: "richie",
      nodes: {
        bad: { foo: "bar" },
        "food:test": {
          id: "food:test",
          kind: "food",
          label: "Test",
          reinforcements: 2,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
      edges: {
        broken: null,
        "food:test|EATEN_AT|slot:lunch": {
          src: "food:test",
          rel: "EATEN_AT",
          dst: "slot:lunch",
          weight: 1.5,
          count: 1,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    },
    "richie",
  );
  assert.equal(gCorrupt.nodes["bad"], undefined);
  assert.ok(gCorrupt.nodes["food:test"]);
  assert.equal(gCorrupt.edges["broken"], undefined);
  assert.equal(gCorrupt.edges["food:test|EATEN_AT|slot:lunch"]?.weight, 1.5);
});
