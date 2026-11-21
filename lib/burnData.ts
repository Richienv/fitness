"use client";
// Browser side of lib/burn.ts: today's gym sessions and logged activities,
// each with its estimate, from the same stores the rest of the app reads.
import { getAllMeasurements } from "./measurements";
import { getProfile } from "./settings";
import {
  getAllWorkouts,
  getDefForWorkout,
  getSession,
  type WorkoutSession,
} from "./workouts";
import { getActivities, type ActivityEntry } from "./activity";
import { activityKcal, bodyWeightKg, workoutKcal, type ExerciseBurn } from "./burn";
import { combineDay } from "./healthImport";
import { getHealthDay, type StoredHealthDay } from "./health";

export function readBodyKg(): number {
  return bodyWeightKg(getAllMeasurements(), getProfile().weightKg);
}

/** "BESARIN DADA" → "Besarin dada". */
export function sessionTitle(w: Pick<WorkoutSession, "sessionType" | "customName">): string {
  const raw =
    w.sessionType === "CUSTOM"
      ? w.customName || "Catat bebas"
      : (getSession(w.sessionType)?.name ?? "Latihan");
  const lower = raw.toLocaleLowerCase("id-ID");
  return lower.charAt(0).toLocaleUpperCase("id-ID") + lower.slice(1);
}

/** A session's estimate. Logged exercises line up with the session's own
 *  list by position, the same way the summary page reads them. */
export function workoutBurn(
  w: WorkoutSession,
  kg = readBodyKg(),
): { total: number; perExercise: ExerciseBurn[] } {
  const def = getDefForWorkout(w);
  return workoutKcal(
    w.exercises
      .filter((e) => !e.skipped)
      .map((e) => {
        const i = w.exercises.indexOf(e);
        const d = def.exercises[i] ?? def.exercises.find((x) => x.name === e.exerciseName);
        return {
          name: e.swappedTo || d?.name || e.exerciseName,
          primary: d?.primary ?? [],
          sets: e.sets,
        };
      }),
    kg,
  );
}

export type DayBurn = {
  kg: number;
  gym: { id: string; title: string; completed: boolean; kcal: number }[];
  activities: (ActivityEntry & { kcal: number })[];
  total: number;
  /** "health" when Apple Health active energy is the total. */
  source: "health" | "estimate";
  health: StoredHealthDay | null;
  /** Rows shown but not added ("gym:<id>", "act:<id>"), so nothing counts twice. */
  excluded: string[];
  /** Estimate for Apple Health steps when Health sent steps but no energy. */
  healthStepsKcal: number | null;
};

export function readDayBurn(date: string): DayBurn {
  const kg = readBodyKg();
  const gym = getAllWorkouts()
    .filter((w) => w.date === date && w.exercises.some((e) => e.sets.length > 0))
    .map((w) => ({
      id: w.id,
      title: sessionTitle(w),
      completed: !!w.completed,
      kcal: workoutBurn(w, kg).total,
    }));
  const activities = getActivities(date).map((a) => ({ ...a, kcal: activityKcal(a, kg) }));
  const health = getHealthDay(date);
  const combined = combineDay(
    [
      ...gym.map((g) => ({ key: `gym:${g.id}`, kind: "gym" as const, kcal: g.kcal })),
      ...activities.map((a) => ({ key: `act:${a.id}`, kind: a.kind, kcal: a.kcal })),
    ],
    health,
    (steps) => activityKcal({ kind: "langkah", steps }, kg),
  );
  return { kg, gym, activities, health, ...combined };
}
