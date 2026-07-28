// The signals. Each is a pure function from the input to what it would
// propose; `suggest()` runs them all and merges.
//
// To add a signal, write a function and add it to SIGNALS. Never edit
// suggest() — that's the whole point of the registry.
//
// None of these name a food directly except S5, and S5 is gated on the user
// having actually logged that condiment. Everything else is derived from what
// this person eats, which is why "no rice on the plate" fires for a rice eater
// and stays silent for someone on keto.

import { TUNING } from "./tuning.ts";
import type {
  Candidate,
  Category,
  HistoryStats,
  MealType,
  Signal,
  SuggestInput,
} from "./types.ts";

/** Ids already on the plate — no signal should propose one of these. */
function trayIds(input: SuggestInput): Set<string> {
  return new Set(input.tray.map((t) => t.foodId));
}

/** Foods of a category, sorted by how often this person logs them at this meal. */
function topByRate(
  history: HistoryStats,
  mealType: MealType,
  n: number,
  where: (foodId: string) => boolean
): string[] {
  const rates = history.byMealType.get(mealType);
  if (!rates) return [];
  return [...rates.entries()]
    .filter(([id]) => where(id))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([id]) => id);
}

/** Meals still to come today, used to decide whether a gap is worth raising. */
function mealsLeft(mealType: MealType): number {
  const order: MealType[] = ["breakfast", "lunch", "snack", "dinner"];
  const at = order.indexOf(mealType);
  return at < 0 ? 0 : order.length - at - 1;
}

// ── S1 · Co-occurrence ──────────────────────────────────────────────────────
// The strongest signal: what this person puts on the plate together.
const s1CoOccurrence: Signal = {
  id: "S1",
  family: "habit",
  run: (input) => {
    const out: Candidate[] = [];
    const inTray = trayIds(input);
    for (const entry of input.tray) {
      const row = input.history.coOccurrence.get(entry.foodId);
      if (!row) continue;
      const support = input.history.coSupport.get(entry.foodId);
      for (const [other, p] of row) {
        if (inTray.has(other)) continue;
        if (p < TUNING.CO_MIN_P) continue;
        if ((support?.get(other) ?? 0) < TUNING.CO_MIN_SUPPORT) continue;
        out.push({
          foodId: other,
          score: p,
          reason: "CO_OCCURRENCE",
          reasonParams: { withFood: entry.foodId, pct: Math.round(p * 100) },
          signal: "S1",
        });
      }
    }
    return out;
  },
};

// ── S2 · Protein gap ────────────────────────────────────────────────────────
// Only raised when the day is genuinely short AND there isn't much day left to
// fix it in — otherwise it fires every breakfast and becomes noise.
const s2ProteinGap: Signal = {
  id: "S2",
  family: "need",
  run: (input) => {
    const inTrayProtein = input.tray.reduce((a, t) => a + t.macros.protein, 0);
    const projected = input.consumedToday.protein + inTrayProtein;
    const gap = input.targets.protein - projected;
    if (gap <= TUNING.PROTEIN_GAP_G) return [];
    if (mealsLeft(input.mealType) >= TUNING.PROTEIN_MEALS_LEFT) return [];

    const inTray = trayIds(input);
    const score = Math.min(TUNING.PROTEIN_MAX_SCORE, gap / TUNING.PROTEIN_GAP_DIVISOR);
    return topByRate(
      input.history,
      input.mealType,
      TUNING.PROTEIN_TOP_N,
      (id) => input.history.categoryOf.get(id) === "protein" && !inTray.has(id)
    ).map((foodId) => ({
      foodId,
      score,
      reason: "PROTEIN_GAP" as const,
      reasonParams: { gapG: Math.round(gap) },
      signal: "S2",
    }));
  },
};

