"use client";

// Workout history helpers for the practice calendar + "what you did last time".
// All derived from the existing workout store (getAllWorkouts) — no new data.

import { getAllWorkouts } from "./workouts";
import { previousPerformance } from "./exerciseHistory";

/** YYYY-MM-DD → the day before, computed at UTC noon to dodge TZ drift. */
export function prevDay(date: string): string {
  const t = Date.parse(`${date}T12:00:00Z`);
  return new Date(t - 86_400_000).toISOString().slice(0, 10);
}

/** Set of dates the user actually trained (a completed session, or any session
 *  with at least one logged set). */
export function trainedDates(): Set<string> {
  const s = new Set<string>();
  for (const w of getAllWorkouts()) {
    if (w.completed || w.exercises.some((e) => e.sets.length > 0)) s.add(w.date);
  }
  return s;
}

/** Consecutive training days ending today (an untrained *today* doesn't break a
 *  live streak — we count back from yesterday in that case). */
export function currentStreak(todayISO: string): number {
  const days = trainedDates();
  let d = todayISO;
  if (!days.has(d)) d = prevDay(d);
  let streak = 0;
  while (days.has(d)) {
    streak++;
    d = prevDay(d);
  }
  return streak;
}

export type LastPerf = { weight: number; reps: number; sets: number; date: string };

/** The most recent logged performance for an exercise (by the exercise actually
 *  done, so a swapped one counts as its own) — "terakhir 40kg × 10". Pass
 *  `excludeId` while a session is open so its own sets don't count as history. */
export function lastPerformance(exerciseName: string, excludeId?: string): LastPerf | null {
  const p = previousPerformance(getAllWorkouts(), exerciseName, excludeId);
  return p ? { weight: p.weight, reps: p.reps, sets: p.sets, date: p.date } : null;
}
