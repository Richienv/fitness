// Pure day-by-day progress aggregation, trend series, range stats, weekly
// bucketing, and "kalau gini terus" future trajectory projections. Zero browser
// or storage imports so it stays fast, server-safe, and unit-tested.
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
  sugarG?: number;
  fiberG?: number;
  sodiumMg?: number;
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
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
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

export type ProgressMetricKey =
  | "weight"
  | "kcal"
  | "deficit"
  | "protein"
  | "fat"
  | "sugar"
  | "carbs"
  | "workout";

export type WeightTrendPoint = {
  date: string;
  weightKg: number | null;
  trendKg: number | null;
};

export type MetricRangeStats = {
  metric: ProgressMetricKey;
  sampleCount: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  /** Latest value minus earliest value in range (null if < 2 samples). */
  delta: number | null;
  /** Sum across sampled days. */
  total: number | null;
  targetHitDays: number;
  targetEligibleDays: number;
  latest: number | null;
};

export type ProgressChartBucket = {
  key: string;
  startDate: string;
  endDate: string;
  /** Latest logged date inside this bucket (for day inspection). */
  representativeDate: string;
  isAggregated: boolean;
  dayCount: number;
  mealDays: number;
  workoutDays: number;
  weightKg: number | null;
  weightTrendKg: number | null;
  kcalIn: number;
  totalBurnKcal: number;
  activeBurnKcal: number;
  totalActiveBurnKcal: number;
  deficitKcal: number | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
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

function weekStartKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const offset = day === 0 ? -6 : 1 - day; // Monday start
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const nonNeg = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;

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
    const active = Math.round(nonNeg(d.activeBurnKcal));
    let normal = 0;
    if (profile && profile.cm > 100 && profile.age > 5) {
      const bmr = mifflinBMR(profile.sex, runningKg, profile.cm, profile.age);
      normal = Math.round(
        d.activeFromHealth && active > 0 ? bmr : bmr * SEDENTARY_FACTOR,
      );
    }
    const totalBurn = normal + active;
    const kcalIn = Math.round(nonNeg(d.kcalIn));
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
      proteinG: Math.round(nonNeg(d.proteinG)),
      carbsG: Math.round(nonNeg(d.carbsG)),
      fatG: Math.round(nonNeg(d.fatG)),
      sugarG: r1(nonNeg(d.sugarG)),
      fiberG: r1(nonNeg(d.fiberG)),
      sodiumMg: Math.round(nonNeg(d.sodiumMg)),
      normalBurnKcal: normal,
      activeBurnKcal: active,
      totalBurnKcal: totalBurn,
      deficitKcal,
      waterMl: Math.round(nonNeg(d.waterMl)),
      mealCount: Math.round(nonNeg(d.mealCount)),
      workoutCount: Math.round(nonNeg(d.workoutCount)),
    });
  }

  return out.reverse();
}

/**
 * Computes a trailing 7-calendar-day moving average for body weight across rows,
 * returning chronological points (oldest first).
 */
export function weightTrend7d(rows: DailyProgressRow[]): WeightTrendPoint[] {
  const sortedAsc = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const weighed = sortedAsc.filter(
    (r): r is DailyProgressRow & { weightKg: number } => r.weightKg !== null,
  );
  let left = 0;
  let right = 0;
  let sum = 0;
  let count = 0;

  return sortedAsc.map((r) => {
    const winStart = addDays(r.date, -6);
    while (right < weighed.length && weighed[right].date <= r.date) {
      sum += weighed[right].weightKg;
      count += 1;
      right += 1;
    }
    while (left < right && weighed[left].date < winStart) {
      sum -= weighed[left].weightKg;
      count -= 1;
      left += 1;
    }
    return {
      date: r.date,
      weightKg: r.weightKg,
      trendKg: count > 0 ? r2(sum / count) : null,
    };
  });
}

/**
 * Computes per-metric summary statistics over a slice of daily rows.
 * Meal-based metrics evaluate logged-meal days; workout evaluates active days;
 * weight evaluates weigh-in days.
 */