// ── S3 · Missing category ───────────────────────────────────────────────────
// The rate does the work. Rice is never named.
const s3MissingCategory: Signal = {
  id: "S3",
  family: "habit",
  run: (input) => {
    const rates = input.history.categoryRate.get(input.mealType);
    if (!rates) return [];
    const present = new Set<Category>(input.tray.map((t) => t.category));
    const inTray = trayIds(input);
    const out: Candidate[] = [];
    for (const [category, rate] of rates) {
      if (rate < TUNING.CATEGORY_MIN_RATE) continue;
      if (present.has(category)) continue;
      const [best] = topByRate(
        input.history,
        input.mealType,
        1,
        (id) => input.history.categoryOf.get(id) === category && !inTray.has(id)
      );
      if (!best) continue;
      out.push({
        foodId: best,
        score: rate,
        reason: "MISSING_CATEGORY",
        reasonParams: { category },
        signal: "S3",
      });
    }
    return out;
  },
};

// ── S4 · Meal routine ───────────────────────────────────────────────────────
// The morning coffee. Scored slightly under its rate because habits break.
const s4MealRoutine: Signal = {
  id: "S4",
  family: "habit",
  run: (input) => {
    const rates = input.history.byMealType.get(input.mealType);
    if (!rates) return [];
    const inTray = trayIds(input);
    const out: Candidate[] = [];
    for (const [foodId, rate] of rates) {
      if (rate < TUNING.ROUTINE_MIN_RATE) continue;
      if (inTray.has(foodId)) continue;
      out.push({
        foodId,
        score: rate * TUNING.ROUTINE_SCALE,
        reason: "MEAL_ROUTINE",
        reasonParams: { mealType: input.mealType, pct: Math.round(rate * 100) },
        signal: "S4",
      });
    }
    return out;
  },
};

// ── S5 · Paired condiment ───────────────────────────────────────────────────
// The one hardcoded list in the engine, and it is DATA-GATED: a pairing only
// fires if this person has actually logged that condiment. Without the gate
// this would be the engine telling everyone to eat sambal.
const CONDIMENT_PAIRS: { condiment: string; goesWith: RegExp }[] = [
  { condiment: "sambal", goesWith: /nasi|goreng|ayam|ikan|telur/i },
  { condiment: "kecap", goesWith: /nasi goreng|mie goreng/i },
  { condiment: "bawang-goreng", goesWith: /soto|bakso|bubur/i },
];

const s5PairedCondiment: Signal = {
  id: "S5",
  family: "adjacency",
  run: (input) => {
    const inTray = trayIds(input);
    const out: Candidate[] = [];
    for (const pair of CONDIMENT_PAIRS) {
      if (inTray.has(pair.condiment)) continue;
      const timesLogged = input.history.timesLogged.get(pair.condiment) ?? 0;
      if (timesLogged < TUNING.CONDIMENT_MIN_LOGS) continue;
      const anchor = input.tray.find((t) => pair.goesWith.test(t.foodId));
      if (!anchor) continue;
      // The spec's formula is a function of times-logged alone, which means a
      // condiment used 3 times and one used 300 both score 0.7 regardless of
      // how often they're actually wanted. Calibration rejected that: sambal
      // eaten with 30% of meals was being shown at 70%. Keep the formula as a
      // CEILING and cap it at the rate this person actually uses it.
      const useRate = input.history.byMealType.get(input.mealType)?.get(pair.condiment) ?? 0;
      const formula = Math.min(
        TUNING.CONDIMENT_MAX,
        TUNING.CONDIMENT_BASE + TUNING.CONDIMENT_PER_LOG * Math.min(3, timesLogged)
      );
      out.push({
        foodId: pair.condiment,
        score: Math.min(formula, useRate),
        reason: "PAIRED_CONDIMENT",
        reasonParams: { withFood: anchor.foodId },
        signal: "S5",
      });
    }
    return out;
  },
};

// ── S6 · Kcal headroom ──────────────────────────────────────────────────────
// Snack only, and deliberately weak — "you have room" is the least useful
// reason to eat something, so it should lose to every other signal.
const s6KcalHeadroom: Signal = {
  id: "S6",
  family: "need",
  run: (input) => {
    if (input.mealType !== "snack") return [];
    const inTrayKcal = input.tray.reduce((a, t) => a + t.macros.kcal, 0);
    const headroom = input.targets.kcal - input.consumedToday.kcal - inTrayKcal;
    if (headroom <= TUNING.HEADROOM_MIN_KCAL) return [];
    const inTray = trayIds(input);
    return topByRate(input.history, "snack", TUNING.HEADROOM_TOP_N, (id) => !inTray.has(id)).map(
      (foodId) => ({
        foodId,
        score: TUNING.HEADROOM_SCORE,
        reason: "KCAL_HEADROOM" as const,
        reasonParams: { headroomKcal: Math.round(headroom) },
        signal: "S6",
      })
    );
  },
};

