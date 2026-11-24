// Pure day-by-day progress aggregation and "kalau gini terus" future trajectory
// projections. Zero browser or storage imports so it stays fast and unit-tested.
import { mifflinBMR } from "./energy.ts";
import {
  KCAL_PER_KG_FAT,
  KCAL_PER_KG_TISSUE,
  SEDENTARY_FACTOR,
} from "./energyBalance.ts";

export type DailyProgressInput = {
  date: string;
  weightKg?: number | null;
  kcalIn: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
  activeBurnKcal: number;
  activeFromHealth: boolean;
  workoutCount: number;
  waterMl: number;
};

export type DailyProgressRow = {
  date: string;
  weightKg: number | null;
  kcalIn: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  normalBurnKcal: number;
  activeBurnKcal: number;
  totalBurnKcal: number;
  /** totalBurnKcal - kcalIn (positive = deficit). Null when no meals logged that day. */
  deficitKcal: number | null;
  waterMl: number;
  mealCount: number;
  workoutCount: number;
};

export type ProgressProfile = {
  sex: "male" | "female";
  cm: number;
  age: number;
  fallbackKg: number;
};

export type ProgressProjection = {
  /** Number of logged-meal days used to calculate the pace. */
  sampleDays: number;
  /** Starting weight used for projection (latest logged weight or profile fallback). */
  anchorKg: number;
  avgKcalIn: number;
  avgProteinG: number;
  avgBurnKcal: number;
  /** Positive = daily calorie deficit, negative = daily surplus. */
  avgDeficitKcal: number;
  /** Projected weekly weight delta in kg (negative = losing, positive = gaining). */
  weeklyKgChange: number;
  /** Projected weekly pure fat delta in kg (negative = losing, positive = gaining). */
  weeklyFatKgChange: number;
  /** Observed weekly scale trend (kg/week) when ≥2 weigh-ins span ≥3 days, else null. */
  observedWeeklyKgChange: number | null;
  projected14d: number;
  projected30d: number;
  projected60d: number;
  projected90d: number;
  targetKg: number | null;
  daysToTarget: number | null;
  targetDate: string | null;
  /** Direction relative to goal or neutral when no goal set. */
  trend: "losing" | "gaining" | "steady";
};

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000,
  );
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns raw per-day summaries into sorted day-by-day progress rows (newest first),
 * computing each day's normal burn from the closest known body weight up to that day.
 */
export function buildDailyProgressRows(
  days: DailyProgressInput[],
  profile: ProgressProfile | null,
): DailyProgressRow[] {
  const sortedAsc = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let runningKg = profile?.fallbackKg ?? 70;
  // Seed with earliest known weight if available so early days have a realistic BMR.
  const firstWeigh = sortedAsc.find(
    (d) => typeof d.weightKg === "number" && d.weightKg > 20,
  );
  if (firstWeigh?.weightKg) runningKg = firstWeigh.weightKg;

  const out: DailyProgressRow[] = [];
  for (const d of sortedAsc) {
    if (typeof d.weightKg === "number" && d.weightKg > 20 && d.weightKg < 400) {
      runningKg = d.weightKg;
    }
    const active = Math.max(0, Math.round(d.activeBurnKcal || 0));
    let normal = 0;
    if (profile && profile.cm > 100 && profile.age > 5) {
      const bmr = mifflinBMR(profile.sex, runningKg, profile.cm, profile.age);
      normal = Math.round(
        d.activeFromHealth && active > 0 ? bmr : bmr * SEDENTARY_FACTOR,
      );
    }
    const totalBurn = normal + active;
    const kcalIn = Math.max(0, Math.round(d.kcalIn || 0));
    const hasMeals = d.mealCount > 0 || kcalIn > 0;
    const deficitKcal =
      hasMeals && totalBurn > 0 ? totalBurn - kcalIn : null;

    out.push({
      date: d.date,
      weightKg:
        typeof d.weightKg === "number" && d.weightKg > 20 && d.weightKg < 400
          ? r1(d.weightKg)
          : null,
      kcalIn,
      proteinG: Math.max(0, Math.round(d.proteinG || 0)),
      carbsG: Math.max(0, Math.round(d.carbsG || 0)),
      fatG: Math.max(0, Math.round(d.fatG || 0)),
      normalBurnKcal: normal,
      activeBurnKcal: active,
      totalBurnKcal: totalBurn,
      deficitKcal,
      waterMl: Math.max(0, Math.round(d.waterMl || 0)),
      mealCount: Math.max(0, Math.round(d.mealCount || 0)),
      workoutCount: Math.max(0, Math.round(d.workoutCount || 0)),
    });
  }

  return out.reverse();
}