export function computeMetricStats(
  rows: DailyProgressRow[],
  metric: ProgressMetricKey,
  options?: {
    target?: number | null;
    goalDirection?: "losing" | "gaining";
  },
): MetricRangeStats {
  const sortedAsc = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const target =
    typeof options?.target === "number" && Number.isFinite(options.target)
      ? options.target
      : null;
  const direction = options?.goalDirection ?? "losing";
  const hasMeals = (r: DailyProgressRow) => r.mealCount > 0 || r.kcalIn > 0;

  let values: number[] = [];
  let targetHitDays = 0;
  let targetEligibleDays = 0;

  if (metric === "weight") {
    values = sortedAsc
      .map((r) => r.weightKg)
      .filter((v): v is number => v !== null);
    targetEligibleDays = values.length;
    if (target !== null && target > 0) {
      targetHitDays = values.filter((v) =>
        direction === "gaining" ? v >= target : v <= target,
      ).length;
    }
  } else if (metric === "deficit") {
    values = sortedAsc
      .map((r) => r.deficitKcal)
      .filter((v): v is number => v !== null);
    targetEligibleDays = values.length;
    const minDeficit = target ?? 0;
    targetHitDays = values.filter((v) =>
      target !== null ? v >= minDeficit : v > 0,
    ).length;
  } else if (metric === "workout") {
    const active = sortedAsc.filter(
      (r) => r.workoutCount > 0 || r.activeBurnKcal > 0,
    );
    values = active.map((r) => r.activeBurnKcal);
    targetHitDays = active.length;
    targetEligibleDays = sortedAsc.length;
  } else {
    const mealRows = sortedAsc.filter(hasMeals);
    targetEligibleDays = mealRows.length;
    if (metric === "kcal") {
      values = mealRows.map((r) => r.kcalIn);
      if (target !== null && target > 0) {
        targetHitDays = values.filter(
          (v) => Math.abs(v - target) <= target * 0.15,
        ).length;
      }
    } else if (metric === "protein") {
      values = mealRows.map((r) => r.proteinG);
      if (target !== null && target > 0) {
        targetHitDays = values.filter((v) => v >= target).length;
      }
    } else if (metric === "fat") {
      values = mealRows.map((r) => r.fatG);
      if (target !== null && target > 0) {
        targetHitDays = values.filter((v) => v <= target).length;
      }
    } else if (metric === "sugar") {
      values = mealRows.map((r) => r.sugarG);
      if (target !== null && target > 0) {
        targetHitDays = values.filter((v) => v <= target).length;
      }
    } else {
      values = mealRows.map((r) => r.carbsG);
      if (target !== null && target > 0) {
        targetHitDays = values.filter((v) => v <= target).length;
      }
    }
  }

  if (values.length === 0) {
    return {
      metric,
      sampleCount: 0,
      avg: null,
      min: null,
      max: null,
      delta: null,
      total: null,
      targetHitDays,
      targetEligibleDays,
      latest: null,
    };
  }

  const sum = values.reduce((s, v) => s + v, 0);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawDelta =
    values.length >= 2 ? values[values.length - 1] - values[0] : null;
  const rawLatest = values[values.length - 1];

  const fmtAvg =
    metric === "weight"
      ? r2(sum / values.length)
      : metric === "sugar"
        ? r1(sum / values.length)
        : Math.round(sum / values.length);
  const fmtVal =
    metric === "weight" || metric === "sugar" ? r1 : Math.round;
  const fmtDelta =
    metric === "weight"
      ? r2
      : metric === "sugar"
        ? r1
        : Math.round;

  return {
    metric,
    sampleCount: values.length,
    avg: fmtAvg,
    min: fmtVal(rawMin),
    max: fmtVal(rawMax),
    delta: rawDelta !== null ? fmtDelta(rawDelta) : null,
    total:
      metric === "sugar"
        ? r1(sum)
        : metric === "weight"
          ? null
          : Math.round(sum),
    targetHitDays,
    targetEligibleDays,
    latest: fmtVal(rawLatest),
  };
}

/**
 * Groups rows into daily points for ≤ 45-day ranges or weekly Monday-anchored
 * averages for wide spans (> 45 days in "Semua"), preventing overcrowded charts.
 */
