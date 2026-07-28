// Derive habit statistics from logged meals.
//
// Everything here is recomputed from the meal rows themselves — nothing is
// persisted. A personal history is a few thousand rows, so a full pass is
// cheap, and storing derived numbers would just mean a second thing to keep
// correct.
//
// The one rule that matters throughout: a food counts ONCE PER MEAL. Logging
// rice twice in one sitting is one occurrence of rice, not two, or a habit
// starts looking twice as strong as it is.

import { TUNING } from "./tuning.ts";
import {
  emptyHistory,
  MEAL_TYPES,
  type Category,
  type HistoryStats,
  type MealType,
} from "./types.ts";

/** The shape history needs from a saved meal. Deliberately narrow so the app's
 *  own MealLog can be mapped onto it without the engine importing the store. */
export type HistoryMeal = {
  /** "YYYY-MM-DD" in the app's day space (Asia/Shanghai), not a timestamp. */
  date: string;
  mealType: MealType;
  foods: { foodId: string; category: Category; grams: number }[];
};

/** Whole days between two "YYYY-MM-DD" keys, ignoring time zones entirely —
 *  both sides are already in the same day space. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function bump<K>(m: Map<K, number>, k: K, by = 1): void {
  m.set(k, (m.get(k) ?? 0) + by);
}

function nested<K, V>(m: Map<K, Map<string, V>>, k: K): Map<string, V> {
  let inner = m.get(k);
  if (!inner) {
    inner = new Map();
    m.set(k, inner);
  }
  return inner;
}

/**
 * Build the stats the signals read.
 *
 * @param meals every logged meal (any age — older than the habit window is ignored)
 * @param today the current day key, so "recent" is deterministic in tests
 */
export function buildHistory(meals: HistoryMeal[], today: string): HistoryStats {
  const stats = emptyHistory();

  const inWindow = meals.filter((m) => {
    const age = daysBetween(m.date, today);
    return age >= 0 && age <= TUNING.HABIT_WINDOW_DAYS;
  });
  if (inWindow.length === 0) return stats;

  stats.totalMeals = inWindow.length;

  // Meals per type, weighted — the denominator for byMealType and categoryRate.
  const typeWeight = new Map<MealType, number>();
  // foodId -> weighted count within each meal type.
  const foodWeightByType = new Map<MealType, Map<string, number>>();
  // mealType -> category -> weighted count of meals containing it.
  const catCountByType = new Map<MealType, Map<Category, number>>();
  // foodId -> meals containing it (unweighted), the co-occurrence denominator.
  const mealsWith = new Map<string, number>();
  // foodId -> foodId -> meals containing both.
  const pairCount = new Map<string, Map<string, number>>();
  // foodId -> set of day keys within the recent (14d) and streak (7d) windows.
  const recentDaySets = new Map<string, Set<string>>();
  const streakDaySets = new Map<string, Set<string>>();
  const portions = new Map<string, number[]>();

  for (const meal of inWindow) {
    const age = daysBetween(meal.date, today);
    const weight = age <= TUNING.RECENT_WINDOW_DAYS ? TUNING.RECENCY_WEIGHT : 1;

    // Collapse to distinct foods first — this is the once-per-meal rule.
    const distinct = new Map<string, Category>();
    for (const f of meal.foods) {
      if (!distinct.has(f.foodId)) distinct.set(f.foodId, f.category);
      stats.categoryOf.set(f.foodId, f.category);
      if (f.grams > 0) {
        const arr = portions.get(f.foodId);
        if (arr) arr.push(f.grams);
        else portions.set(f.foodId, [f.grams]);
      }
    }
    const ids = [...distinct.keys()];
    if (ids.length === 0) continue;

    bump(typeWeight, meal.mealType, weight);
    const byFood = nested(foodWeightByType, meal.mealType);
    for (const id of ids) {
      bump(byFood, id, weight);
      bump(mealsWith, id);
      bump(stats.timesLogged, id);
      if (age <= TUNING.RECENT_WINDOW_DAYS) {
        const set = recentDaySets.get(id) ?? new Set<string>();
        set.add(meal.date);
        recentDaySets.set(id, set);
      }
      if (age <= TUNING.STREAK_WINDOW_DAYS) {
        const set = streakDaySets.get(id) ?? new Set<string>();
        set.add(meal.date);
        streakDaySets.set(id, set);
      }
    }

    // Categories present in this meal, once each.
    const cats = new Set<Category>(distinct.values());
    const catMap = (catCountByType.get(meal.mealType) ??
      catCountByType.set(meal.mealType, new Map()).get(meal.mealType)!) as Map<Category, number>;
    for (const c of cats) bump(catMap, c, weight);

    // Ordered pairs, so P(B|A) and P(A|B) are both available.
    for (const a of ids) {
      const row = nested(pairCount, a);
      for (const b of ids) {
        if (a === b) continue;
        bump(row, b);
      }
    }
  }

  // P(B|A) = meals containing both / meals containing A. Pairs below the
  // support floor are dropped outright rather than emitted weakly — a ratio
  // from two meals is not evidence.
  for (const [a, row] of pairCount) {
    const denom = mealsWith.get(a) ?? 0;
    if (denom === 0) continue;
    const probs = new Map<string, number>();
    const supports = new Map<string, number>();
    for (const [b, both] of row) {
      if (both < TUNING.CO_MIN_SUPPORT) continue;
      probs.set(b, both / denom);
      supports.set(b, both);
    }
    if (probs.size > 0) {
      stats.coOccurrence.set(a, probs);
      stats.coSupport.set(a, supports);
    }
  }

  for (const mt of MEAL_TYPES) {
    const denom = typeWeight.get(mt) ?? 0;
    if (denom === 0) continue;

    const foods = foodWeightByType.get(mt);
    if (foods) {
      const rates = new Map<string, number>();
      for (const [id, w] of foods) rates.set(id, w / denom);
      stats.byMealType.set(mt, rates);
    }

    const cats = catCountByType.get(mt);
    if (cats) {
      const rates = new Map<Category, number>();
      for (const [c, w] of cats) rates.set(c, w / denom);
      stats.categoryRate.set(mt, rates);
    }
  }

  for (const [id, set] of recentDaySets) stats.recentDays.set(id, set.size);
  for (const [id, set] of streakDaySets) stats.streakDays.set(id, set.size);
  for (const [id, xs] of portions) stats.medianPortion.set(id, median(xs));

  return stats;
}
