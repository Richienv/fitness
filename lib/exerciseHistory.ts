// What was done last time for an exercise, and what to try next. Pure: the
// caller passes the workouts in, so it can be tested and used anywhere.

export type HistSet = { weight: number; reps: number };
export type HistExercise = {
  exerciseName: string;
  swappedTo?: string;
  skipped?: boolean;
  sets: HistSet[];
};
export type HistWorkout = {
  id: string;
  date: string;
  startedAt?: number;
  exercises: HistExercise[];
};

/** The exercise actually done: the swapped-to one when the logger swapped it. */
export const loggedName = (e: Pick<HistExercise, "exerciseName" | "swappedTo">) =>
  e.swappedTo ?? e.exerciseName;

export type Previous = {
  /** The last set of the latest session that did this exercise. */
  weight: number;
  reps: number;
  sets: number;
  date: string;
  /** Heaviest set ever (ties: more reps), across every earlier session. */
  best: HistSet;
};

/**
 * The latest earlier session that did `name`, plus the best set ever. The
 * session being logged right now (`excludeId`) never counts, or the "last
 * time" line would just echo the set you logged a minute ago. Sets without
 * reps and skipped exercises are not performances.
 */
export function previousPerformance(
  workouts: HistWorkout[],
  name: string,
  excludeId?: string,
): Previous | null {
  const rows: { w: HistWorkout; sets: HistSet[] }[] = [];
  for (const w of workouts) {
    if (w.id === excludeId) continue;
    for (const e of w.exercises) {
      if (e.skipped || loggedName(e) !== name) continue;
      const sets = e.sets.filter((s) => s.reps > 0);
      if (sets.length) rows.push({ w, sets });
    }
  }
  if (!rows.length) return null;
  rows.sort(
    (a, b) =>
      (b.w.startedAt ?? 0) - (a.w.startedAt ?? 0) ||
      (a.w.date < b.w.date ? 1 : a.w.date > b.w.date ? -1 : 0),
  );
  const latest = rows[0];
  const last = latest.sets[latest.sets.length - 1];
  let best: HistSet = latest.sets[0];
  for (const r of rows)
    for (const s of r.sets)
      if (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) best = s;
  return {
    weight: last.weight,
    reps: last.reps,
    sets: latest.sets.length,
    date: latest.w.date,
    best: { weight: best.weight, reps: best.reps },
  };
}

/** True when `set` beats everything before it. First time ever is not a record. */
export function isRecord(best: HistSet | null, set: HistSet): boolean {
  if (!best || set.reps <= 0) return false;
  return set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const id1 = (n: number) => String(round1(n)).replace(".", ",");

/** A sensible next try from last time (double progression): add weight once
 *  the target reps are cleared by two, add a rep once they are met, else chase
 *  the target at the same weight. */
export function suggestNext(
  prev: HistSet | null,
  target: { targetReps: number; increment: number },
): { weight: number; reps: number; note: string } | null {
  if (!prev || prev.reps <= 0) return null;
  const inc = target.increment > 0 ? target.increment : 2.5;
  if (prev.weight > 0 && prev.reps >= target.targetReps + 2)
    return {
      weight: round1(prev.weight + inc),
      reps: target.targetReps,
      note: `naik ${id1(inc)} kg`,
    };
  if (prev.reps >= target.targetReps)
    return { weight: prev.weight, reps: prev.reps + 1, note: "tambah 1 rep" };
  return { weight: prev.weight, reps: target.targetReps, note: "kejar target rep" };
}
