// What an activity or resistance set burns. Pure, no storage.
//
// Every number here is an estimate and the UI says "perkiraan". It is ACTIVE
// energy, like Apple Watch reports: what the body burns on top of resting,
// because the daily target already counts resting.
//
// Timed activities use (MET - 1) * body weight * hours (Compendium of Physical
// Activities). Resistance training uses a biomechanically grounded model per
// set driven by actual exercise movement profile, external load (kg), bodyweight
// fraction moved, range of motion, muscular efficiency, active/rest metabolic
// cost scaled by intensity, and EPOC afterburn.
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
const GRAVITY = 9.80665;
const JOULES_PER_KCAL = 4184;

const positive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

const nonNegative = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

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

// ─── Biomechanical Resistance Energy Model ──────────────────────────────────

export type LoadMode =
  | "total"
  | "per_hand"
  | "bodyweight"
  | "assisted"
  | "timed_min"
  | "timed_sec"
  | "steps";

export type ExerciseProfile = {
  compound: boolean;
  unilateral: boolean;
  loadMode: LoadMode;
  /** Fraction of lifter body mass lifted/stabilized vertically per rep. */
  bwFraction: number;
  /** Effective vertical/mechanical displacement per rep in meters. */
  romM: number;
  /** Typical time under tension per rep (seconds). */
  tempoSec: number;
  /** Gross MET during active set work at reference intensity. */
  activeMet: number;
  /** Gross MET during inter-set recovery & setup. */
  restMet: number;
  /** Default rest duration when caller omits restSec. */
  defaultRestSec: number;
  /** Reference working external load as a fraction of body weight. */
  defaultRatioToBw: number;
  /** Typical plate/dumbbell increment in kg. */
  incrementKg: number;
  /** Post-exercise oxygen consumption multiplier (afterburn). */
  epocBase: number;
};

type ProfilePatch = Partial<ExerciseProfile>;

const COMPOUND_LOWER: ExerciseProfile = {
  compound: true,
  unilateral: false,
  loadMode: "total",
  bwFraction: 0.68,
  romM: 0.54,
  tempoSec: 3.3,
  activeMet: 6.8,
  restMet: 2.8,
  defaultRestSec: 90,
  defaultRatioToBw: 0.9,
  incrementKg: 5,
  epocBase: 0.1,
};

const COMPOUND_HINGE: ExerciseProfile = {
  compound: true,
  unilateral: false,
  loadMode: "total",
  bwFraction: 0.36,
  romM: 0.48,
  tempoSec: 3.3,
  activeMet: 6.5,
  restMet: 2.7,
  defaultRestSec: 90,
  defaultRatioToBw: 1.0,
  incrementKg: 5,
  epocBase: 0.1,
};

const COMPOUND_UPPER_PUSH: ExerciseProfile = {
  compound: true,
  unilateral: false,
  loadMode: "total",
  bwFraction: 0.08,
  romM: 0.4,
  tempoSec: 3.0,
  activeMet: 5.5,
  restMet: 2.4,
  defaultRestSec: 75,
  defaultRatioToBw: 0.65,
  incrementKg: 2.5,
  epocBase: 0.075,
};

const COMPOUND_UPPER_PULL: ExerciseProfile = {
  compound: true,
  unilateral: false,
  loadMode: "total",
  bwFraction: 0.1,
  romM: 0.5,
  tempoSec: 3.0,
  activeMet: 5.5,
  restMet: 2.4,
  defaultRestSec: 75,
  defaultRatioToBw: 0.65,
  incrementKg: 2.5,
  epocBase: 0.075,
};

const ISOLATION_LOWER: ExerciseProfile = {
  compound: false,
  unilateral: false,
  loadMode: "total",
  bwFraction: 0.06,
  romM: 0.34,
  tempoSec: 2.8,
  activeMet: 4.5,
  restMet: 2.1,
  defaultRestSec: 60,
  defaultRatioToBw: 0.45,
  incrementKg: 2.5,
  epocBase: 0.055,
};

const ISOLATION_UPPER: ExerciseProfile = {
  compound: false,
  unilateral: false,
  loadMode: "total",
  bwFraction: 0.03,
  romM: 0.38,
  tempoSec: 2.8,
  activeMet: 3.9,
  restMet: 2.0,
  defaultRestSec: 60,
  defaultRatioToBw: 0.28,
  incrementKg: 2.5,
  epocBase: 0.045,
};

const CORE_ISO: ExerciseProfile = {
  compound: false,
  unilateral: false,
  loadMode: "total",
  bwFraction: 0.18,
  romM: 0.28,
  tempoSec: 2.6,
  activeMet: 4.0,
  restMet: 2.0,
  defaultRestSec: 45,
  defaultRatioToBw: 0.3,
  incrementKg: 2.5,
  epocBase: 0.045,
};

