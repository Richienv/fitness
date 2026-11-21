// What an activity roughly burns. Pure, no storage.
//
// Every number here is an estimate and the UI says "perkiraan". It is ACTIVE
// energy, like Apple Watch reports: what the body burns on top of resting,
// because the daily target already counts resting. Timed activities use
// (MET − 1) × body weight × hours (Compendium of Physical Activities); counted
// ones use per-step and per-rep rules. See
// docs/plans/2026-11-21-latihan-clear-gym-and-burn.md.
import type { MuscleKey } from "./muscles";

export type Intensity = "santai" | "sedang" | "berat";
export type ActivityInput = "steps" | "minutes" | "reps";
export type ActivityKey =
  | "langkah"
  | "jalan"
  | "lari"
  | "sepeda"
  | "renang"
  | "plank"
  | "pushup"
  | "situp"
  | "squat"
  | "pullup"
  | "burpee";

export type ActivityKind = {
  key: ActivityKey;
  label: string;
  input: ActivityInput;
  /** The word after the number: "langkah", "menit", "kali". */
  unit: string;
  /** METs for santai / sedang / berat, for minutes-based kinds. */
  met?: [number, number, number];
  /** kcal per rep per kg, for counted kinds. */
  perRepKg?: number;
};

export const ACTIVITY_KINDS: ActivityKind[] = [
  { key: "langkah", label: "Langkah", input: "steps", unit: "langkah" },
  { key: "jalan", label: "Jalan kaki", input: "minutes", unit: "menit", met: [3.0, 3.8, 5.0] },
  { key: "lari", label: "Lari", input: "minutes", unit: "menit", met: [7.0, 9.8, 11.5] },
  { key: "sepeda", label: "Sepeda", input: "minutes", unit: "menit", met: [4.0, 6.8, 10.0] },
  { key: "renang", label: "Renang", input: "minutes", unit: "menit", met: [5.8, 8.3, 9.8] },
  { key: "plank", label: "Plank", input: "minutes", unit: "menit", met: [3.8, 3.8, 3.8] },
  { key: "pushup", label: "Push-up", input: "reps", unit: "kali", perRepKg: 0.0065 },
  { key: "situp", label: "Sit-up", input: "reps", unit: "kali", perRepKg: 0.0045 },
  { key: "squat", label: "Squat", input: "reps", unit: "kali", perRepKg: 0.0055 },
  { key: "pullup", label: "Pull-up", input: "reps", unit: "kali", perRepKg: 0.012 },
  { key: "burpee", label: "Burpee", input: "reps", unit: "kali", perRepKg: 0.015 },
];
export const ACTIVITY_BY_KEY: Record<ActivityKey, ActivityKind> = Object.fromEntries(
  ACTIVITY_KINDS.map((k) => [k.key, k]),
) as Record<ActivityKey, ActivityKind>;

/** ≈ 0.03 active kcal per step at 73 kg (0.04 gross, minus resting). */
const KCAL_PER_STEP_KG = 0.00039;
const INTENSITY_INDEX: Record<Intensity, 0 | 1 | 2> = { santai: 0, sedang: 1, berat: 2 };

const positive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** Latest logged weight, else the profile weight, else 70 kg. */
export function bodyWeightKg(
  measurements: { date: string; weightKg?: number }[],
  profileKg: number | null | undefined,
): number {
  const latest = measurements
    .filter((m) => positive(m.weightKg))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  if (latest) return latest.weightKg!;
  return positive(profileKg) ? profileKg : 70;
}

export function activityKcal(
  a: {
    kind: ActivityKey;
    steps?: number;
    minutes?: number;
    reps?: number;
    intensity?: Intensity;
  },
  kg: number,
): number {
  const k = ACTIVITY_BY_KEY[a.kind];
  if (!k || !positive(kg)) return 0;
  if (k.input === "steps") return positive(a.steps) ? a.steps * KCAL_PER_STEP_KG * kg : 0;
  if (k.input === "minutes") {
    if (!positive(a.minutes) || !k.met) return 0;
    const met = k.met[INTENSITY_INDEX[a.intensity ?? "sedang"]];
    return Math.max(0, met - 1) * kg * (a.minutes / 60);
  }
  return positive(a.reps) && k.perRepKg ? a.reps * k.perRepKg * kg : 0;
}

// One gym set: about 40 s of work at MET 6 and 75 s of rest at MET 2, less
// the resting MET of 1 for both.
const SET_KCAL_PER_KG = ((6 - 1) * 40 + (2 - 1) * 75) / 3600;
const MUSCLE_FACTOR: Partial<Record<MuscleKey, number>> = {
  quad: 1.3,
  hamstring: 1.3,
  glute: 1.3,
  chest: 1,
  lats: 1,
  midBack: 1,
  traps: 1,
  frontDelt: 0.9,
  sideDelt: 0.9,
  rearDelt: 0.9,
  bicep: 0.7,
  tricep: 0.7,
  calf: 0.7,
  abs: 0.7,
};

/** One working set, scaled by the size of the main muscle. */
export function setKcal(primary: readonly MuscleKey[], kg: number): number {
  if (!positive(kg)) return 0;
  const f = primary[0] ? (MUSCLE_FACTOR[primary[0]] ?? 1) : 1;
  return SET_KCAL_PER_KG * kg * f;
}

export type ExerciseBurn = { name: string; sets: number; kcal: number };

/** A session's estimate, per exercise. Only sets with reps count. */
export function workoutKcal(
  exercises: { name: string; primary: readonly MuscleKey[]; sets: { reps: number }[] }[],
  kg: number,
): { total: number; perExercise: ExerciseBurn[] } {
  const perExercise: ExerciseBurn[] = [];
  for (const e of exercises) {
    const sets = e.sets.filter((s) => positive(s.reps)).length;
    if (!sets) continue;
    perExercise.push({ name: e.name, sets, kcal: sets * setKcal(e.primary, kg) });
  }
  return { total: perExercise.reduce((s, e) => s + e.kcal, 0), perExercise };
}
