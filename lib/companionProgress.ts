import type { Measurement } from "./measurements";
import type { WorkoutSession } from "./workouts";
export type Character = "richie" | "renita";
export type CompanionGoal = {
  mode: "weight" | "recomp";
  baselineDate: string;
  baselineWeight: number | null;
  targetWeight: number | null;
  baselineWaist: number | null;
  targetWaist: number | null;
  exercise: string;
  reps: number;
  baselineLift: number | null;
  targetLift: number | null;
};
const positive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;
export function dateOffset(date: string, days: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function weightSummary(rows: Measurement[], today: string) {
  const valid = rows
    .filter((r) => positive(r.weightKg) && r.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const recent = [...new Map(valid.map((r) => [r.date, r])).values()].filter(
    (r) => r.date >= dateOffset(today, -6),
  );
  return {
    latest: valid.at(-1) ?? null,
    count: recent.length,
    mean:
      recent.length >= 3
        ? recent.reduce((s, r) => s + r.weightKg!, 0) / recent.length
        : null,
  };
}
export function comparableLifts(
  workouts: WorkoutSession[],
  exercise: string,
  reps: number,
  today: string,
) {
  const days = new Map<string, number>();
  for (const w of workouts) {
    if (!w.completed || w.date > today || w.date < dateOffset(today, -27))
      continue;
    for (const e of w.exercises) {
      if (e.skipped || (e.swappedTo || e.exerciseName) !== exercise) continue;
      for (const s of e.sets)
        if (s.reps === reps && positive(s.weight))
          days.set(w.date, Math.max(days.get(w.date) ?? 0, s.weight));
    }
  }
  return [...days]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, weight]) => ({ date, weight }));
}
export function goalRatio(
  current: number,
  baseline: number | null,
  target: number | null,
): number | null {
  if (
    !positive(current) ||
    !positive(baseline) ||
    !positive(target) ||
    target === baseline
  )
    return null;
  return Math.min(1, Math.max(0, (current - baseline) / (target - baseline)));
}
export function levelFromWeight(
  weightKg: number,
  goal: CompanionGoal | null,
  fallbackBaselineKg?: number | null,
): number | null {
  if (!goal || goal.mode !== "weight") return null;
  const baseline = positive(goal.baselineWeight)
    ? goal.baselineWeight
    : positive(fallbackBaselineKg)
      ? fallbackBaselineKg
      : null;
  const fraction = goalRatio(weightKg, baseline, goal.targetWeight);
  if (fraction === null) return null;
  return Math.max(1, Math.min(12, 1 + Math.floor(fraction * 11 + 1e-8)));
}

export type CompanionProgressResult = {
  level: number | null;
  fraction: number | null;
  highestLevel: number | null;
  previousLevel: number | null;
  demoted: boolean;
  demotedFrom: number | null;
};