const EXACT_PROFILES: Record<string, ExerciseProfile> = {
  // Lower compounds
  "squat": { ...COMPOUND_LOWER, bwFraction: 0.72, romM: 0.58, activeMet: 7.0, defaultRatioToBw: 0.95, epocBase: 0.11 },
  "barbell squat": { ...COMPOUND_LOWER, bwFraction: 0.72, romM: 0.58, activeMet: 7.0, defaultRatioToBw: 0.95, epocBase: 0.11 },
  "smith machine squat": { ...COMPOUND_LOWER, bwFraction: 0.68, romM: 0.55, activeMet: 6.4, defaultRatioToBw: 0.85, epocBase: 0.095 },
  "hack squat": { ...COMPOUND_LOWER, bwFraction: 0.55, romM: 0.52, activeMet: 6.3, defaultRatioToBw: 1.0, epocBase: 0.095 },
  "reverse hack squat": { ...COMPOUND_LOWER, bwFraction: 0.55, romM: 0.52, activeMet: 6.3, defaultRatioToBw: 1.0, epocBase: 0.095 },
  "goblet squat": { ...COMPOUND_LOWER, bwFraction: 0.7, romM: 0.56, activeMet: 6.3, defaultRatioToBw: 0.32, incrementKg: 2.5, epocBase: 0.09 },
  "sumo goblet squat": { ...COMPOUND_LOWER, bwFraction: 0.68, romM: 0.52, activeMet: 6.2, defaultRatioToBw: 0.3, incrementKg: 2.5, epocBase: 0.085 },
  "leg press": { ...COMPOUND_LOWER, bwFraction: 0.16, romM: 0.42, activeMet: 6.0, defaultRatioToBw: 1.65, epocBase: 0.09 },
  "power leg press": { ...COMPOUND_LOWER, bwFraction: 0.16, romM: 0.42, activeMet: 6.0, defaultRatioToBw: 1.65, epocBase: 0.09 },
  "bulgarian split squat": { ...COMPOUND_LOWER, unilateral: true, loadMode: "per_hand", bwFraction: 0.76, romM: 0.48, activeMet: 6.6, defaultRatioToBw: 0.16, incrementKg: 2, epocBase: 0.1 },
  "walking lunge": { ...COMPOUND_LOWER, unilateral: true, loadMode: "per_hand", bwFraction: 0.78, romM: 0.45, activeMet: 6.7, defaultRatioToBw: 0.15, incrementKg: 2, epocBase: 0.1 },

  // Hinge / glutes
  "deadlift": { ...COMPOUND_HINGE, bwFraction: 0.38, romM: 0.5, activeMet: 7.1, defaultRatioToBw: 1.25, epocBase: 0.11 },
  "trap bar deadlift": { ...COMPOUND_HINGE, bwFraction: 0.42, romM: 0.48, activeMet: 7.0, defaultRatioToBw: 1.25, epocBase: 0.11 },
  "sumo deadlift": { ...COMPOUND_HINGE, bwFraction: 0.38, romM: 0.42, activeMet: 6.9, defaultRatioToBw: 1.25, epocBase: 0.105 },
  "romanian deadlift": { ...COMPOUND_HINGE, bwFraction: 0.34, romM: 0.48, activeMet: 6.3, defaultRatioToBw: 0.9, epocBase: 0.095 },
  "single leg rdl": { ...COMPOUND_HINGE, unilateral: true, loadMode: "per_hand", bwFraction: 0.4, romM: 0.46, activeMet: 5.8, defaultRatioToBw: 0.16, incrementKg: 2, epocBase: 0.085 },
  "hip thrust": { ...COMPOUND_HINGE, bwFraction: 0.25, romM: 0.3, activeMet: 5.9, defaultRatioToBw: 1.25, epocBase: 0.09 },
  "hip thrust (light)": { ...COMPOUND_HINGE, bwFraction: 0.25, romM: 0.3, activeMet: 5.4, defaultRatioToBw: 0.85, epocBase: 0.08 },
  "back extension": { ...COMPOUND_HINGE, loadMode: "bodyweight", bwFraction: 0.45, romM: 0.38, activeMet: 4.8, defaultRatioToBw: 0, incrementKg: 2.5, epocBase: 0.06 },
  "back extension machine": { ...ISOLATION_LOWER, bwFraction: 0.22, romM: 0.35, activeMet: 4.6, defaultRatioToBw: 0.5, epocBase: 0.055 },
  "hyperextension bench": { ...COMPOUND_HINGE, loadMode: "bodyweight", bwFraction: 0.45, romM: 0.38, activeMet: 4.8, defaultRatioToBw: 0, incrementKg: 2.5, epocBase: 0.06 },

  // Lower isolations
  "leg curl": { ...ISOLATION_LOWER, bwFraction: 0.06, romM: 0.36, activeMet: 4.4, defaultRatioToBw: 0.48, epocBase: 0.05 },
  "seated leg curl": { ...ISOLATION_LOWER, bwFraction: 0.06, romM: 0.36, activeMet: 4.4, defaultRatioToBw: 0.48, epocBase: 0.05 },
  "lying leg curl": { ...ISOLATION_LOWER, bwFraction: 0.06, romM: 0.36, activeMet: 4.4, defaultRatioToBw: 0.45, epocBase: 0.05 },
  "leg extension": { ...ISOLATION_LOWER, bwFraction: 0.06, romM: 0.38, activeMet: 4.5, defaultRatioToBw: 0.55, epocBase: 0.055 },
  "calf raise": { ...ISOLATION_LOWER, bwFraction: 0.5, romM: 0.12, tempoSec: 2.2, activeMet: 4.0, defaultRestSec: 45, defaultRatioToBw: 0.65, epocBase: 0.045 },
  "calf raise machine": { ...ISOLATION_LOWER, bwFraction: 0.2, romM: 0.12, tempoSec: 2.2, activeMet: 4.0, defaultRestSec: 45, defaultRatioToBw: 0.7, epocBase: 0.045 },
  "cable kickback": { ...ISOLATION_LOWER, unilateral: true, bwFraction: 0.08, romM: 0.4, activeMet: 4.3, defaultRatioToBw: 0.22, epocBase: 0.05 },
  "glute kickback / rear kick": { ...ISOLATION_LOWER, unilateral: true, bwFraction: 0.08, romM: 0.38, activeMet: 4.4, defaultRatioToBw: 0.4, epocBase: 0.05 },
  "hip abduction": { ...ISOLATION_LOWER, bwFraction: 0.05, romM: 0.26, activeMet: 4.0, defaultRestSec: 45, defaultRatioToBw: 0.55, epocBase: 0.045 },
  "hip abductor (outer thigh)": { ...ISOLATION_LOWER, bwFraction: 0.05, romM: 0.26, activeMet: 4.0, defaultRestSec: 45, defaultRatioToBw: 0.55, epocBase: 0.045 },
  "hip adductor (inner thigh)": { ...ISOLATION_LOWER, bwFraction: 0.05, romM: 0.26, activeMet: 4.0, defaultRestSec: 45, defaultRatioToBw: 0.55, epocBase: 0.045 },

  // Upper push
  "bench press": { ...COMPOUND_UPPER_PUSH, bwFraction: 0.08, romM: 0.38, activeMet: 5.6, defaultRatioToBw: 0.75, epocBase: 0.08 },
  "flat bench press": { ...COMPOUND_UPPER_PUSH, bwFraction: 0.08, romM: 0.38, activeMet: 5.6, defaultRatioToBw: 0.75, epocBase: 0.08 },
  "chest press machine": { ...COMPOUND_UPPER_PUSH, bwFraction: 0.05, romM: 0.36, activeMet: 5.1, defaultRatioToBw: 0.7, epocBase: 0.07 },
  "incline chest press machine": { ...COMPOUND_UPPER_PUSH, bwFraction: 0.05, romM: 0.36, activeMet: 5.1, defaultRatioToBw: 0.65, epocBase: 0.07 },
  "incline db press": { ...COMPOUND_UPPER_PUSH, loadMode: "per_hand", bwFraction: 0.07, romM: 0.38, activeMet: 5.4, defaultRatioToBw: 0.28, epocBase: 0.075 },
  "incline dumbbell press": { ...COMPOUND_UPPER_PUSH, loadMode: "per_hand", bwFraction: 0.07, romM: 0.38, activeMet: 5.4, defaultRatioToBw: 0.28, epocBase: 0.075 },
  "ohp": { ...COMPOUND_UPPER_PUSH, bwFraction: 0.14, romM: 0.52, activeMet: 5.7, defaultRatioToBw: 0.5, epocBase: 0.08 },
  "seated db press": { ...COMPOUND_UPPER_PUSH, loadMode: "per_hand", bwFraction: 0.08, romM: 0.46, activeMet: 5.3, defaultRatioToBw: 0.22, epocBase: 0.075 },
  "db shoulder press": { ...COMPOUND_UPPER_PUSH, loadMode: "per_hand", bwFraction: 0.08, romM: 0.46, activeMet: 5.3, defaultRatioToBw: 0.2, epocBase: 0.075 },
  "shoulder press machine": { ...COMPOUND_UPPER_PUSH, bwFraction: 0.05, romM: 0.44, activeMet: 4.9, defaultRatioToBw: 0.48, epocBase: 0.065 },
  "dips": { ...COMPOUND_UPPER_PUSH, loadMode: "bodyweight", bwFraction: 0.94, romM: 0.38, activeMet: 6.2, defaultRatioToBw: 0, epocBase: 0.085 },
  "push ups": { ...COMPOUND_UPPER_PUSH, loadMode: "bodyweight", bwFraction: 0.66, romM: 0.36, activeMet: 5.4, defaultRatioToBw: 0, incrementKg: 2.5, epocBase: 0.07 },
  "pec deck": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.42, activeMet: 4.1, defaultRatioToBw: 0.5, epocBase: 0.045 },
  "pec deck / butterfly": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.42, activeMet: 4.1, defaultRatioToBw: 0.5, epocBase: 0.045 },
  "cable chest fly": { ...ISOLATION_UPPER, bwFraction: 0.06, romM: 0.45, activeMet: 4.2, defaultRatioToBw: 0.3, epocBase: 0.045 },

  // Upper pull
  "lat pulldown": { ...COMPOUND_UPPER_PULL, bwFraction: 0.07, romM: 0.54, activeMet: 5.4, defaultRatioToBw: 0.72, epocBase: 0.075 },
  "lat pulldown machine": { ...COMPOUND_UPPER_PULL, bwFraction: 0.07, romM: 0.54, activeMet: 5.4, defaultRatioToBw: 0.72, epocBase: 0.075 },
  "cable lat pulldown": { ...COMPOUND_UPPER_PULL, bwFraction: 0.07, romM: 0.54, activeMet: 5.4, defaultRatioToBw: 0.72, epocBase: 0.075 },
  "wide grip pulldown": { ...COMPOUND_UPPER_PULL, bwFraction: 0.07, romM: 0.54, activeMet: 5.4, defaultRatioToBw: 0.7, epocBase: 0.075 },
  "pull ups": { ...COMPOUND_UPPER_PULL, loadMode: "bodyweight", bwFraction: 0.96, romM: 0.55, activeMet: 6.8, defaultRatioToBw: 0, epocBase: 0.09 },
  "pull ups / chin ups": { ...COMPOUND_UPPER_PULL, loadMode: "bodyweight", bwFraction: 0.96, romM: 0.55, activeMet: 6.8, defaultRatioToBw: 0, epocBase: 0.09 },
  "pull-up (assisted)": { ...COMPOUND_UPPER_PULL, loadMode: "assisted", bwFraction: 0.95, romM: 0.54, activeMet: 5.8, defaultRatioToBw: 0.25, epocBase: 0.075 },
  "assisted pull-up machine": { ...COMPOUND_UPPER_PULL, loadMode: "assisted", bwFraction: 0.95, romM: 0.54, activeMet: 5.8, defaultRatioToBw: 0.25, epocBase: 0.075 },
  "cable row": { ...COMPOUND_UPPER_PULL, bwFraction: 0.08, romM: 0.44, activeMet: 5.3, defaultRatioToBw: 0.68, epocBase: 0.075 },
  "cable seated row": { ...COMPOUND_UPPER_PULL, bwFraction: 0.08, romM: 0.44, activeMet: 5.3, defaultRatioToBw: 0.68, epocBase: 0.075 },
  "cable row wide": { ...COMPOUND_UPPER_PULL, bwFraction: 0.08, romM: 0.44, activeMet: 5.3, defaultRatioToBw: 0.65, epocBase: 0.075 },
  "seated row": { ...COMPOUND_UPPER_PULL, bwFraction: 0.06, romM: 0.42, activeMet: 5.2, defaultRatioToBw: 0.65, epocBase: 0.07 },
  "seated row machine": { ...COMPOUND_UPPER_PULL, bwFraction: 0.06, romM: 0.42, activeMet: 5.2, defaultRatioToBw: 0.68, epocBase: 0.07 },
  "t-bar row": { ...COMPOUND_UPPER_PULL, bwFraction: 0.16, romM: 0.44, activeMet: 6.0, defaultRatioToBw: 0.72, epocBase: 0.085 },
  "db row": { ...COMPOUND_UPPER_PULL, unilateral: true, bwFraction: 0.1, romM: 0.44, activeMet: 5.6, defaultRatioToBw: 0.3, epocBase: 0.08 },
  "barbell row": { ...COMPOUND_UPPER_PULL, bwFraction: 0.18, romM: 0.44, activeMet: 6.1, defaultRatioToBw: 0.75, epocBase: 0.085 },

  // Shoulders & Arms isolation
  "lateral raise": { ...ISOLATION_UPPER, loadMode: "per_hand", bwFraction: 0.04, romM: 0.5, activeMet: 3.9, defaultRatioToBw: 0.1, incrementKg: 1, epocBase: 0.045 },
  "dumbbell lateral raise": { ...ISOLATION_UPPER, loadMode: "per_hand", bwFraction: 0.04, romM: 0.5, activeMet: 3.9, defaultRatioToBw: 0.1, incrementKg: 1, epocBase: 0.045 },
  "db lateral raise": { ...ISOLATION_UPPER, loadMode: "per_hand", bwFraction: 0.04, romM: 0.5, activeMet: 3.9, defaultRatioToBw: 0.1, incrementKg: 1, epocBase: 0.045 },
  "lateral raise burnout": { ...ISOLATION_UPPER, loadMode: "per_hand", bwFraction: 0.04, romM: 0.45, tempoSec: 2.2, activeMet: 4.1, defaultRestSec: 45, defaultRatioToBw: 0.08, incrementKg: 1, epocBase: 0.05 },
  "cable lateral raise": { ...ISOLATION_UPPER, unilateral: true, bwFraction: 0.04, romM: 0.52, activeMet: 4.0, defaultRatioToBw: 0.1, incrementKg: 1, epocBase: 0.045 },
  "lateral raise machine": { ...ISOLATION_UPPER, bwFraction: 0.02, romM: 0.44, activeMet: 3.8, defaultRatioToBw: 0.32, incrementKg: 2.5, epocBase: 0.04 },
  "face pull": { ...ISOLATION_UPPER, bwFraction: 0.05, romM: 0.42, activeMet: 4.0, defaultRatioToBw: 0.28, incrementKg: 1, epocBase: 0.045 },
  "cable face pull": { ...ISOLATION_UPPER, bwFraction: 0.05, romM: 0.42, activeMet: 4.0, defaultRatioToBw: 0.28, incrementKg: 1, epocBase: 0.045 },
  "rear delt fly machine": { ...ISOLATION_UPPER, bwFraction: 0.02, romM: 0.4, activeMet: 3.8, defaultRatioToBw: 0.38, epocBase: 0.04 },
  "barbell curl": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.4, activeMet: 3.9, defaultRatioToBw: 0.3, incrementKg: 2.5, epocBase: 0.045 },
  "ez bar curl": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.4, activeMet: 3.9, defaultRatioToBw: 0.3, incrementKg: 2.5, epocBase: 0.045 },
  "bicep curl": { ...ISOLATION_UPPER, loadMode: "per_hand", bwFraction: 0.03, romM: 0.4, activeMet: 3.8, defaultRatioToBw: 0.13, incrementKg: 1, epocBase: 0.045 },
  "db bicep curl": { ...ISOLATION_UPPER, loadMode: "per_hand", bwFraction: 0.03, romM: 0.4, activeMet: 3.8, defaultRatioToBw: 0.13, incrementKg: 1, epocBase: 0.045 },
  "dumbbell bicep curl": { ...ISOLATION_UPPER, loadMode: "per_hand", bwFraction: 0.03, romM: 0.4, activeMet: 3.8, defaultRatioToBw: 0.13, incrementKg: 1, epocBase: 0.045 },
  "hammer curl": { ...ISOLATION_UPPER, loadMode: "per_hand", bwFraction: 0.03, romM: 0.4, activeMet: 3.9, defaultRatioToBw: 0.15, incrementKg: 1, epocBase: 0.045 },
  "incline curl": { ...ISOLATION_UPPER, loadMode: "per_hand", bwFraction: 0.02, romM: 0.42, activeMet: 3.8, defaultRatioToBw: 0.12, incrementKg: 1, epocBase: 0.045 },
  "cable bicep curl": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.4, activeMet: 3.8, defaultRatioToBw: 0.28, incrementKg: 2.5, epocBase: 0.045 },
  "cable hammer curl": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.4, activeMet: 3.8, defaultRatioToBw: 0.28, incrementKg: 2.5, epocBase: 0.045 },
  "preacher curl machine": { ...ISOLATION_UPPER, bwFraction: 0.01, romM: 0.36, activeMet: 3.7, defaultRatioToBw: 0.32, incrementKg: 2.5, epocBase: 0.04 },
  "tricep pushdown": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.38, activeMet: 3.8, defaultRatioToBw: 0.34, incrementKg: 2.5, epocBase: 0.045 },
  "tricep pushdown machine": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.38, activeMet: 3.8, defaultRatioToBw: 0.34, incrementKg: 2.5, epocBase: 0.045 },
  "tricep rope pushdown": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.38, activeMet: 3.8, defaultRatioToBw: 0.3, incrementKg: 2.5, epocBase: 0.045 },
  "overhead tricep extension": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.4, activeMet: 3.9, defaultRatioToBw: 0.3, incrementKg: 2.5, epocBase: 0.045 },
  "tricep dip machine": { ...ISOLATION_UPPER, bwFraction: 0.03, romM: 0.36, activeMet: 4.1, defaultRatioToBw: 0.55, incrementKg: 2.5, epocBase: 0.05 },
  "skull crusher": { ...ISOLATION_UPPER, bwFraction: 0.02, romM: 0.38, activeMet: 3.9, defaultRatioToBw: 0.32, incrementKg: 2.5, epocBase: 0.045 },

  // Core & timed cardio blocks inside workouts
  "cable crunch": { ...CORE_ISO, bwFraction: 0.14, romM: 0.32, activeMet: 4.1, defaultRatioToBw: 0.42, epocBase: 0.045 },
  "ab crunch machine": { ...CORE_ISO, bwFraction: 0.1, romM: 0.28, activeMet: 3.9, defaultRatioToBw: 0.45, epocBase: 0.04 },
  "roman chair sit-up": { ...CORE_ISO, loadMode: "bodyweight", bwFraction: 0.42, romM: 0.4, activeMet: 4.4, defaultRatioToBw: 0, incrementKg: 2.5, epocBase: 0.05 },
  "captain's chair leg raise": { ...CORE_ISO, loadMode: "bodyweight", bwFraction: 0.35, romM: 0.45, activeMet: 4.5, defaultRatioToBw: 0, incrementKg: 1, epocBase: 0.05 },
  "plank": { ...CORE_ISO, loadMode: "timed_sec", bwFraction: 0.65, romM: 0, tempoSec: 1, activeMet: 3.8, restMet: 1.5, defaultRestSec: 45, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0.03 },
  "incline treadmill walk": { ...COMPOUND_LOWER, loadMode: "timed_min", bwFraction: 1, romM: 0, tempoSec: 60, activeMet: 6.2, restMet: 1, defaultRestSec: 0, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0.04 },
  "stairmaster": { ...COMPOUND_LOWER, loadMode: "timed_min", bwFraction: 1, romM: 0, tempoSec: 60, activeMet: 8.5, restMet: 1, defaultRestSec: 0, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0.05 },
  "stair climber": { ...COMPOUND_LOWER, loadMode: "timed_min", bwFraction: 1, romM: 0, tempoSec: 60, activeMet: 8.5, restMet: 1, defaultRestSec: 0, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0.05 },
  "treadmill": { ...COMPOUND_LOWER, loadMode: "timed_min", bwFraction: 1, romM: 0, tempoSec: 60, activeMet: 7.5, restMet: 1, defaultRestSec: 0, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0.04 },
  "stationary bike": { ...COMPOUND_LOWER, loadMode: "timed_min", bwFraction: 1, romM: 0, tempoSec: 60, activeMet: 6.8, restMet: 1, defaultRestSec: 0, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0.04 },
  "rowing machine": { ...COMPOUND_LOWER, loadMode: "timed_min", bwFraction: 1, romM: 0, tempoSec: 60, activeMet: 7.4, restMet: 1, defaultRestSec: 0, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0.05 },
  "elliptical": { ...COMPOUND_LOWER, loadMode: "timed_min", bwFraction: 1, romM: 0, tempoSec: 60, activeMet: 6.5, restMet: 1, defaultRestSec: 0, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0.04 },
  "walk (8–10k steps)": { ...COMPOUND_LOWER, loadMode: "steps", bwFraction: 1, romM: 0, tempoSec: 1, activeMet: 3.5, restMet: 1, defaultRestSec: 0, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0 },
};

