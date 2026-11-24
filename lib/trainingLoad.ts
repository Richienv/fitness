// Which muscles got how many sets, and which training week a date belongs to.
// Pure: no storage, no React, so node can test it. The browser side that reads
// the workout store is lib/todayVolume.ts (the same split as burn.ts and
// burnData.ts).
//
// A logged exercise is resolved the way lib/burnData.ts workoutBurn does it:
// by its position in the session definition first, then by name. A swapped
// exercise (log.swappedTo) counts for the muscle of the exercise it was
// swapped to, a skipped exercise counts for nothing, and only sets with at
// least one rep count.
import type { MuscleKey } from "./muscles";

export type MuscleLoad = Partial<Record<MuscleKey, number>>;

/** The six groups Latihan shows its bars and muscle chips for. */
export type MuscleBarGroup = "chest" | "back" | "shoulders" | "arms" | "legs" | "abs";

export const BAR_GROUPS: { key: MuscleBarGroup; label: string }[] = [
  { key: "chest", label: "Dada" },
  { key: "back", label: "Punggung" },
  { key: "shoulders", label: "Bahu" },
  { key: "arms", label: "Lengan" },
  { key: "legs", label: "Kaki" },
  { key: "abs", label: "Perut" },
];

/** Unlike MUSCLE_TO_GROUP (a colour palette that shares chest's colour with the
 *  front delt), shoulder presses and front raises belong to "Bahu" here. */
export const MUSCLE_BAR_GROUP: Record<MuscleKey, MuscleBarGroup> = {
  chest: "chest",
  frontDelt: "shoulders",
  sideDelt: "shoulders",
  rearDelt: "shoulders",
  tricep: "arms",
  bicep: "arms",
  lats: "back",
  midBack: "back",
  traps: "back",
  quad: "legs",
  hamstring: "legs",
  glute: "legs",
  calf: "legs",
  abs: "abs",
};

/** "BESARIN DADA" becomes "Besarin dada". */
export function sentenceCase(s: string): string {
  const lower = s.toLocaleLowerCase("id-ID");
  return lower.charAt(0).toLocaleUpperCase("id-ID") + lower.slice(1);
}

/** "2026-11-17" becomes "17 Nov", from the key itself (no device time zone). */
export function shortDateLabel(date: string): string {
  const n = dayNumber(date);
  if (n === null) return date;
  return new Date(n * 86_400_000).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export type LoggedExercise = {
  exerciseName: string;
  sets: { reps?: number }[];
  skipped?: boolean;
  swappedTo?: string;
};
export type DefExercise = { name: string; primary?: readonly MuscleKey[] };

/** Sets that were really done: at least one rep. */
export function countedSets(sets: { reps?: number }[] | undefined): number {
  if (!Array.isArray(sets)) return 0;
  let n = 0;
  for (const s of sets) if (Number(s?.reps) > 0) n++;
  return n;
}

/** The definition a logged exercise belongs to: the one at its position when
 *  the name agrees, else the one with its name, else the one at its position.
 *  Position first because a session can list the same name twice; the name
 *  check catches the rare list whose order drifted (a machine appended to a
 *  quick session that already had extra exercises). */
export function defForLog(
  defs: readonly DefExercise[],
  log: Pick<LoggedExercise, "exerciseName">,
  index: number,
): DefExercise | undefined {
  const atIndex = defs[index];
  if (atIndex && atIndex.name === log.exerciseName) return atIndex;
  return defs.find((d) => d.name === log.exerciseName) ?? atIndex;
}

/** The muscle one logged exercise is credited to, or undefined when unknown.
 *  `muscleOfName` answers for the swapped-to exercise (catalogue lookup); when
 *  it does not know that name, the original exercise's muscle stands, since a
 *  swap offers the same movement for the same muscle. */
export function muscleOfLog(
  defs: readonly DefExercise[],
  log: LoggedExercise,
  index: number,
  muscleOfName: (name: string) => MuscleKey | undefined,
): MuscleKey | undefined {
  const swapped = log.swappedTo ? muscleOfName(log.swappedTo) : undefined;
  return swapped ?? defForLog(defs, log, index)?.primary?.[0];
}

/** Add one workout's sets to `load`. */
export function addWorkoutLoad(
  load: MuscleLoad,
  workout: { exercises: LoggedExercise[] },
  defs: readonly DefExercise[],
  muscleOfName: (name: string) => MuscleKey | undefined,
): void {
  workout.exercises.forEach((log, i) => {
    if (!log || log.skipped) return;
    const sets = countedSets(log.sets);
    if (sets === 0) return;
    const muscle = muscleOfLog(defs, log, i, muscleOfName);
    if (muscle) load[muscle] = (load[muscle] ?? 0) + sets;
  });
}

/** Sets per bar group. */
export function groupLoad(load: MuscleLoad): Record<MuscleBarGroup, number> {
  const out: Record<MuscleBarGroup, number> = {
    chest: 0,
    back: 0,
    shoulders: 0,
    arms: 0,
    legs: 0,
    abs: 0,
  };
  for (const [muscle, n] of Object.entries(load)) {
    const group = MUSCLE_BAR_GROUP[muscle as MuscleKey];
    if (group) out[group] += n ?? 0;
  }
  return out;
}

// ---- Dates ("YYYY-MM-DD" keys, China Standard Time upstream) ----
// Everything below works on the key itself, never on the device's time zone.

/** Whole days since 1970-01-01 for a date key, or null when it is not one. */
export function dayNumber(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
}

export function dateFromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function addDaysToKey(date: string, delta: number): string | null {
  const n = dayNumber(date);
  return n === null ? null : dateFromDayNumber(n + delta);
}

/** 0 = Sunday .. 6 = Saturday, like Date.getDay(). */
export function weekdayOfKey(date: string): number | null {
  const n = dayNumber(date);
  // 1970-01-01 was a Thursday (4).
  return n === null ? null : (((n + 4) % 7) + 7) % 7;
}

/** The Monday on or before the date. */
export function mondayOfKey(date: string): string | null {
  const n = dayNumber(date);
  const wd = weekdayOfKey(date);
  if (n === null || wd === null) return null;
  return dateFromDayNumber(n - ((wd + 6) % 7));
}

/** Is `date` within the `days` days ending on `end`, both included? */
export function withinLastDays(date: string, end: string, days: number): boolean {
  const d = dayNumber(date);
  const e = dayNumber(end);
  if (d === null || e === null) return false;
  return d <= e && d >= e - (days - 1);
}

/** Is `date` in the same Monday to Sunday week as `ref`? */
export function sameWeek(date: string, ref: string): boolean {
  const a = mondayOfKey(date);
  return a !== null && a === mondayOfKey(ref);
}
