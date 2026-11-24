// The session a person builds in "Buat sesi sendiri": defaults for an added
// exercise, the stepper rules for sets, reps, weight step and rest, the
// automatic name, and the one rule for when Save is allowed. Pure, so node can
// test it; the sheet itself is app/workout/CustomSessionSheet.tsx.
import type { MuscleKey } from "./muscles";
import type { ExerciseDef } from "./workouts";
import { BAR_GROUPS, MUSCLE_BAR_GROUP, type MuscleBarGroup } from "./trainingLoad.ts";
import { MUSCLE_KEY_ID } from "./workoutLabels.ts";

export type Draft = ExerciseDef;

/** One exercise the catalogue can offer, with the values it starts at. */
export type CatalogEntry = {
  key: string;
  name: string;
  muscle: MuscleKey;
  def: ExerciseDef;
  /** A free-weight lift a beginner should not do alone. */
  coach: boolean;
};

/** An exercise from the machine catalogue starts at 3 sets of 10 with a 2,5 kg
 *  step and a minute of rest. One from a program starts with that program's
 *  own values instead (see the sheet's catalogue). */
export function defaultDef(name: string, muscle: MuscleKey): ExerciseDef {
  return {
    name,
    sets: 3,
    repsLabel: "10",
    targetReps: 10,
    increment: 2.5,
    restSec: 60,
    primary: [muscle],
    secondary: [],
  };
}

export function cloneDef(d: ExerciseDef): ExerciseDef {
  return { ...d, primary: [...d.primary], secondary: [...d.secondary] };
}

// ---- Steppers. Each returns the same object when the limit is reached, so a
// button is disabled with `bump(d, 1) === d`. ----

export const SETS_RANGE = { min: 1, max: 10 };
export const REST_RANGE = { min: 0, max: 300, step: 15 };
/** The weight steps a barbell, a stack pin or a pair of dumbbells really has. */
export const INCREMENTS = [0, 0.5, 1, 1.25, 2, 2.5, 5, 10];

export function bumpSets(d: ExerciseDef, dir: 1 | -1): ExerciseDef {
  const sets = Math.min(SETS_RANGE.max, Math.max(SETS_RANGE.min, d.sets + dir));
  return sets === d.sets ? d : { ...d, sets };
}

export function bumpRest(d: ExerciseDef, dir: 1 | -1): ExerciseDef {
  const restSec = Math.min(
    REST_RANGE.max,
    Math.max(REST_RANGE.min, d.restSec + dir * REST_RANGE.step),
  );
  return restSec === d.restSec ? d : { ...d, restSec };
}

export function bumpIncrement(d: ExerciseDef, dir: 1 | -1): ExerciseDef {
  // Start from the step nearest to the current value (a program may use one
  // that is not in the list).
  let at = 0;
  INCREMENTS.forEach((v, i) => {
    if (Math.abs(v - d.increment) < Math.abs(INCREMENTS[at] - d.increment)) at = i;
  });
  const next = Math.min(INCREMENTS.length - 1, Math.max(0, at + dir));
  const increment = INCREMENTS[next];
  return increment === d.increment ? d : { ...d, increment };
}

/** Reps move by 1, or by 5 for a time ("45s", "40 min"). The label keeps its
 *  unit ("10/side", "45s") and loses a range ("8-10" becomes "9" then "10"). */
export function bumpReps(d: ExerciseDef, dir: 1 | -1): ExerciseDef {
  const m = /^(\d+)(?:\s*[-–]\s*\d+)?(.*)$/.exec(d.repsLabel.trim());
  const tail = m ? m[2] : "";
  const timed = /^\s*(min|menit|mnt|s|dtk|detik)\b/i.test(tail);
  const from = Number.isFinite(d.targetReps) && d.targetReps > 0 ? d.targetReps : 10;
  const targetReps = Math.min(999, Math.max(1, from + dir * (timed ? 5 : 1)));
  if (targetReps === d.targetReps && d.repsLabel === `${targetReps}${tail}`) return d;
  return { ...d, targetReps, repsLabel: `${targetReps}${tail}` };
}

// ---- Words for the numbers ----

export function kgLabel(n: number): string {
  return n === 0 ? "Tanpa" : `${String(n).replace(".", ",")} kg`;
}

export function restLabel(sec: number): string {
  return sec <= 0 ? "Tanpa" : `${sec} dtk`;
}

export function summaryLine(d: ExerciseDef): string {
  const rest = d.restSec > 0 ? `istirahat ${restLabel(d.restSec)}` : "tanpa istirahat";
  return `${d.sets} set × ${d.repsLabel} · ${rest}`;
}