function mergePatch(base: ExerciseProfile, patch: ProfilePatch): ExerciseProfile {
  return { ...base, ...patch };
}

function baseProfileForMuscle(primary: readonly MuscleKey[]): ExerciseProfile {
  const m = primary[0];
  if (m === "quad" || m === "glute") return COMPOUND_LOWER;
  if (m === "hamstring") return COMPOUND_HINGE;
  if (m === "calf") return EXACT_PROFILES["calf raise"];
  if (m === "chest") return COMPOUND_UPPER_PUSH;
  if (m === "lats" || m === "midBack" || m === "traps") return COMPOUND_UPPER_PULL;
  if (m === "frontDelt") return { ...COMPOUND_UPPER_PUSH, defaultRatioToBw: 0.42 };
  if (m === "sideDelt" || m === "rearDelt" || m === "bicep" || m === "tricep") return ISOLATION_UPPER;
  if (m === "abs") return CORE_ISO;
  return COMPOUND_UPPER_PUSH;
}

/** Resolve the biomechanical profile for any exercise name + optional muscles. */
export function getExerciseProfile(
  name: string,
  primary: readonly MuscleKey[] = [],
): ExerciseProfile {
  const key = name.trim().toLowerCase();
  if (key && EXACT_PROFILES[key]) return EXACT_PROFILES[key];

  const base = baseProfileForMuscle(primary);
  const patch: ProfilePatch = {};

  if (/\b(treadmill|elliptical|bike|cycling|stair|rowing machine)\b/.test(key)) {
    return { ...COMPOUND_LOWER, loadMode: "timed_min", activeMet: 7.0, restMet: 1, defaultRestSec: 0, defaultRatioToBw: 0, incrementKg: 0, epocBase: 0.04 };
  }
  if (/\bwalk\b.*step/.test(key)) {
    return EXACT_PROFILES["walk (8–10k steps)"];
  }
  if (/\bplank\b/.test(key)) {
    return EXACT_PROFILES["plank"];
  }
  if (/\bassisted\b/.test(key)) {
    patch.loadMode = "assisted";
    patch.bwFraction = 0.92;
  } else if (/\b(push.?up|pull.?up|chin.?up|dip|inverted row|trx)\b/.test(key)) {
    patch.loadMode = "bodyweight";
    patch.bwFraction = /push.?up/.test(key) ? 0.66 : 0.94;
    patch.defaultRatioToBw = 0;
  } else if (/\b(db|dumbbell)\b/.test(key) && !/\b(single|one.?arm|concentration|goblet)\b/.test(key)) {
    patch.loadMode = "per_hand";
    patch.defaultRatioToBw = Math.min(0.32, base.defaultRatioToBw * 0.45);
    patch.incrementKg = 2;
  }

  if (/\b(single|one.?arm|split|lunge|kickback|unilateral|kroc|meadows)\b/.test(key)) {
    patch.unilateral = true;
  }
  if (/\b(curl|extension|raise|fly|flye|pec deck|kickback|abduct|adduct|crunch|calf)\b/.test(key)) {
    patch.compound = false;
    patch.activeMet = Math.min(base.activeMet, 4.3);
    patch.epocBase = 0.048;
  }
  if (/\b(squat|deadlift|rdl|thrust|lunge)\b/.test(key)) {
    patch.compound = true;
    patch.activeMet = Math.max(base.activeMet, 6.2);
    patch.epocBase = 0.095;
  }

  return mergePatch(base, patch);
}

