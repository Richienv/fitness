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
export function companionProgress(
  goal: CompanionGoal | null,
  rows: Measurement[],
  workouts: WorkoutSession[],
  today: string,
): { level: number | null; fraction: number | null } {
  const unavailable = { level: null, fraction: null };
  if (!goal) return unavailable;
  if (goal.mode === "weight") {
    const current = weightSummary(rows, today),
      previous = weightSummary(rows, dateOffset(today, -7));
    if (current.mean === null || previous.mean === null) return unavailable;
    const a = goalRatio(current.mean, goal.baselineWeight, goal.targetWeight),
      b = goalRatio(previous.mean, goal.baselineWeight, goal.targetWeight);
    if (a === null || b === null) return unavailable;
    const fraction = Math.min(a, b);
    return { level: 1 + Math.floor(fraction * 11 + 1e-8), fraction };
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
  return { level: 1 + Math.floor(fraction * 11 + 1e-8), fraction };
}
