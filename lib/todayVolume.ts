"use client";

// Recovery/volume signal for the "HARI INI" recommendation: how many sets each
// muscle got today (and this week), read from the existing workout store — no
// new persistence. Counts at MuscleKey granularity off ExerciseDef.primary[0]
// (NEVER through MUSCLE_TO_GROUP, which would blur biceps↔triceps into "arms").
//
// Caveat: server-synced completed days store exercises:[] (mergeServerWorkouts),
// so they contribute nothing — the copy stays soft and only makes positive
// "sudah kena" claims when local set data exists.

import type { MuscleKey } from "./muscles";
import {
  getAllWorkouts,
  getDefForWorkout,
  exerciseDefFromEquipment,
} from "./workouts";
import { EQUIPMENT, type Equipment } from "./equipment";
import type { MachinePick } from "./machinePicks";
import { pickScore } from "./machinePicks";

export type MuscleLoad = Partial<Record<MuscleKey, number>>;

/** Indonesian body-part label per MuscleKey (for the HARI INI note). */
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

function addLoad(load: MuscleLoad, w: ReturnType<typeof getAllWorkouts>[number]): void {
  const def = getDefForWorkout(w);
  const byName = new Map(def.exercises.map((e) => [e.name, e]));
  for (const ex of w.exercises) {
    const m = byName.get(ex.exerciseName)?.primary?.[0];
    if (!m) continue;
    load[m] = (load[m] ?? 0) + ex.sets.length;
  }
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
  const end = Date.parse(`${date}T12:00:00`);
  if (Number.isNaN(end)) return load;
  const start = end - 6 * 86_400_000;
  for (const w of getAllWorkouts()) {
    const t = Date.parse(`${w.date}T12:00:00`);
    if (!Number.isNaN(t) && t >= start && t <= end) addLoad(load, w);
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
    note = "Belum ada latihan hari ini. Mulai dari mesin favoritmu 👇";
  } else {
    const hit = MUSCLE_LABEL[trained[0][0]];
    const suggestLabels = Array.from(
      new Set(machines.map((e) => MUSCLE_LABEL[exerciseDefFromEquipment(e).primary[0]]))
    ).filter((l) => l !== hit);
    const alt = suggestLabels.slice(0, 2).join(" atau ");
    note = alt
      ? `${cap(hit)} udah kena hari ini — coba ${alt}, maks 1-2 mesin lagi.`
      : `${cap(hit)} udah kena hari ini — santai, maks 1-2 mesin lagi.`;
  }

  return { machines, note };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