/**
 * Computes "kalau gini terus" future trajectory from recent entered data.
 * Prefers completed days (before `today`) when available so an unfinished morning
 * doesn't falsely look like an extreme deficit, falling back to `today` when that's
 * the only logged day so far.
 */
export function buildProgressProjection(
  rowsNewestFirst: DailyProgressRow[],
  anchorKg: number,
  targetKg: number | null,
  today: string,
): ProgressProjection | null {
  if (!(anchorKg > 20 && anchorKg < 400)) return null;

  const logged = rowsNewestFirst.filter(
    (r) => r.deficitKcal !== null && r.totalBurnKcal > 0 && r.kcalIn > 0,
  );
  const completed = logged.filter((r) => r.date < today);
  const sample = (completed.length >= 2 ? completed : logged).slice(0, 14);
  if (sample.length === 0) return null;

  const n = sample.length;
  const avgKcalIn = Math.round(sample.reduce((s, r) => s + r.kcalIn, 0) / n);
  const avgProteinG = Math.round(
    sample.reduce((s, r) => s + r.proteinG, 0) / n,
  );
  const avgBurnKcal = Math.round(
    sample.reduce((s, r) => s + r.totalBurnKcal, 0) / n,
  );
  const avgDeficitKcal = Math.round(
    sample.reduce((s, r) => s + (r.deficitKcal ?? 0), 0) / n,
  );

  // Negative weeklyKgChange means losing weight (deficit > 0).
  const dailyKgChange = -avgDeficitKcal / KCAL_PER_KG_TISSUE;
  const weeklyKgChange = r2(dailyKgChange * 7);
  const weeklyFatKgChange = r2((-avgDeficitKcal * 7) / KCAL_PER_KG_FAT);

  // Clamp projections to sensible human bounds (never below 30 kg).
  const proj = (days: number) =>
    r1(Math.max(30, anchorKg + dailyKgChange * days));

  // Observed scale trend over recent 28-day window when ≥2 weigh-ins span ≥3 days.
  let observedWeeklyKgChange: number | null = null;
  const weighed = rowsNewestFirst
    .filter((r) => r.weightKg !== null)
    .slice(0, 28);
  if (weighed.length >= 2) {
    const newest = weighed[0];
    const oldest = weighed[weighed.length - 1];
    const span = diffDays(oldest.date, newest.date);
    if (span >= 3 && newest.weightKg !== null && oldest.weightKg !== null) {
      observedWeeklyKgChange = r2(
        ((newest.weightKg - oldest.weightKg) / span) * 7,
      );
    }
  }

  let daysToTarget: number | null = null;
  let targetDate: string | null = null;
  if (
    targetKg !== null &&
    Number.isFinite(targetKg) &&
    targetKg > 20 &&
    Math.abs(dailyKgChange) >= 0.005
  ) {
    const deltaNeeded = targetKg - anchorKg;
    if (
      (deltaNeeded < -0.1 && dailyKgChange < 0) ||
      (deltaNeeded > 0.1 && dailyKgChange > 0)
    ) {
      const d = Math.ceil(deltaNeeded / dailyKgChange);
      if (d > 0 && d <= 730) {
        daysToTarget = d;
        targetDate = addDays(today, d);
      }
    }
  }

  const trend: ProgressProjection["trend"] =
    Math.abs(weeklyKgChange) < 0.05
      ? "steady"
      : weeklyKgChange < 0
        ? "losing"
        : "gaining";

  return {
    sampleDays: n,
    anchorKg: r1(anchorKg),
    avgKcalIn,
    avgProteinG,
    avgBurnKcal,
    avgDeficitKcal,
    weeklyKgChange,
    weeklyFatKgChange,
    observedWeeklyKgChange,
    projected14d: proj(14),
    projected30d: proj(30),
    projected60d: proj(60),
    projected90d: proj(90),
    targetKg: targetKg && targetKg > 20 ? r1(targetKg) : null,
    daysToTarget,
    targetDate,
    trend,
  };
}