/** Realistic starting weight (kg) when an exercise has no prior history yet. */
export function defaultWorkingWeightKg(
  name: string,
  bodyKg = 70,
  primary: readonly MuscleKey[] = [],
  sex?: "male" | "female" | null,
): number {
  const kg = positive(bodyKg) ? bodyKg : 70;
  const p = getExerciseProfile(name, primary);
  if (p.loadMode === "bodyweight" || p.loadMode === "timed_min" || p.loadMode === "timed_sec" || p.loadMode === "steps") {
    return 0;
  }
  const sexScale = sex === "female" ? 0.68 : 1;
  const raw = kg * p.defaultRatioToBw * sexScale;
  const step = p.incrementKg > 0 ? p.incrementKg : 2.5;
  const rounded = Math.max(step, Math.round(raw / step) * step);
  return Math.round(rounded * 10) / 10;
}

/** Epley estimated 1-rep maximum (kg). */
export function estimated1RM(weightKg: number, reps: number): number {
  if (!positive(weightKg) || !positive(reps)) return 0;
  if (reps <= 1) return Math.round(weightKg * 10) / 10;
  const e1rm = weightKg * (1 + Math.min(reps, 30) / 30);
  return Math.round(e1rm * 10) / 10;
}

export type SetBurnDetails = {
  kcal: number;
  mechanicalKcal: number;
  metabolicKcal: number;
  epocKcal: number;
  tonnageKg: number;
  effectiveLoadKg: number;
};

