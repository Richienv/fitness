"use client";
// Browser adapter for lib/motivation.ts: reads the same local records Home
// and the Makan page read, and nothing else. No storage shapes change here.
import { getAllMeals, gymDayReader, isCustomItem, type MealLog } from "./store";
import { macrosFor } from "./ingredients";
import { getAllWorkouts, type WorkoutSession } from "./workouts";
import { getAllMeasurements } from "./measurements";
import { TARGETS, todayKey } from "./targets";
import {
  snapshot,
  type DayIntake,
  type MotivationInput,
  type Snapshot,
} from "./motivation";

export function intakeByDate(meals: MealLog[]): Record<string, DayIntake> {
  const out: Record<string, DayIntake> = {};
  for (const m of meals) {
    const day = (out[m.date] ??= { kcal: 0, protein: 0 });
    for (const i of m.items ?? []) {
      const n = isCustomItem(i) ? i : macrosFor(i.id, i.qty);
      day.kcal += Number(n.kcal) || 0;
      day.protein += Number(n.protein) || 0;
    }
  }
  return out;
}

function isWeighted(w: WorkoutSession): boolean {
  // Sessions imported from Hermes carry only their total volume.
  return (
    (w.exercises ?? []).some(
      (e) => !e.skipped && (e.sets ?? []).some((s) => Number(s.weight) > 0),
    ) || Number(w.totalVolume) > 0
  );
}

export function readMotivationInput(
  over: { meals?: MealLog[]; today?: string } = {},
): MotivationInput {
  const today = over.today ?? todayKey();
  const gym = TARGETS.gymDay,
    rest = TARGETS.restDay;
  const isGymDay = gymDayReader();
  return {
    today,
    intake: intakeByDate(over.meals ?? getAllMeals()),
    workouts: getAllWorkouts().map((w) => ({
      date: w.date,
      completed: !!w.completed,
      weighted: isWeighted(w),
    })),
    weighIns: getAllMeasurements()
      .filter((m) => Number(m.weightKg) > 0)
      .map((m) => m.date),
    target: (d) => {
      const t = isGymDay(d) ? gym : rest;
      return { kcal: t.kcal, protein: t.protein };
    },
    isGymDay,
  };
}

/** Today's motivation numbers. Pass `meals` to compute from a list other than
 *  the stored one (the Makan page passes its pre-save list for "before"). */
export function readSnapshot(
  over: { meals?: MealLog[]; today?: string } = {},
): Snapshot {
  return snapshot(readMotivationInput(over));
}

// The workout logger saves, then navigates to the summary page. The "before"
// numbers ride along in sessionStorage for exactly one read, and only for a
// couple of minutes, so a summary opened later never celebrates.
const BEFORE_KEY = "r2.celebrate.before.v1";
const BEFORE_TTL_MS = 2 * 60 * 1000;
export function stashBefore(workoutId: string, before: Snapshot): void {
  try {
    sessionStorage.setItem(
      BEFORE_KEY,
      JSON.stringify({ workoutId, before, at: Date.now() }),
    );
  } catch {}
}
export function takeBefore(workoutId: string): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(BEFORE_KEY);
    sessionStorage.removeItem(BEFORE_KEY);
    if (!raw) return null;
    const x = JSON.parse(raw) as {
      workoutId: string;
      before: Snapshot;
      at: number;
    };
    if (x.workoutId !== workoutId || !(Date.now() - x.at < BEFORE_TTL_MS))
      return null;
    return x.before;
  } catch {
    return null;
  }
}
