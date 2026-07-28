// Types for the meal-suggestion engine. Pure data — no imports from the app,
// so the engine can be tested (and replaced) on its own.

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "snack", "dinner"];

/** Food bucket. Matches the builder's CAT_BUCKET keys. */
export type Category = "protein" | "carb" | "vegetable" | "extra" | "drink";

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

/** One food currently in the tray. */
export type TrayEntry = {
  foodId: string;
  category: Category;
  /** Macros for the portion actually selected, not per 100 g. */
  macros: Macros;
};

/**
 * Why a suggestion fired. An enum rather than a string: the engine decides
 * WHAT to say, the UI decides HOW to say it, so copy can be rewritten without
 * touching logic and every reason stays testable by identity.
 */
export type ReasonCode =
  | "CO_OCCURRENCE"
  | "PROTEIN_GAP"
  | "MISSING_CATEGORY"
  | "MEAL_ROUTINE"
  | "PAIRED_CONDIMENT"
  | "KCAL_HEADROOM"
  | "RECENT_STREAK";

export type ReasonParams = Record<string, number | string>;

/** What one signal proposes. Several candidates for the same food are merged. */
export type Candidate = {
  foodId: string;
  /** 0..1 before merging. */
  score: number;
  reason: ReasonCode;
  reasonParams?: ReasonParams;
  /** Which signal produced this, e.g. "S1". */
  signal: string;
  /** Set by suggest() from the signal's registration. */
  family?: SignalFamily;
};

export type Suggestion = {
  foodId: string;
  /** 0..1, calibrated and capped — shown to the user as a percentage. */
  confidence: number;
  reason: ReasonCode;
  reasonParams?: ReasonParams;
  /** Every signal that fired for this food. Debugging + telemetry. */
  signals: string[];
};

/**
 * Everything derived from logged meals. Built once per session and memoized —
 * `suggest()` must never compute this itself (see TUNING.BUDGET_MS).
 */
export type HistoryStats = {
  totalMeals: number;
  /** P(food B in the same meal | food A in that meal). Outer key = A. */
  coOccurrence: Map<string, Map<string, number>>;
  /** Support (meal count) behind each co-occurrence pair, so thin pairs can be dropped. */
  coSupport: Map<string, Map<string, number>>;
  /** P(food appears in a meal of this type). */
  byMealType: Map<MealType, Map<string, number>>;
  /** How many of the last 14 days included this food. */
  recentDays: Map<string, number>;
  /** How many of the last 7 days included this food. S7 is defined over a
   *  week, and scoring a 14-day count as if it were a 7-day one claimed 75%
   *  confidence for a food eaten 5 days in 14 — a 36% habit. */
  streakDays: Map<string, number>;
  /** Median grams the user logs for this food — seeds the portion sheet. */
  medianPortion: Map<string, number>;
  /** Per meal type, how often each category appears. Drives MISSING_CATEGORY. */
  categoryRate: Map<MealType, Map<Category, number>>;
  /** Category of each known food, so ranking can diversify without the caller. */
  categoryOf: Map<string, Category>;
  /** How many times each food has ever been logged. Gates S5. */
  timesLogged: Map<string, number>;
};

export type SuggestInput = {
  /** What's on screen right now. */
  tray: TrayEntry[];
  mealType: MealType;
  /** Now. Passed in, never read from the clock, so tests are deterministic. */
  at: Date;
  targets: { kcal: number; protein: number };
  /** Everything already saved today. Excludes the tray. */
  consumedToday: Macros;
  history: HistoryStats;
  /** Food ids the user ✕'d this session. */
  declined: readonly string[];
  /** Persisted dismissal counts, keyed `${foodId}|${mealType}`. */
  dismissals?: ReadonlyMap<string, number>;
};

/**
 * Evidence family. Signals in the SAME family are measuring the same
 * underlying fact and must not be treated as independent confirmations of
 * each other — see the merge step in index.ts.
 *
 *   habit     — how often this person eats this (S1, S3, S4, S7)
 *   need      — a nutritional shortfall or headroom today (S2, S6)
 *   adjacency — this goes with that (S5)
 */
export type SignalFamily = "habit" | "need" | "adjacency";

/** One signal: a pure function from the input to what it would propose. */
export type Signal = {
  id: string;
  family: SignalFamily;
  run: (input: SuggestInput) => Candidate[];
};

export const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function emptyHistory(): HistoryStats {
  return {
    totalMeals: 0,
    coOccurrence: new Map(),
    coSupport: new Map(),
    byMealType: new Map(),
    recentDays: new Map(),
    streakDays: new Map(),
    medianPortion: new Map(),
    categoryRate: new Map(),
    categoryOf: new Map(),
    timesLogged: new Map(),
  };
}