export function companionProgress(
  goal: CompanionGoal | null,
  rows: Measurement[],
  workouts: WorkoutSession[],
  today: string,
): CompanionProgressResult {
  const unavailable: CompanionProgressResult = {
    level: null,
    fraction: null,
    highestLevel: null,
    previousLevel: null,
    demoted: false,
    demotedFrom: null,
  };
  if (!goal) return unavailable;
  if (goal.mode === "weight") {
    const validByDate = new Map<string, Measurement>();
    for (const r of rows) {
      if (positive(r.weightKg) && r.date <= today) {
        validByDate.set(r.date, r);
      }
    }
    const valid = [...validByDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (valid.length === 0) return unavailable;

    const effectiveBaseline = positive(goal.baselineWeight)
      ? goal.baselineWeight
      : valid[0].weightKg!;
    const targetWeight = positive(goal.targetWeight) ? goal.targetWeight : null;
    if (targetWeight === null || effectiveBaseline === targetWeight) {
      return unavailable;
    }

    const latest = valid[valid.length - 1];
    const fraction = goalRatio(latest.weightKg!, effectiveBaseline, targetWeight);
    const level = levelFromWeight(latest.weightKg!, goal, effectiveBaseline);
    if (fraction === null || level === null) return unavailable;

    const prevRow = valid.length >= 2 ? valid[valid.length - 2] : null;
    const previousLevel = prevRow
      ? levelFromWeight(prevRow.weightKg!, goal, effectiveBaseline)
      : null;

    const afterBaseline = goal.baselineDate
      ? valid.filter((r) => r.date >= goal.baselineDate)
      : valid;
    const historyRows = afterBaseline.length > 0 ? afterBaseline : valid;
    let highestLevel = level;
    for (const r of historyRows) {
      const lv = levelFromWeight(r.weightKg!, goal, effectiveBaseline);
      if (lv !== null && lv > highestLevel) highestLevel = lv;
    }

    const demoted = level < highestLevel;
    return {
      level,
      fraction,
      highestLevel,
      previousLevel,
      demoted,
      demotedFrom: demoted ? highestLevel : null,
    };
  }
  const waists = [
    ...new Map(
      rows
        .filter(
          (r) =>
            positive(r.waistCm) &&
            r.date <= today &&
            r.date >= dateOffset(today, -27),
        )
        .map((r) => [r.date, r]),
    ).values(),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-2);
  const lifts = comparableLifts(
    workouts,
    goal.exercise,
    goal.reps,
    today,
  ).slice(-2);
  if (waists.length < 2 || lifts.length < 2) return unavailable;
  const waist = waists.map((r) =>
      goalRatio(r.waistCm!, goal.baselineWaist, goal.targetWaist),
    ),
    lift = lifts.map((r) =>
      goalRatio(r.weight, goal.baselineLift, goal.targetLift),
    );
  if ([...waist, ...lift].some((r) => r === null)) return unavailable;
  const fraction =
    (Math.min(...(waist as number[])) + Math.min(...(lift as number[]))) / 2;
  const level = Math.max(1, Math.min(12, 1 + Math.floor(fraction * 11 + 1e-8)));
  return {
    level,
    fraction,
    highestLevel: level,
    previousLevel: null,
    demoted: false,
    demotedFrom: null,
  };
}

export type LevelUnlockRequirement =
  | {
      kind: "weight";
      level: number;
      fraction: number;
      requiredKg: number;
      remainingKg: number | null;
      direction: "loss" | "gain";
      /** True when currentKg was used because baselineWeight isn't calibrated yet. */
      estimated: boolean;
      /** True when currentKg already touched or passed requiredKg. */
      alreadyReached: boolean;
    }
  | {
      kind: "recomp";
      level: number;
      fraction: number;
      requiredWaistCm: number;
      requiredLiftKg: number;
      exercise: string;
      reps: number;
    }
  | {
      kind: "unconfigured";
      level: number;
      fraction: number;
    };

/**
 * Exact target threshold needed to unlock `targetLevel` (1..12), matching
 * `companionProgress`'s `level = 1 + Math.floor(fraction * 11 + 1e-8)` curve.
 */
export function unlockRequirementForLevel(
  goal: CompanionGoal | null,
  targetLevel: number,
  currentKg?: number | null,
  fallbackBaselineKg?: number | null,
): LevelUnlockRequirement {
  const rawLevel = Number.isFinite(targetLevel) ? Math.round(targetLevel) : 1;
  const level = Math.max(1, Math.min(12, rawLevel));
  const fraction = (level - 1) / 11;
  if (!goal) return { kind: "unconfigured", level, fraction };

  const targetWeight = positive(goal.targetWeight) ? goal.targetWeight : null;
  const baselineWeight = positive(goal.baselineWeight)
    ? goal.baselineWeight
    : positive(fallbackBaselineKg)
      ? fallbackBaselineKg
      : null;
  const latestKg = positive(currentKg) ? currentKg : null;

  if (targetWeight !== null) {
    let startKg: number | null = null;
    let estimated = false;
    if (baselineWeight !== null && targetWeight !== baselineWeight) {
      startKg = baselineWeight;
    } else if (
      baselineWeight === null &&
      latestKg !== null &&
      targetWeight !== latestKg
    ) {
      startKg = latestKg;
      estimated = true;
    }
    if (startKg !== null) {
      const requiredKg = startKg + fraction * (targetWeight - startKg);
      const direction = targetWeight < startKg ? "loss" : "gain";
      const remainingKg =
        latestKg !== null ? Math.abs(latestKg - requiredKg) : null;
      const alreadyReached =
        latestKg !== null &&
        (direction === "loss"
          ? latestKg <= requiredKg + 1e-6
          : latestKg >= requiredKg - 1e-6);
      return {
        kind: "weight",
        level,
        fraction,
        requiredKg,
        remainingKg,
        direction,
        estimated,
        alreadyReached,
      };
    }
  }

  if (
    goal.mode === "recomp" &&
    positive(goal.baselineWaist) &&
    positive(goal.targetWaist) &&
    goal.targetWaist !== goal.baselineWaist &&
    positive(goal.baselineLift) &&
    positive(goal.targetLift) &&
    goal.targetLift !== goal.baselineLift
  ) {
    return {
      kind: "recomp",
      level,
      fraction,
      requiredWaistCm:
        goal.baselineWaist + fraction * (goal.targetWaist - goal.baselineWaist),
      requiredLiftKg:
        goal.baselineLift + fraction * (goal.targetLift - goal.baselineLift),
      exercise: goal.exercise || "Latihan",
      reps: positive(goal.reps) ? Math.round(goal.reps) : 8,
    };
  }

  return { kind: "unconfigured", level, fraction };
}