// ── S7 · Recent streak ──────────────────────────────────────────────────────
const s7RecentStreak: Signal = {
  id: "S7",
  family: "habit",
  run: (input) => {
    const inTray = trayIds(input);
    const out: Candidate[] = [];
    // Read the 7-day count, not the 14-day one: "5 of the last 7 days" is a
    // 71% habit, "5 of the last 14" is a 36% one, and scoring them the same
    // put 36% habits on screen at 75% confidence.
    const rates = input.history.byMealType.get(input.mealType);
    for (const [foodId, days] of input.history.streakDays) {
      if (days < TUNING.STREAK_MIN_DAYS) continue;
      if (inTray.has(foodId)) continue;
      // Only a genuine lift over the long-run rate counts. Otherwise S7 is
      // just S4 wearing a different hat, and the two would compound.
      const observedRate = days / TUNING.STREAK_WINDOW_DAYS;
      const habitRate = rates?.get(foodId) ?? 0;
      if (observedRate < habitRate + TUNING.STREAK_MIN_LIFT) continue;
      // Never claim more than the observed recent frequency. A 62%-of-the-time
      // vegetable will hit 5 days in some weeks by chance, and the raw formula
      // then locks 0.75 in for the whole session — the streak is evidence of
      // recency, not of a habit stronger than the days actually show.
      out.push({
        foodId,
        score: Math.min(
          0.9,
          TUNING.STREAK_BASE + TUNING.STREAK_PER_DAY * Math.min(TUNING.STREAK_WINDOW_DAYS, days),
          observedRate
        ),
        reason: "RECENT_STREAK",
        reasonParams: { days },
        signal: "S7",
      });
    }
    return out;
  },
};

/** The registry. Adding a signal means adding it here — nothing else changes. */
export const SIGNALS: Signal[] = [
  s1CoOccurrence,
  s2ProteinGap,
  s3MissingCategory,
  s4MealRoutine,
  s5PairedCondiment,
  s6KcalHeadroom,
  s7RecentStreak,
];

// ── Cold start ──────────────────────────────────────────────────────────────
// With almost no history there is nothing to infer, so we fall back to what
// an Indonesian plate usually holds — capped low, because this is a guess
// about a stranger and the percentage shown has to stay honest.

const COLD_START: Record<MealType, { foodId: string; category: Category }[]> = {
  breakfast: [
    { foodId: "nasi-putih", category: "carb" },
    { foodId: "telur-rebus", category: "protein" },
    { foodId: "kopi-susu", category: "drink" },
  ],
  lunch: [
    { foodId: "nasi-putih", category: "carb" },
    { foodId: "ayam-goreng", category: "protein" },
    { foodId: "capcay", category: "vegetable" },
  ],
  snack: [
    { foodId: "pisang", category: "vegetable" },
    { foodId: "kopi-susu", category: "drink" },
  ],
  dinner: [
    { foodId: "nasi-putih", category: "carb" },
    { foodId: "ayam-goreng", category: "protein" },
    { foodId: "capcay", category: "vegetable" },
  ],
};

export function coldStartCandidates(input: SuggestInput): Candidate[] {
  const inTray = trayIds(input);
  const present = new Set<Category>(input.tray.map((t) => t.category));
  return (COLD_START[input.mealType] ?? [])
    .filter((c) => !inTray.has(c.foodId) && !present.has(c.category))
    .map((c) => ({
      foodId: c.foodId,
      score: TUNING.COLD_START_MAX_CONF,
      reason: "MISSING_CATEGORY" as const,
      reasonParams: { category: c.category },
      signal: "COLD_START",
    }));
}

/** Categories for the cold-start foods, so ranking can still diversify before
 *  any history exists to read them from. */
export const COLD_START_CATEGORIES: Map<string, Category> = new Map(
  Object.values(COLD_START).flatMap((list) => list.map((c) => [c.foodId, c.category] as const))
);