export function bucketProgressRows(
  allRows: DailyProgressRow[],
  from: string,
  to: string,
  options?: {
    maxDailySpan?: number;
    trendPoints?: WeightTrendPoint[];
  },
): ProgressChartBucket[] {
  const maxDailySpan = options?.maxDailySpan ?? 45;
  const sortedAllAsc = [...allRows].sort((a, b) => a.date.localeCompare(b.date));
  const trendList = options?.trendPoints ?? weightTrend7d(sortedAllAsc);
  const trendByDate = new Map(trendList.map((pt) => [pt.date, pt.trendKg]));

  const ranged = sortedAllAsc.filter((r) => r.date >= from && r.date <= to);
  if (ranged.length === 0) return [];

  const span = Math.max(1, diffDays(from, to) + 1);
  if (span <= maxDailySpan && ranged.length <= maxDailySpan) {
    return ranged.map((r) => ({
      key: r.date,
      startDate: r.date,
      endDate: r.date,
      representativeDate: r.date,
      isAggregated: false,
      dayCount: 1,
      mealDays: r.mealCount > 0 || r.kcalIn > 0 ? 1 : 0,
      workoutDays: r.workoutCount > 0 || r.activeBurnKcal > 0 ? 1 : 0,
      weightKg: r.weightKg,
      weightTrendKg: trendByDate.get(r.date) ?? r.weightKg,
      kcalIn: r.kcalIn,
      totalBurnKcal: r.totalBurnKcal,
      activeBurnKcal: r.activeBurnKcal,
      totalActiveBurnKcal: r.activeBurnKcal,
      deficitKcal: r.deficitKcal,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
      sugarG: r.sugarG,
      fiberG: r.fiberG,
      sodiumMg: r.sodiumMg,
    }));
  }

  const byWeek = new Map<string, DailyProgressRow[]>();
  for (const r of ranged) {
    const wk = weekStartKey(r.date);
    const arr = byWeek.get(wk);
    if (arr) arr.push(r);
    else byWeek.set(wk, [r]);
  }

  const out: ProgressChartBucket[] = [];
  for (const [wk, items] of [...byWeek.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const mealRows = items.filter((r) => r.mealCount > 0 || r.kcalIn > 0);
    const weightVals = items
      .map((r) => r.weightKg)
      .filter((v): v is number => v !== null);
    const trendVals = items
      .map((r) => trendByDate.get(r.date) ?? null)
      .filter((v): v is number => v !== null);
    const deficitVals = items
      .map((r) => r.deficitKcal)
      .filter((v): v is number => v !== null);
    const workoutRows = items.filter(
      (r) => r.workoutCount > 0 || r.activeBurnKcal > 0,
    );
    const burnBase = mealRows.length > 0 ? mealRows : items.filter((r) => r.totalBurnKcal > 0);

    const avgMeal = (pick: (r: DailyProgressRow) => number) =>
      mealRows.length > 0
        ? mealRows.reduce((s, r) => s + pick(r), 0) / mealRows.length
        : 0;
    const totalActive = items.reduce((s, r) => s + r.activeBurnKcal, 0);

    const bucketStart = items[0].date;
    const bucketEnd = items[items.length - 1].date;
    const weekEnd = addDays(wk, 6);

    out.push({
      key: wk,
      startDate: bucketStart < from ? from : bucketStart,
      endDate: weekEnd > to ? to : bucketEnd,
      representativeDate: bucketEnd,
      isAggregated: true,
      dayCount: items.length,
      mealDays: mealRows.length,
      workoutDays: workoutRows.length,
      weightKg:
        weightVals.length > 0
          ? r1(weightVals.reduce((s, v) => s + v, 0) / weightVals.length)
          : null,
      weightTrendKg:
        trendVals.length > 0
          ? r2(trendVals[trendVals.length - 1])
          : weightVals.length > 0
            ? r2(weightVals.reduce((s, v) => s + v, 0) / weightVals.length)
            : null,
      kcalIn: Math.round(avgMeal((r) => r.kcalIn)),
      totalBurnKcal:
        burnBase.length > 0
          ? Math.round(
              burnBase.reduce((s, r) => s + r.totalBurnKcal, 0) / burnBase.length,
            )
          : 0,
      activeBurnKcal:
        workoutRows.length > 0
          ? Math.round(totalActive / workoutRows.length)
          : 0,
      totalActiveBurnKcal: Math.round(totalActive),
      deficitKcal:
        deficitVals.length > 0
          ? Math.round(
              deficitVals.reduce((s, v) => s + v, 0) / deficitVals.length,
            )
          : null,
      proteinG: Math.round(avgMeal((r) => r.proteinG)),
      carbsG: Math.round(avgMeal((r) => r.carbsG)),
      fatG: Math.round(avgMeal((r) => r.fatG)),
      sugarG: r1(avgMeal((r) => r.sugarG)),
      fiberG: r1(avgMeal((r) => r.fiberG)),
      sodiumMg: Math.round(avgMeal((r) => r.sodiumMg)),
    });
  }

  return out;
}

/**
 * Generates clean human-friendly Y-axis tick values covering [minVal, maxVal].
 */
export function niceTicks(
  minVal: number,
  maxVal: number,
  targetCount = 4,
  zeroFloor = false,
): { min: number; max: number; ticks: number[] } {
  let lo = Number.isFinite(minVal) ? minVal : 0;
  let hi = Number.isFinite(maxVal) ? maxVal : 1;
  if (zeroFloor) lo = Math.min(0, lo);
  if (hi <= lo) hi = lo + (zeroFloor ? 10 : 2);

  const rawSpan = hi - lo;
  const roughStep = rawSpan / Math.max(2, targetCount - 1);
  const mag = 10 ** Math.floor(Math.log10(roughStep));
  const norm = roughStep / mag;
  const niceNorm =
    norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;

  const minTick = zeroFloor && lo === 0 ? 0 : Math.floor(lo / step) * step;
  const maxTick = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = minTick; v <= maxTick + step * 0.001; v += step) {
    ticks.push(r2(v));
    if (ticks.length >= 8) break;
  }
  return {
    min: ticks[0] ?? minTick,
    max: ticks[ticks.length - 1] ?? maxTick,
    ticks,
  };
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