/**
 * Compute active energy and mechanical/metabolic breakdown for ONE set.
 * When `weight` is omitted (`undefined`), the profile's realistic working weight
 * is used (for planned sessions / legacy callers). When `weight` is a number
 * (`>= 0`), that exact weight drives mechanical work, intensity scaling, and EPOC.
 */
export function setBurnDetails(args: {
  name?: string;
  primary?: readonly MuscleKey[];
  secondary?: readonly MuscleKey[];
  weight?: number;
  reps: number;
  restSec?: number;
  bodyKg: number;
}): SetBurnDetails {
  const { bodyKg, reps } = args;
  if (!positive(bodyKg) || !positive(reps)) {
    return { kcal: 0, mechanicalKcal: 0, metabolicKcal: 0, epocKcal: 0, tonnageKg: 0, effectiveLoadKg: 0 };
  }
  const primary = args.primary ?? [];
  const profile = getExerciseProfile(args.name ?? "", primary);

  if (profile.loadMode === "steps") {
    const kcal = reps * KCAL_PER_STEP_KG * bodyKg;
    return { kcal, mechanicalKcal: 0, metabolicKcal: kcal, epocKcal: 0, tonnageKg: 0, effectiveLoadKg: bodyKg };
  }
  if (profile.loadMode === "timed_min") {
    const netMet = Math.max(0.5, profile.activeMet - 1);
    const base = netMet * bodyKg * (reps / 60);
    const epocKcal = base * profile.epocBase;
    return { kcal: base + epocKcal, mechanicalKcal: 0, metabolicKcal: base, epocKcal, tonnageKg: 0, effectiveLoadKg: bodyKg };
  }
  if (profile.loadMode === "timed_sec") {
    const netMet = Math.max(0.5, profile.activeMet - 1);
    const base = netMet * bodyKg * (reps / 3600);
    const epocKcal = base * profile.epocBase;
    return { kcal: base + epocKcal, mechanicalKcal: 0, metabolicKcal: base, epocKcal, tonnageKg: 0, effectiveLoadKg: bodyKg };
  }

  const refExternal = defaultWorkingWeightKg(args.name ?? "", bodyKg, primary);
  const rawWeight = nonNegative(args.weight) ? args.weight : refExternal;
  const sides = profile.unilateral ? 2 : 1;
  const effectiveReps = Math.min(100, reps) * sides;

  let externalMovedKg = rawWeight;
  let bodyMovedKg = profile.bwFraction * bodyKg;
  if (profile.loadMode === "per_hand") {
    externalMovedKg = rawWeight * 2;
  } else if (profile.loadMode === "assisted") {
    externalMovedKg = 0;
    bodyMovedKg = Math.max(10, profile.bwFraction * bodyKg - rawWeight);
  }

  const totalMovedKg = externalMovedKg + bodyMovedKg;
  const tonnageKg =
    profile.loadMode === "assisted"
      ? bodyMovedKg * effectiveReps
      : externalMovedKg * effectiveReps;

  // 1. External + bodyweight mechanical work converted via muscular efficiency
  //    (eta ≈ 21.5% compounds, 23.5% isolations) + eccentric cost (+35%).
  const workJoules = totalMovedKg * GRAVITY * profile.romM * effectiveReps;
  const eta = profile.compound ? 0.215 : 0.235;
  const mechanicalKcal = (workJoules * 1.35) / (eta * JOULES_PER_KCAL);

  // 2. Systemic metabolic cost during work (TUT) & active recovery rest.
  const refTotalMoved = Math.max(
    18,
    (profile.loadMode === "per_hand" ? refExternal * 2 : profile.loadMode === "assisted" ? bodyKg * 0.7 : refExternal) +
      profile.bwFraction * bodyKg,
  );
  const loadRatio = totalMovedKg / refTotalMoved;
  const repScale = 0.8 + 0.02 * Math.min(20, reps);
  const secondaryBonus = 1 + Math.min(2, args.secondary?.length ?? 0) * 0.03;
  const intensityFactor = Math.min(1.85, Math.max(0.65, Math.pow(loadRatio, 0.72) * repScale * secondaryBonus));

  const tutSec = Math.min(120, effectiveReps * profile.tempoSec);
  const restSec = Math.min(120, Math.max(25, args.restSec ?? profile.defaultRestSec));
  // Rest recovery scales slightly with set strain, never letting zero-load rest inflate burn.
  const activeNetMet = Math.max(1.2, profile.activeMet * intensityFactor - 1);
  const restNetMet = Math.max(0.6, profile.restMet * (0.78 + 0.22 * intensityFactor) - 1);
  const metabolicKcal =
    bodyKg * (activeNetMet * (tutSec / 3600) + restNetMet * (restSec / 3600));

  // 3. EPOC afterburn scaled by compound recruitment & intensity.
  const epocKcal =
    (mechanicalKcal + metabolicKcal) * profile.epocBase * (0.75 + 0.35 * intensityFactor);

  return {
    kcal: mechanicalKcal + metabolicKcal + epocKcal,
    mechanicalKcal,
    metabolicKcal,
    epocKcal,
    tonnageKg,
    effectiveLoadKg: totalMovedKg,
  };
}

