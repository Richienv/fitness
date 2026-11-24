"use client";

// Recovery/volume signal for the Latihan home: how many sets each muscle got
// today (and in the last 7 days), read from the existing workout store, with no
// new persistence. Counts at MuscleKey granularity off the exercise's primary
// muscle (NEVER through MUSCLE_TO_GROUP, which would blur biceps and triceps
// into "arms"). The rules for resolving a logged exercise (position, then name,
// swapped-to muscle, skipped and empty sets ignored) live in lib/trainingLoad.ts
// so node can test them.
//
// Caveat: server-synced completed days store exercises:[] (mergeServerWorkouts),
// so they contribute nothing; the copy stays soft and only makes positive
// "sudah kena" claims when local set data exists.

import type { MuscleKey } from "./muscles";
import {
  getAllWorkouts,
  getDefForWorkout,
  exerciseDefFromEquipment,
  SESSIONS,
  type WorkoutSession,
} from "./workouts";
import { EQUIPMENT, type Equipment } from "./equipment";
import type { MachinePick } from "./machinePicks";
import { pickScore } from "./machinePicks";
import { addWorkoutLoad, withinLastDays, type MuscleLoad } from "./trainingLoad";

export type { MuscleLoad };

/** Indonesian body-part label per MuscleKey (for the suggestion note). */
const MUSCLE_LABEL: Record<MuscleKey, string> = {
  chest: "dada",
  lats: "punggung",
  midBack: "punggung",
  traps: "trapezius",
  frontDelt: "bahu",
  sideDelt: "bahu",
  rearDelt: "bahu",
  bicep: "bisep",
  tricep: "trisep",
  quad: "paha depan",
  hamstring: "paha belakang",
  glute: "bokong",
  calf: "betis",
  abs: "perut",
};

// Muscle of a named exercise, for a swapped-to name: the programs first, then
// the machine catalogue. Names the app does not know return undefined and the
// original exercise's muscle stands in (see muscleOfLog).
let byName: Map<string, MuscleKey> | null = null;
function muscleOfName(name: string): MuscleKey | undefined {
  if (!byName) {
    byName = new Map();
    for (const e of EQUIPMENT) {
      const m = exerciseDefFromEquipment(e).primary[0];
      if (m) byName.set(e.name.toLowerCase(), m);
    }
    // Programs win over the catalogue when both know a name.
    for (const s of SESSIONS) {
      for (const e of s.exercises) {
        if (e.primary[0]) byName.set(e.name.toLowerCase(), e.primary[0]);
      }
    }
  }
  return byName.get(name.trim().toLowerCase());
}

function addLoad(load: MuscleLoad, w: WorkoutSession): void {
  addWorkoutLoad(load, w, getDefForWorkout(w).exercises, muscleOfName);
}

/** Sets per muscle logged on `date` (completed + the active in-progress session). */
export function setsByMuscleToday(date: string): MuscleLoad {
  const load: MuscleLoad = {};
  for (const w of getAllWorkouts()) if (w.date === date) addLoad(load, w);
  return load;
}

/** Sets per muscle over the 7 days ending on `date`. */
export function setsByMuscleThisWeek(date: string): MuscleLoad {
  const load: MuscleLoad = {};
  for (const w of getAllWorkouts()) {
    if (withinLastDays(w.date, date, 7)) addLoad(load, w);
  }
  return load;
}

export type TodaySuggestion = { machines: Equipment[]; note: string };

/**
 * Suggest a few beginner-safe machines to do next, backing off muscles already
 * hit today and nudging toward untrained ones. Beginner-safe proxy for Phase 2 =
 * MACHINE/CABLE (Phase 3 swaps in the real needs-coach gate). CARDIO excluded —
 * the 3×10 default logs garbage for it.
 */
export function suggestToday(date: string, picks: MachinePick[]): TodaySuggestion {
  const today = setsByMuscleToday(date);
  const week = setsByMuscleThisWeek(date);
  const pickById = new Map(picks.map((p) => [p.id, p]));

  const scored = EQUIPMENT.filter(
    (e) => e.category === "MACHINE" || e.category === "CABLE"
  )
    .map((e) => {
      const m = exerciseDefFromEquipment(e).primary[0];
      const t = today[m] ?? 0;
      const wk = week[m] ?? 0;
      const p = pickById.get(e.id);
      let s = p ? pickScore(p) : 0.5;
      s -= 1.5 * t; // back off what's already hit today
      s -= 0.5 * wk; // gentle weekly recovery
      if (wk === 0) s += 1.2; // complementary novelty
      return { e, m, t, s };
    })
    .filter((x) => x.t < 6) // muscle already smashed today → drop
    .sort((a, b) => b.s - a.s);

  // Variety: at most one machine per muscle in the (up to 3) suggestions.
  const machines: Equipment[] = [];
  const usedMuscle = new Set<MuscleKey>();
  for (const x of scored) {
    if (usedMuscle.has(x.m)) continue;
    usedMuscle.add(x.m);
    machines.push(x.e);
    if (machines.length >= 3) break;
  }

  // Note copy — honest, per-MuscleKey.
  const trained = (Object.entries(today) as [MuscleKey, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  let note: string;
  if (trained.length === 0) {
    note = "Belum ada latihan hari ini. Mulai dari mesin favoritmu.";
  } else {
    const hit = MUSCLE_LABEL[trained[0][0]];
    const suggestLabels = Array.from(
      new Set(machines.map((e) => MUSCLE_LABEL[exerciseDefFromEquipment(e).primary[0]]))
    ).filter((l) => l !== hit);
    const alt = suggestLabels.slice(0, 2).join(" atau ");
    note = alt
      ? `${cap(hit)} sudah kena hari ini. Coba ${alt}, maksimal 1-2 mesin lagi.`
      : `${cap(hit)} sudah kena hari ini. Santai saja, maksimal 1-2 mesin lagi.`;
  }

  return { machines, note };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
