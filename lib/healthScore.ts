// Skor Sehat — the 0–100 composite that drives every leaderboard.
//
// Ranking deliberately is NOT training volume. Volume rewards whoever lifts
// heaviest, which is mostly bodyweight and training age; it can't be "won" by
// eating well or being consistent. This composite rewards the behaviours the
// app is actually trying to build:
//
//   Kalori on target   25
//   Protein hit        25
//   Gula rendah        20
//   Lemak rendah       15
//   Sesi latihan       15
//
// Pure functions — no DB, no client APIs — so both the server (leaderboards)
// and tests can use it.

export type ScoreInput = {
  kcal: number;
  kcalTarget: number;
  protein: number;
  proteinTarget: number;
  sugar: number;
  fat: number;
  /** Gym + cardio sessions logged that day. */
  sessions: number;
};

export type ScoreBreakdown = {
  total: number;
  kalori: number;
  protein: number;
  gula: number;
  lemak: number;
  sesi: number;
};

export const WEIGHTS = { kalori: 25, protein: 25, gula: 20, lemak: 15, sesi: 15 } as const;

/** Daily sugar ceiling (g) for full marks; WHO free-sugar guidance is ~25g. */
export const SUGAR_TARGET_G = 25;
/** Fat is scored against a share of energy rather than an absolute. */
export const FAT_ENERGY_SHARE = 0.3;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Full marks at target, falling off symmetrically either side. Being 500 kcal
 *  under is a miss just like being 500 over — this is a health score, not a
 *  deficit score. */
function onTargetScore(value: number, target: number): number {
  if (target <= 0) return 0;
  const ratio = value / target;
  // 1.0 at target, 0 once you're 40% away in either direction.
  return clamp01(1 - Math.abs(1 - ratio) / 0.4);
}

/** Rewards hitting or exceeding a floor (protein). No penalty for going over. */
function atLeastScore(value: number, target: number): number {
  if (target <= 0) return 0;
  return clamp01(value / target);
}

/** Rewards staying UNDER a ceiling (sugar, fat). Full marks at zero. */
function underScore(value: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return clamp01(1 - value / ceiling);
}

export function healthScore(i: ScoreInput): ScoreBreakdown {
  // A day with nothing logged scores 0 rather than scoring well for "no sugar".
  const loggedAnything = i.kcal > 0 || i.sessions > 0;
  if (!loggedAnything) {
    return { total: 0, kalori: 0, protein: 0, gula: 0, lemak: 0, sesi: 0 };
  }

  const kalori = onTargetScore(i.kcal, i.kcalTarget) * WEIGHTS.kalori;
  const protein = atLeastScore(i.protein, i.proteinTarget) * WEIGHTS.protein;
  const gula = underScore(i.sugar, SUGAR_TARGET_G) * WEIGHTS.gula;
  // Fat ceiling scales with the calorie target: 30% of energy at 9 kcal/g.
  const fatCeiling = (i.kcalTarget * FAT_ENERGY_SHARE) / 9;
  const lemak = underScore(i.fat, fatCeiling) * WEIGHTS.lemak;
  // One session earns most of it; a second (e.g. lift + run) tops it up.
  const sesi = clamp01(i.sessions / 2) * WEIGHTS.sesi;

  const round = (x: number) => Math.round(x * 10) / 10;
  return {
    total: Math.round(kalori + protein + gula + lemak + sesi),
    kalori: round(kalori),
    protein: round(protein),
    gula: round(gula),
    lemak: round(lemak),
    sesi: round(sesi),
  };
}

/** Steps estimated from distance and height — the app has no pedometer.
 *  stride ≈ 0.65 × height, so steps = distance_m / stride. */
export function estimateSteps(distanceM: number, heightCm: number | null): number {
  const h = (heightCm ?? 170) / 100;
  const stride = 0.65 * h;
  if (stride <= 0 || distanceM <= 0) return 0;
  return Math.round(distanceM / stride);
}
