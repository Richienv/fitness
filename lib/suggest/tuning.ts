// Every threshold the engine uses, in one place.
//
// These numbers are the engine's opinions, and they will be wrong at first.
// Keeping them here — rather than scattered through the signals — means
// retuning is one file to read and one file to change, and a test that fails
// on calibration points at a value you can actually find.

export const TUNING = {
  // ── history windows ──────────────────────────────────────────────────────
  /** Days of history used for stable habits. Long enough to survive a holiday. */
  HABIT_WINDOW_DAYS: 90,
  /** Days counted as "recent". A changed routine should surface within this. */
  RECENT_WINDOW_DAYS: 14,
  /** Recent meals count this much extra in byMealType, so a new routine wins. */
  RECENCY_WEIGHT: 1.5,

  // ── S1 co-occurrence ─────────────────────────────────────────────────────
  /** Minimum P(B|A) worth proposing. Below this it's a coincidence. */
  CO_MIN_P: 0.55,
  /** Meals a pair must appear in before its ratio means anything. Two meals
   *  can produce P = 1.0 and tell you nothing. */
  CO_MIN_SUPPORT: 3,

  // ── S2 protein gap ───────────────────────────────────────────────────────
  /** Grams short of target before it's worth mentioning. */
  PROTEIN_GAP_G: 25,
  /** Only nag when there aren't many meals left to fix it in. */
  PROTEIN_MEALS_LEFT: 2,
  /** Gap is divided by this to reach a score, so 60 g short ≈ full strength. */
  PROTEIN_GAP_DIVISOR: 60,
  PROTEIN_MAX_SCORE: 0.9,
  /** How many protein foods to propose. */
  PROTEIN_TOP_N: 3,

  // ── S3 missing category ──────────────────────────────────────────────────
  /** How habitual a category must be before its absence is notable. This is
   *  what makes rice fire for a rice eater and stay silent for someone on
   *  keto — the engine never names a food, only a rate. */
  CATEGORY_MIN_RATE: 0.7,

  // ── S4 meal routine ──────────────────────────────────────────────────────
  /** Share of this meal type's meals a food must appear in. */
  ROUTINE_MIN_RATE: 0.6,
  /** Routine scores slightly below its rate — habits break. */
  ROUTINE_SCALE: 0.9,

  // ── S5 paired condiment ──────────────────────────────────────────────────
  /** Never suggest a condiment the user has not actually adopted. */
  CONDIMENT_MIN_LOGS: 2,
  CONDIMENT_BASE: 0.5,
  CONDIMENT_PER_LOG: 0.1,
  CONDIMENT_MAX: 0.7,

  // ── S6 kcal headroom ─────────────────────────────────────────────────────
  /** Below this much room left, proposing a snack is just unhelpful. */
  HEADROOM_MIN_KCAL: 250,
  /** Deliberately weak: headroom should lose to every other signal. */
  HEADROOM_SCORE: 0.4,
  HEADROOM_TOP_N: 2,

  // ── S7 recent streak ─────────────────────────────────────────────────────
  /** Days out of the last 7 before a food counts as a streak. */
  STREAK_MIN_DAYS: 5,
  STREAK_WINDOW_DAYS: 7,
  STREAK_BASE: 0.5,
  STREAK_PER_DAY: 0.05,
  /** A streak has to be a CHANGE, not a habit. Without this, any food eaten
   *  most days fires S7 as well as S4 — the same fact counted twice — and a
   *  62%-of-the-time vegetable that happened to land 6 of the last 7 days got
   *  shown at 80%. Recent frequency must exceed the long-run rate by this
   *  much before "you've been on a kick" is a claim worth making. */
  STREAK_MIN_LIFT: 0.25,

  // ── cold start ───────────────────────────────────────────────────────────
  /** Below this many meals there is no history worth reading. */
  COLD_START_MEALS: 10,
  /** Cold-start guesses are guesses; never let them look confident. */
  COLD_START_MAX_CONF: 0.5,
  COLD_START_MAX_ITEMS: 2,

  // ── merging + ranking ────────────────────────────────────────────────────
  /** Dismissals of the same food for the same meal before it's a permanent no. */
  DISMISS_HARD_BLOCK: 3,
  /** Multiplier applied after 1–2 dismissals. */
  DISMISS_SOFT_PENALTY: 0.6,
  /** Over-target overshoot that triggers a penalty, as a share of the target. */
  KCAL_OVERSHOOT_PCT: 0.15,
  KCAL_OVERSHOOT_PENALTY: 0.5,
  /** Never show 100%: it reads as a promise, and we will be wrong. */
  MAX_CONFIDENCE: 0.95,
  /** Below this, saying nothing is better. */
  MIN_CONFIDENCE: 0.35,
  /** More than this stops being a hint and becomes a menu. */
  MAX_SUGGESTIONS: 4,

  // ── outcomes ─────────────────────────────────────────────────────────────
  /** Outcomes kept on device — the calibration fixture and, later, training data. */
  OUTCOME_LOG_MAX: 500,
  /** Dismissals older than this stop counting against a food. */
  DISMISS_WINDOW_DAYS: 30,

  // ── performance ──────────────────────────────────────────────────────────
  /** suggest() runs on every tray change; it must stay under this on a
   *  mid-range Android. HistoryStats is memoized outside the call for this
   *  reason — nothing in suggest() may touch storage. */
  BUDGET_MS: 16,
} as const;