/** Baseline working set cost by primary muscle (legacy & quick-reference API). */
export function setKcal(primary: readonly MuscleKey[], kg: number): number {
  if (!positive(kg)) return 0;
  return setBurnDetails({ primary, reps: 10, bodyKg: kg }).kcal;
}

export type ExerciseBurn = {
  name: string;
  sets: number;
  kcal: number;
  mechanicalKcal: number;
  metabolicKcal: number;
  epocKcal: number;
  tonnageKg: number;
  isCompound: boolean;
};

export type WorkoutBurnBreakdown = {
  mechanicalKcal: number;
  metabolicKcal: number;
  epocKcal: number;
  tonnageKg: number;
};

/** A session's estimate, per exercise, driven by actual weight, reps, sets & biomechanics. */
export function workoutKcal(
  exercises: {
    name: string;
    primary: readonly MuscleKey[];
    secondary?: readonly MuscleKey[];
    restSec?: number;
    sets: { reps: number; weight?: number }[];
  }[],
  kg: number,
): { total: number; perExercise: ExerciseBurn[]; breakdown: WorkoutBurnBreakdown } {
  const perExercise: ExerciseBurn[] = [];
  let totalMech = 0;
  let totalMeta = 0;
  let totalEpoc = 0;
  let totalTonnage = 0;

  for (const e of exercises) {
    const validSets = e.sets.filter((s) => positive(s.reps));
    if (!validSets.length) continue;
    const profile = getExerciseProfile(e.name, e.primary);
    let kcal = 0;
    let mechanicalKcal = 0;
    let metabolicKcal = 0;
    let epocKcal = 0;
    let tonnageKg = 0;

    for (const s of validSets) {
      const d = setBurnDetails({
        name: e.name,
        primary: e.primary,
        secondary: e.secondary,
        weight: s.weight,
        reps: s.reps,
        restSec: e.restSec,
        bodyKg: kg,
      });
      kcal += d.kcal;
      mechanicalKcal += d.mechanicalKcal;
      metabolicKcal += d.metabolicKcal;
      epocKcal += d.epocKcal;
      tonnageKg += d.tonnageKg;
    }

    totalMech += mechanicalKcal;
    totalMeta += metabolicKcal;
    totalEpoc += epocKcal;
    totalTonnage += tonnageKg;
    perExercise.push({
      name: e.name,
      sets: validSets.length,
      kcal,
      mechanicalKcal,
      metabolicKcal,
      epocKcal,
      tonnageKg,
      isCompound: profile.compound,
    });
  }

  return {
    total: perExercise.reduce((s, e) => s + e.kcal, 0),
    perExercise,
    breakdown: {
      mechanicalKcal: totalMech,
      metabolicKcal: totalMeta,
      epocKcal: totalEpoc,
      tonnageKg: totalTonnage,
    },
  };
}

/**
 * What a planned session should burn, before it is done: every planned set
 * counted at target reps and realistic reference weight (or `defaultWeights`
 * from previous performance when supplied).
 */
export function plannedWorkoutKcal(
  exercises: {
    name: string;
    primary: readonly MuscleKey[];
    secondary?: readonly MuscleKey[];
    restSec?: number;
    sets: number;
    targetReps: number;
    defaultWeight?: number;
  }[],
  kg: number,
): { total: number; perExercise: ExerciseBurn[]; breakdown: WorkoutBurnBreakdown } {
  return workoutKcal(
    exercises.map((e) => ({
      name: e.name,
      primary: e.primary,
      secondary: e.secondary,
      restSec: e.restSec,
      sets: Array.from({ length: Math.max(0, Math.floor(e.sets)) }, () => ({
        reps: e.targetReps > 0 ? e.targetReps : 10,
        ...(nonNegative(e.defaultWeight) ? { weight: e.defaultWeight } : {}),
      })),
    })),
    kg,
  );
}