/** Keeps "75 dtk" and "2,5 kg" from breaking between number and unit. */
export function nbsp(s: string): string {
  return s.replace(/(\d) (?=dtk|kg|set|menit)/g, "$1\u00a0");
}

export function totalSets(drafts: readonly ExerciseDef[]): number {
  return drafts.reduce((n, d) => n + d.sets, 0);
}

// ---- Name and focus ----

const labelOf = (g: MuscleBarGroup) => BAR_GROUPS.find((x) => x.key === g)?.label ?? g;

/** Groups of the exercises in the order they first appear. */
export function groupsOfDrafts(drafts: readonly ExerciseDef[]): MuscleBarGroup[] {
  const out: MuscleBarGroup[] = [];
  for (const d of drafts) {
    const g = d.primary[0] ? MUSCLE_BAR_GROUP[d.primary[0]] : undefined;
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}

/** "Dada + Bahu": from the exercises when there are any, else from the chosen
 *  muscles, else "Sesi saya". */
export function autoSessionName(
  drafts: readonly ExerciseDef[],
  selected: readonly MuscleBarGroup[],
): string {
  const groups = drafts.length ? groupsOfDrafts(drafts) : [...selected];
  return groups.length ? groups.map(labelOf).join(" + ") : "Sesi saya";
}

export function sessionFocus(
  drafts: readonly ExerciseDef[],
  selected: readonly MuscleBarGroup[],
): string {
  const groups = drafts.length ? groupsOfDrafts(drafts) : [...selected];
  return groups.length ? groups.map(labelOf).join(" · ") : "Latihan bebas";
}

export const NAME_MAX = 60;

/** The typed name, or the automatic one when the field is empty. */
export function finalName(override: string | null, auto: string): string {
  return ((override ?? "").trim() || auto).slice(0, NAME_MAX);
}

// ---- Save ----

/** Why Save is off, in words; null when it is allowed. */
export function saveProblem(drafts: readonly ExerciseDef[]): string | null {
  return drafts.length === 0 ? "Tambahkan minimal 1 gerakan untuk menyimpan." : null;
}

export function toTemplate(
  drafts: readonly ExerciseDef[],
  selected: readonly MuscleBarGroup[],
  override: string | null,
): { name: string; focus: string; exercises: ExerciseDef[] } {
  return {
    name: finalName(override, autoSessionName(drafts, selected)),
    focus: sessionFocus(drafts, selected),
    exercises: drafts.map((d) => ({
      ...cloneDef(d),
      name: d.name.trim(),
      sets: Math.max(1, Math.round(d.sets) || 1),
      repsLabel: d.repsLabel.trim() || String(d.targetReps),
    })),
  };
}

// ---- Catalogue lists ----

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Beginners see the lifts that need a coach last, never hidden. */
function coachLast(list: CatalogEntry[], beginner: boolean): CatalogEntry[] {
  return beginner
    ? list
        .map((e, i) => ({ e, i }))
        .sort((a, b) => Number(a.e.coach) - Number(b.e.coach) || a.i - b.i)
        .map((x) => x.e)
    : list;
}

/** Exercises for the chosen muscle groups that are not in the session yet. */
export function entriesForGroups(
  catalog: readonly CatalogEntry[],
  groups: readonly MuscleBarGroup[],
  taken: ReadonlySet<string>,
  beginner: boolean,
): CatalogEntry[] {
  if (groups.length === 0) return [];
  return coachLast(
    catalog.filter(
      (c) => groups.includes(MUSCLE_BAR_GROUP[c.muscle]) && !taken.has(c.name.toLowerCase()),
    ),
    beginner,
  );
}

/** Search by name or by the muscle in Indonesian ("dada", "bisep curl"). Every
 *  word must match; names that start with the query come first. */
export function searchCatalog(
  catalog: readonly CatalogEntry[],
  query: string,
  taken: ReadonlySet<string>,
  beginner: boolean,
): CatalogEntry[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const full = words.join(" ");
  const scored: { e: CatalogEntry; rank: number; i: number }[] = [];
  catalog.forEach((e, i) => {
    if (taken.has(e.name.toLowerCase())) return;
    const name = plain(e.name);
    const hay = `${name} ${plain(MUSCLE_KEY_ID[e.muscle])} ${plain(labelOf(MUSCLE_BAR_GROUP[e.muscle]))}`;
    if (!words.every((w) => hay.includes(w))) return;
    const rank = name.startsWith(full) ? 0 : name.includes(full) ? 1 : 2;
    scored.push({ e, rank, i });
  });
  scored.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return coachLast(
    scored.map((x) => x.e),
    beginner,
  );
}
