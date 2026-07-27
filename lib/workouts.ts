"use client";

import type { MuscleKey, MuscleColorGroup } from "./muscles";
import { MUSCLE_TO_GROUP } from "./muscles";
import { scopedKey } from "./userScope";
import type { Equipment } from "./equipment";

export type SessionType =
  | "PUSH_A"
  | "PULL_A"
  | "LEGS"
  | "PUSH_B"
  | "PULL_B"
  | "CUSTOM"
  | "FEM_LOWER_A"
  | "FEM_UPPER_A"
  | "FEM_CARDIO"
  | "FEM_LOWER_B"
  | "FEM_UPPER_B"
  | "FEM_LOWER_C"
  | "FEM_ARMS"
  | "FEM_REST";

export type ExerciseDef = {
  name: string;
  sets: number;
  repsLabel: string;
  targetReps: number;
  increment: number;
  restSec: number;
  primary: MuscleKey[];
  secondary: MuscleKey[];
};

export function exerciseColorGroup(ex: ExerciseDef): MuscleColorGroup {
  return MUSCLE_TO_GROUP[ex.primary[0]];
}

export type SessionDef = {
  id: SessionType;
  name: string;
  focus: string;
  blurb: string;
  /** Which program this session belongs to. Existing sessions are implicitly
   * "default" (the male-default split); "female_default" marks the
   * glute-priority female program used by the program picker. */
  program?: "default" | "female_default";
  /** Plain-language description of the aesthetic outcome — what the user
   * is building when they pick this session. Shown on the picker cards
   * so beginners know why they'd choose it. */
  aesthetic?: string;
  recommendedDays: number[];
  recommendedLabel: string;
  dayLabel: string;
  primaryMuscles: MuscleKey[];
  exercises: ExerciseDef[];
};

export const SESSIONS: SessionDef[] = [
  {
    id: "PUSH_A",
    name: "BESARIN DADA",
    focus: "DADA · PRIA",
    blurb: "Bench · Incline · OHP · Dips",
    aesthetic: "Thicker chest, shirt-filling upper body, sharper triceps line",
    recommendedDays: [1],
    recommendedLabel: "Mon recommended",
    dayLabel: "MON",
    primaryMuscles: ["chest", "frontDelt", "tricep"],
    exercises: [
      { name: "Bench Press",         sets: 4, repsLabel: "8-10", targetReps: 9,  increment: 2.5, restSec: 60, primary: ["chest"],     secondary: ["frontDelt", "tricep"] },
      { name: "Incline DB Press",    sets: 3, repsLabel: "10",   targetReps: 10, increment: 2.5, restSec: 90,  primary: ["chest"],     secondary: ["frontDelt", "tricep"] },
      { name: "Cable Lateral Raise", sets: 3, repsLabel: "15",   targetReps: 15, increment: 1,   restSec: 60,  primary: ["sideDelt"],  secondary: [] },
      { name: "OHP",                 sets: 3, repsLabel: "10",   targetReps: 10, increment: 2.5, restSec: 90,  primary: ["frontDelt"], secondary: ["sideDelt", "tricep"] },
      { name: "Tricep Pushdown",     sets: 3, repsLabel: "12",   targetReps: 12, increment: 2.5, restSec: 60,  primary: ["tricep"],    secondary: [] },
      { name: "Dips",                sets: 3, repsLabel: "10",   targetReps: 10, increment: 2.5, restSec: 90,  primary: ["chest"],     secondary: ["tricep", "frontDelt"] },
    ],
  },
  {
    id: "PULL_A",
    name: "LEBARIN PUNGGUNG",
    focus: "V-TAPER · PRIA",
    blurb: "Pulldown · Row · Curl",
    aesthetic: "Wider lats for the V-taper, fuller biceps peak, broader frame",
    recommendedDays: [2],
    recommendedLabel: "Tue recommended",
    dayLabel: "TUE",
    primaryMuscles: ["lats", "bicep", "rearDelt"],
    exercises: [
      { name: "Lat Pulldown",       sets: 4, repsLabel: "8-10",  targetReps: 9,  increment: 2.5, restSec: 90, primary: ["lats"],    secondary: ["bicep", "rearDelt"] },
      { name: "Cable Row",          sets: 3, repsLabel: "10-12", targetReps: 11, increment: 2.5, restSec: 90, primary: ["midBack"], secondary: ["lats", "bicep"] },
      { name: "Seated Row Machine", sets: 3, repsLabel: "10-12", targetReps: 11, increment: 2.5, restSec: 90, primary: ["midBack"], secondary: ["lats", "bicep"] },
      { name: "Face Pull",          sets: 3, repsLabel: "15",    targetReps: 15, increment: 1,   restSec: 60, primary: ["rearDelt"], secondary: ["traps"] },
      { name: "Barbell Curl",       sets: 3, repsLabel: "10-12", targetReps: 11, increment: 2.5, restSec: 60, primary: ["bicep"],   secondary: [] },
      { name: "Hammer Curl",        sets: 3, repsLabel: "12",    targetReps: 12, increment: 1,   restSec: 60, primary: ["bicep"],   secondary: [] },
    ],
  },
  {
    id: "LEGS",
    name: "GEDEIN KAKI",
    focus: "KAKI + PERUT",
    blurb: "Squat · RDL · Press · Crunch",
    aesthetic: "Defined quads and glutes, tighter waist, athletic proportions",
    recommendedDays: [4],
    recommendedLabel: "Thu recommended",
    dayLabel: "THU",
    primaryMuscles: ["quad", "hamstring", "glute", "abs"],
    exercises: [
      { name: "Squat",             sets: 4, repsLabel: "8-10", targetReps: 9,  increment: 5,   restSec: 60, primary: ["quad"],      secondary: ["glute", "hamstring"] },
      { name: "Romanian Deadlift", sets: 3, repsLabel: "10",   targetReps: 10, increment: 5,   restSec: 60, primary: ["hamstring"], secondary: ["glute", "midBack"] },
      { name: "Leg Press",         sets: 3, repsLabel: "12",   targetReps: 12, increment: 5,   restSec: 90,  primary: ["quad"],      secondary: ["glute"] },
      { name: "Leg Curl",          sets: 3, repsLabel: "12",   targetReps: 12, increment: 2.5, restSec: 60,  primary: ["hamstring"], secondary: [] },
      { name: "Calf Raise",        sets: 4, repsLabel: "15",   targetReps: 15, increment: 2.5, restSec: 45,  primary: ["calf"],      secondary: [] },
      { name: "Cable Crunch",      sets: 3, repsLabel: "15",   targetReps: 15, increment: 2.5, restSec: 45,  primary: ["abs"],       secondary: [] },
      { name: "Plank",             sets: 2, repsLabel: "45s",  targetReps: 45, increment: 5,   restSec: 45,  primary: ["abs"],       secondary: [] },
    ],
  },
  {
    id: "PUSH_B",
    name: "LEBARIN BAHU",
    focus: "BAHU · PRIA",
    blurb: "OHP · Lateral · Incline",
    aesthetic: "Capped 3D delts, broader shoulders, that wide-shoulder silhouette",
    recommendedDays: [5],
    recommendedLabel: "Fri recommended",
    dayLabel: "FRI",
    primaryMuscles: ["sideDelt", "frontDelt", "chest"],
    exercises: [
      { name: "Seated DB Press",           sets: 4, repsLabel: "10",  targetReps: 10, increment: 2.5, restSec: 90, primary: ["frontDelt"], secondary: ["sideDelt", "tricep"] },
      { name: "Lateral Raise",             sets: 5, repsLabel: "15",  targetReps: 15, increment: 1,   restSec: 60, primary: ["sideDelt"],  secondary: [] },
      { name: "Incline DB Press",          sets: 3, repsLabel: "10",  targetReps: 10, increment: 2.5, restSec: 90, primary: ["chest"],     secondary: ["frontDelt", "tricep"] },
      { name: "Pec Deck",                  sets: 3, repsLabel: "12",  targetReps: 12, increment: 2.5, restSec: 60, primary: ["chest"],     secondary: [] },
      { name: "Overhead Tricep Extension", sets: 3, repsLabel: "12",  targetReps: 12, increment: 2.5, restSec: 60, primary: ["tricep"],    secondary: [] },
      { name: "Lateral Raise Burnout",     sets: 1, repsLabel: "max", targetReps: 20, increment: 1,   restSec: 0,  primary: ["sideDelt"],  secondary: [] },
    ],
  },
  {
    id: "PULL_B",
    name: "TEBELIN PUNGGUNG",
    focus: "PUNGGUNG TEBAL · PRIA",
    blurb: "Deadlift · Row · Pulldown",
    aesthetic: "Dense rear delts and traps, deeper back from the side, stronger posture",
    recommendedDays: [6, 0],
    recommendedLabel: "Weekend",
    dayLabel: "WEEKEND",
    primaryMuscles: ["midBack", "lats", "traps", "bicep"],
    exercises: [
      { name: "Deadlift",           sets: 3, repsLabel: "8",       targetReps: 8,  increment: 5,   restSec: 60, primary: ["midBack"],  secondary: ["hamstring", "glute", "traps"] },
      { name: "Wide Grip Pulldown", sets: 4, repsLabel: "10",      targetReps: 10, increment: 2.5, restSec: 90,  primary: ["lats"],     secondary: ["bicep", "rearDelt"] },
      { name: "Cable Row Wide",     sets: 3, repsLabel: "12",      targetReps: 12, increment: 2.5, restSec: 90,  primary: ["midBack"],  secondary: ["lats", "rearDelt"] },
      { name: "DB Row",             sets: 3, repsLabel: "10/side", targetReps: 10, increment: 2.5, restSec: 90,  primary: ["midBack"],  secondary: ["lats", "bicep"] },
      { name: "Face Pull",          sets: 3, repsLabel: "15",      targetReps: 15, increment: 1,   restSec: 60,  primary: ["rearDelt"], secondary: ["traps"] },
      { name: "Incline Curl",       sets: 3, repsLabel: "12",      targetReps: 12, increment: 1,   restSec: 60,  primary: ["bicep"],    secondary: [] },
    ],
  },

  // ============ Female default program (glute-priority) ============
  {
    id: "FEM_LOWER_A",
    name: "GEDEIN GLUTES",
    focus: "GLUTES · WANITA",
    blurb: "Hip Thrust · RDL · Split Squat · Kickback",
    aesthetic: "Rounder, stronger glutes and hamstrings — heavy hinge work with progressive overload week to week.",
    program: "female_default",
    recommendedDays: [1],
    recommendedLabel: "Mon recommended",
    dayLabel: "MON",
    primaryMuscles: ["glute", "hamstring", "quad"],
    exercises: [
      { name: "Hip Thrust",           sets: 4, repsLabel: "8-10",   targetReps: 9,  increment: 5,   restSec: 60, primary: ["glute"],     secondary: ["hamstring"] },
      { name: "Romanian Deadlift",    sets: 3, repsLabel: "10",     targetReps: 10, increment: 2.5, restSec: 60, primary: ["hamstring"], secondary: ["glute"] },
      { name: "Bulgarian Split Squat", sets: 3, repsLabel: "10/leg", targetReps: 10, increment: 2.5, restSec: 90,  primary: ["glute"],     secondary: ["quad"] },
      { name: "Cable Kickback",       sets: 3, repsLabel: "12",     targetReps: 12, increment: 2.5, restSec: 60,  primary: ["glute"],     secondary: [] },
      { name: "Hip Abduction",        sets: 3, repsLabel: "15",     targetReps: 15, increment: 2.5, restSec: 45,  primary: ["glute"],     secondary: [] },
    ],
  },
  {
    id: "FEM_UPPER_A",
    name: "KENCENGIN BADAN ATAS",
    focus: "PUNGGUNG + BAHU · WANITA",
    blurb: "Pulldown · DB Press · Row · Arms · Core",
    aesthetic: "Toned upper back and shoulders that balance the lower body — steady strength gains, no bulk required.",
    program: "female_default",
    recommendedDays: [2],
    recommendedLabel: "Tue recommended",
    dayLabel: "TUE",
    primaryMuscles: ["lats", "frontDelt", "midBack", "abs"],
    exercises: [
      { name: "Lat Pulldown",     sets: 3, repsLabel: "10", targetReps: 10, increment: 2.5, restSec: 90, primary: ["lats"],      secondary: ["bicep"] },
      { name: "DB Shoulder Press", sets: 3, repsLabel: "10", targetReps: 10, increment: 2.5, restSec: 90, primary: ["frontDelt"], secondary: ["sideDelt", "tricep"] },
      { name: "Seated Row",       sets: 3, repsLabel: "10", targetReps: 10, increment: 2.5, restSec: 90, primary: ["midBack"],   secondary: ["lats", "bicep"] },
      { name: "Bicep Curl",       sets: 2, repsLabel: "12", targetReps: 12, increment: 2.5, restSec: 45, primary: ["bicep"],     secondary: [] },
      { name: "Tricep Pushdown",  sets: 2, repsLabel: "12", targetReps: 12, increment: 2.5, restSec: 45, primary: ["tricep"],    secondary: [] },
      { name: "Cable Crunch",     sets: 3, repsLabel: "15", targetReps: 15, increment: 2.5, restSec: 45, primary: ["abs"],       secondary: [] },
    ],
  },
  {
    id: "FEM_CARDIO",
    name: "BAKAR LEMAK",
    focus: "CARDIO ZONE 2 · WANITA",
    blurb: "Incline treadmill walk — steady-state zone-2 cardio at 12% incline / 5 km/h to build an aerobic base without burning out your legs.",
    aesthetic: "Improved conditioning and recovery that supports your lifting days — easy, sustainable steady-state effort.",
    program: "female_default",
    recommendedDays: [3],
    recommendedLabel: "Wed recommended",
    dayLabel: "WED",
    primaryMuscles: ["quad"],
    exercises: [
      { name: "Incline Treadmill Walk", sets: 1, repsLabel: "40 min", targetReps: 40, increment: 0, restSec: 0, primary: ["quad"], secondary: ["calf", "glute"] },
    ],
  },
  {
    id: "FEM_LOWER_B",
    name: "BENTUK PAHA & GLUTES",
    focus: "PAHA + GLUTES · WANITA",
    blurb: "Squat · Walking Lunge · Leg Press · Leg Curl · Calf",
    aesthetic: "Shapely quads and glutes with an athletic lower body — squat-led strength that adds load over time.",
    program: "female_default",
    recommendedDays: [4],
    recommendedLabel: "Thu recommended",
    dayLabel: "THU",
    primaryMuscles: ["quad", "glute", "hamstring", "calf"],
    exercises: [
      { name: "Squat",         sets: 4, repsLabel: "8",      targetReps: 8,  increment: 5,   restSec: 60, primary: ["quad"],      secondary: ["glute", "hamstring"] },
      { name: "Walking Lunge", sets: 3, repsLabel: "12/leg", targetReps: 12, increment: 2.5, restSec: 90,  primary: ["quad"],      secondary: ["glute"] },
      { name: "Leg Press",     sets: 3, repsLabel: "12",     targetReps: 12, increment: 5,   restSec: 90,  primary: ["glute"],     secondary: ["quad"] },
      { name: "Leg Curl",      sets: 3, repsLabel: "12",     targetReps: 12, increment: 2.5, restSec: 60,  primary: ["hamstring"], secondary: [] },
      { name: "Calf Raise",    sets: 3, repsLabel: "15",     targetReps: 15, increment: 2.5, restSec: 45,  primary: ["calf"],      secondary: [] },
    ],
  },
  {
    id: "FEM_UPPER_B",
    name: "POSTUR & BADAN ATAS",
    focus: "PULL + PUSH · WANITA",
    blurb: "Pull-up · Incline Press · Lateral · Face Pull",
    aesthetic: "A strong, defined upper body and healthy posture — building real pulling strength with progressive overload.",
    program: "female_default",
    recommendedDays: [5],
    recommendedLabel: "Fri recommended",
    dayLabel: "FRI",
    primaryMuscles: ["lats", "chest", "sideDelt", "rearDelt"],
    exercises: [
      { name: "Pull-up (Assisted)", sets: 3, repsLabel: "8",  targetReps: 8,  increment: 2.5, restSec: 90, primary: ["lats"],     secondary: ["bicep", "midBack"] },
      { name: "Incline DB Press",   sets: 3, repsLabel: "10", targetReps: 10, increment: 2.5, restSec: 90, primary: ["chest"],    secondary: ["frontDelt", "tricep"] },
      { name: "Lateral Raise",      sets: 3, repsLabel: "15", targetReps: 15, increment: 2.5, restSec: 60, primary: ["sideDelt"], secondary: [] },
      { name: "Face Pull",          sets: 3, repsLabel: "15", targetReps: 15, increment: 2.5, restSec: 60, primary: ["rearDelt"], secondary: ["midBack"] },
    ],
  },
  {
    id: "FEM_LOWER_C",
    name: "GLUTE PUMP",
    focus: "GLUTES · PUMP · WANITA",
    blurb: "Light Hip Thrust · Back Ext · Sumo Goblet · Abduction · Stairs",
    aesthetic: "A higher-rep glute pump session for shape and endurance — lighter loads, controlled reps, and metabolic burn.",
    program: "female_default",
    recommendedDays: [6],
    recommendedLabel: "Sat recommended",
    dayLabel: "SAT",
    primaryMuscles: ["glute", "hamstring", "quad"],
    exercises: [
      { name: "Hip Thrust (Light)",   sets: 3, repsLabel: "15",     targetReps: 15, increment: 5,   restSec: 60, primary: ["glute"],     secondary: ["hamstring"] },
      { name: "Back Extension",       sets: 3, repsLabel: "12",     targetReps: 12, increment: 2.5, restSec: 60, primary: ["glute"],     secondary: ["hamstring"] },
      { name: "Sumo Goblet Squat",    sets: 3, repsLabel: "12",     targetReps: 12, increment: 2.5, restSec: 60, primary: ["glute"],     secondary: ["quad"] },
      { name: "Hip Abduction",        sets: 3, repsLabel: "20",     targetReps: 20, increment: 2.5, restSec: 45, primary: ["glute"],     secondary: [] },
      { name: "Stairmaster",          sets: 1, repsLabel: "15 min", targetReps: 15, increment: 0,   restSec: 0,  primary: ["quad"],      secondary: ["glute", "calf"] },
    ],
  },
  {
    id: "FEM_ARMS",
    name: "KENCENGIN TANGAN",
    focus: "LENGAN · WANITA",
    blurb: "Pushdown · OH Extension · Lateral · Curl · Walk",
    aesthetic:
      "Lengan lebih kencang dan padat, bahu berbentuk — beban ringan reps tinggi plus finisher cardio biar toned, bukan bulk.",
    program: "female_default",
    // Optional add-on day — selectable any time, not tied to the weekly split.
    recommendedDays: [],
    recommendedLabel: "Opsional",
    dayLabel: "OPSIONAL",
    primaryMuscles: ["tricep", "bicep", "sideDelt"],
    exercises: [
      { name: "Tricep Rope Pushdown",      sets: 3, repsLabel: "15",     targetReps: 15, increment: 2.5, restSec: 45, primary: ["tricep"],   secondary: [] },
      { name: "Overhead Tricep Extension", sets: 3, repsLabel: "12-15",  targetReps: 13, increment: 2.5, restSec: 45, primary: ["tricep"],   secondary: [] },
      { name: "DB Lateral Raise",          sets: 3, repsLabel: "15",     targetReps: 15, increment: 1,   restSec: 45, primary: ["sideDelt"], secondary: [] },
      { name: "DB Bicep Curl",             sets: 3, repsLabel: "12-15",  targetReps: 13, increment: 1,   restSec: 45, primary: ["bicep"],    secondary: [] },
      { name: "Cable Hammer Curl",         sets: 2, repsLabel: "15",     targetReps: 15, increment: 1,   restSec: 45, primary: ["bicep"],    secondary: [] },
      { name: "Incline Treadmill Walk",    sets: 1, repsLabel: "15 min", targetReps: 15, increment: 0,   restSec: 0,  primary: ["quad"],     secondary: ["calf", "glute"] },
    ],
  },
  {
    id: "FEM_REST",
    name: "ISTIRAHAT AKTIF",
    focus: "RECOVERY · WANITA",
    blurb: "Rest day — aim for 8–10k steps to stay active and let your glutes and legs recover for the next training block.",
    aesthetic: "Active recovery that keeps you moving and supports progress — walking, not lifting.",
    program: "female_default",
    recommendedDays: [0],
    recommendedLabel: "REST / 8–10K STEPS",
    dayLabel: "REST / 8–10K STEPS",
    primaryMuscles: [],
    exercises: [
      { name: "Walk (8–10k steps)", sets: 1, repsLabel: "8-10k steps", targetReps: 10000, increment: 0, restSec: 0, primary: [], secondary: [] },
    ],
  },
];

export function getSession(id: string): SessionDef | null {
  return SESSIONS.find((s) => s.id === id) ?? null;
}

export function recommendedSessionFor(date: Date): SessionType {
  const day = date.getDay();
  const match = SESSIONS.find((s) => s.recommendedDays.includes(day));
  return (match?.id ?? "PUSH_A") as SessionType;
}

/** Sessions belonging to the glute-priority female default program. */
export function femaleSessions(): SessionDef[] {
  return SESSIONS.filter((s) => s.program === "female_default");
}

/** Weekday → female-default split, mirroring recommendedSessionFor but over
 * the female_default sessions only. */
export function recommendedFemaleSessionFor(date: Date): SessionType {
  const day = date.getDay();
  const fem = femaleSessions();
  const match = fem.find((s) => s.recommendedDays.includes(day));
  return (match?.id ?? "FEM_LOWER_A") as SessionType;
}

// ============ Storage ============

export type SetLog = {
  setNumber: number;
  weight: number;
  reps: number;
  loggedAt: number;
};

export type ExerciseLog = {
  exerciseName: string;
  sets: SetLog[];
  notes?: string;
  skipped?: boolean;
  swappedTo?: string;
};

export type WorkoutSession = {
  id: string;
  date: string;
  sessionType: SessionType;
  /** Present when sessionType === "CUSTOM". Snapshot of the template. */
  customTemplateId?: string;
  customName?: string;
  customFocus?: string;
  customExercises?: ExerciseDef[];
  /** Machines appended mid-session (via ＋ TAMBAH MESIN in the logger). These
   * render after the template's exercises for both preset and custom sessions. */
  extraExercises?: ExerciseDef[];
  startedAt: number;
  endedAt?: number;
  durationMin?: number;
  totalVolume?: number;
  completed: boolean;
  exercises: ExerciseLog[];
};

export type CustomTemplate = {
  id: string;
  name: string;
  focus: string;
  exercises: ExerciseDef[];
  createdAt: number;
};

const WORKOUTS_KEY = "richie.workouts.v1";
const ACTIVE_KEY = "richie.activeWorkout.v1";
const CUSTOM_TEMPLATES_KEY = "richie.customTemplates.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(scopedKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scopedKey(key), JSON.stringify(value));
}

export function getAllWorkouts(): WorkoutSession[] {
  return read<WorkoutSession[]>(WORKOUTS_KEY, []);
}

export function getWorkout(id: string): WorkoutSession | null {
  return getAllWorkouts().find((w) => w.id === id) ?? null;
}

function postWorkoutRemote(w: WorkoutSession): void {
  if (typeof window === "undefined") return;
  fetch("/api/workouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: w.id,
      date: w.date,
      sessionType: w.sessionType,
      totalVolume: workoutVolume(w),
      exercises: w.exercises.map((e) => ({ name: e.exerciseName, sets: e.sets })),
    }),
    keepalive: true,
  }).catch(() => {});
}

export function saveWorkout(w: WorkoutSession): void {
  const all = getAllWorkouts();
  const idx = all.findIndex((x) => x.id === w.id);
  if (idx >= 0) all[idx] = w;
  else all.push(w);
  write(WORKOUTS_KEY, all);
  // Only completed sessions go to the shared DB — in-progress sets stay local.
  if (w.completed) postWorkoutRemote(w);
}

export function getActiveWorkoutId(): string | null {
  return read<string | null>(ACTIVE_KEY, null);
}

export function setActiveWorkoutId(id: string | null): void {
  write(ACTIVE_KEY, id);
}

export function startWorkout(sessionType: SessionType, date: string): WorkoutSession {
  const def = getSession(sessionType)!;
  const w: WorkoutSession = {
    id: crypto.randomUUID(),
    date,
    sessionType,
    startedAt: Date.now(),
    completed: false,
    exercises: def.exercises.map((e) => ({ exerciseName: e.name, sets: [] })),
  };
  saveWorkout(w);
  setActiveWorkoutId(w.id);
  return w;
}

export function startCustomWorkout(template: CustomTemplate, date: string): WorkoutSession {
  const w: WorkoutSession = {
    id: crypto.randomUUID(),
    date,
    sessionType: "CUSTOM",
    customTemplateId: template.id,
    customName: template.name,
    customFocus: template.focus,
    customExercises: template.exercises,
    startedAt: Date.now(),
    completed: false,
    exercises: template.exercises.map((e) => ({ exerciseName: e.name, sets: [] })),
  };
  saveWorkout(w);
  setActiveWorkoutId(w.id);
  return w;
}

// ─── Quick log: one machine → one exercise, no session picking ──────────────

/** Map an equipment `muscleGroup` string to a MuscleKey (for coloring/volume). */
function muscleFromGroup(group: string): MuscleKey {
  const g = group.toUpperCase();
  if (g.includes("UPPER CHEST") || g.includes("CHEST")) return "chest";
  if (g.includes("LATS")) return "lats";
  if (g.includes("MIDDLE BACK") || g.includes("LOWER BACK")) return "midBack";
  if (g.includes("FRONT DELT")) return "frontDelt";
  if (g.includes("SIDE DELT")) return "sideDelt";
  if (g.includes("REAR DELT")) return "rearDelt";
  if (g.includes("BICEPS")) return "bicep";
  if (g.includes("TRICEPS")) return "tricep";
  if (g.includes("QUADS") || g.includes("INNER THIGH")) return "quad";
  if (g.includes("HAMSTRINGS")) return "hamstring";
  if (g.includes("GLUTES")) return "glute";
  if (g.includes("CALVES")) return "calf";
  if (g.includes("ABS")) return "abs";
  return "chest";
}

/** Build a loggable exercise from an equipment item, with sensible defaults. */
export function exerciseDefFromEquipment(e: Equipment): ExerciseDef {
  return {
    name: e.name,
    sets: 3,
    repsLabel: "10",
    targetReps: 10,
    increment: 2.5,
    restSec: 60,
    primary: [muscleFromGroup(e.muscleGroup)],
    secondary: [],
  };
}

/** Start (or resume-append to) a quick single-exercise session for a machine —
 *  the flexible "just tap the machine and log it" path. If there's already an
 *  in-progress session today, append this exercise to it instead of spawning a
 *  new one, so a quick freestyle workout collects in one place. Returns the
 *  session id to open in the logger. */
export function startQuickExercise(e: Equipment, date: string): { id: string } {
  const def = exerciseDefFromEquipment(e);
  const activeId = getActiveWorkoutId();
  const active = activeId ? getWorkout(activeId) : null;
  // Only fold into an in-progress *quick* (CUSTOM) session — appending to a
  // preset session wouldn't render (its logger uses the preset's fixed list).
  if (active && active.date === date && !active.completed && active.sessionType === "CUSTOM") {
    // Don't duplicate the same machine; just reopen it.
    const already = active.exercises.some((x) => x.exerciseName === def.name);
    if (!already) {
      const next: WorkoutSession = {
        ...active,
        customExercises: [...(active.customExercises ?? []), def],
        exercises: [...active.exercises, { exerciseName: def.name, sets: [] }],
      };
      saveWorkout(next);
    }
    return { id: active.id };
  }
  const w: WorkoutSession = {
    id: crypto.randomUUID(),
    date,
    sessionType: "CUSTOM",
    customName: "Catat cepat",
    customFocus: "Latihan bebas",
    customExercises: [def],
    startedAt: Date.now(),
    completed: false,
    exercises: [{ exerciseName: def.name, sets: [] }],
  };
  saveWorkout(w);
  setActiveWorkoutId(w.id);
  return { id: w.id };
}

export function getDefForWorkout(w: WorkoutSession): SessionDef {
  const extra = w.extraExercises ?? [];
  if (w.sessionType === "CUSTOM" && w.customExercises) {
    const exercises = [...w.customExercises, ...extra];
    return {
      id: "CUSTOM",
      name: w.customName || "CUSTOM",
      focus: w.customFocus || "CUSTOM SESSION",
      blurb: "",
      recommendedDays: [],
      recommendedLabel: "",
      dayLabel: "CUSTOM",
      primaryMuscles: Array.from(new Set(exercises.flatMap((e) => e.primary))),
      exercises,
    };
  }
  const base = getSession(w.sessionType)!;
  if (extra.length === 0) return base;
  return { ...base, exercises: [...base.exercises, ...extra] };
}

/** Append a freestyle machine/exercise to an in-progress session (both preset
 * and custom). Returns the updated session; the logger renders it after the
 * template's exercises. */
export function appendExerciseToWorkout(
  w: WorkoutSession,
  def: ExerciseDef
): WorkoutSession {
  const next: WorkoutSession = {
    ...w,
    extraExercises: [...(w.extraExercises ?? []), def],
    exercises: [...w.exercises, { exerciseName: def.name, sets: [] }],
  };
  saveWorkout(next);
  return next;
}

export function getCustomTemplates(): CustomTemplate[] {
  return read<CustomTemplate[]>(CUSTOM_TEMPLATES_KEY, []);
}

export function saveCustomTemplate(
  template: Omit<CustomTemplate, "id" | "createdAt">
): CustomTemplate {
  const all = getCustomTemplates();
  const entry: CustomTemplate = {
    ...template,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  all.push(entry);
  write(CUSTOM_TEMPLATES_KEY, all);
  return entry;
}

export function renameCustomTemplate(id: string, name: string): void {
  const all = getCustomTemplates();
  const t = all.find((x) => x.id === id);
  if (!t) return;
  t.name = name.trim().slice(0, 60) || t.name;
  write(CUSTOM_TEMPLATES_KEY, all);
}

/** Turn a FINISHED session into a reusable template draft.
 *
 *  A freestyle ("Catat cepat") session is otherwise a one-off: you pick
 *  machines, log them, and the shape of that workout is gone. This captures
 *  what you ACTUALLY did — the machines, how many sets you logged, and the
 *  reps you finished on — so it can be repeated later. Weight isn't stored on
 *  the template; the logger already seeds it from your last performance, which
 *  stays truer over time than a frozen number.
 *
 *  Exercises with no logged sets are dropped: they weren't part of the workout.
 */
export function templateDraftFromWorkout(
  w: WorkoutSession
): Omit<CustomTemplate, "id" | "createdAt"> {
  const def = getDefForWorkout(w);
  const exercises: ExerciseDef[] = [];
  for (let i = 0; i < w.exercises.length; i++) {
    const log = w.exercises[i];
    if (!log || log.sets.length === 0) continue;
    const d = def.exercises[i];
    const name = log.swappedTo ?? d?.name ?? log.exerciseName;
    const lastReps = log.sets[log.sets.length - 1]?.reps ?? d?.targetReps ?? 10;
    exercises.push({
      name,
      sets: log.sets.length,
      repsLabel: String(lastReps),
      targetReps: lastReps,
      increment: d?.increment ?? 2.5,
      restSec: d?.restSec ?? 60,
      primary: d?.primary ?? ["chest"],
      secondary: d?.secondary ?? [],
    });
  }
  // Default name: the machines themselves, since that's how you'd recognise
  // the session. Renameable straight away.
  const names = exercises.map((e) => e.name);
  const head = names.slice(0, 2).join(" + ");
  const name =
    names.length === 0
      ? "Sesi saya"
      : names.length > 2
      ? `${head} +${names.length - 2}`
      : head;
  const dateLabel = (() => {
    const [y, m, dd] = w.date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, dd || 1, 12));
    return dt.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
  })();
  return {
    name: name.slice(0, 60),
    focus: `${exercises.length} gerakan · ${dateLabel}`,
    exercises,
  };
}

export function deleteCustomTemplate(id: string): void {
  write(
    CUSTOM_TEMPLATES_KEY,
    getCustomTemplates().filter((t) => t.id !== id)
  );
}

export function workoutVolume(w: WorkoutSession): number {
  let v = 0;
  for (const ex of w.exercises) {
    for (const s of ex.sets) v += s.weight * s.reps;
  }
  return v;
}

export function getLastSessionOfType(sessionType: SessionType, excludeId?: string): WorkoutSession | null {
  const list = getAllWorkouts()
    .filter((w) => w.sessionType === sessionType && w.id !== excludeId && w.completed)
    .sort((a, b) => b.startedAt - a.startedAt);
  return list[0] ?? null;
}

export function getTodaysWorkout(date: string): WorkoutSession | null {
  return getAllWorkouts().find((w) => w.date === date && w.completed) ?? null;
}

export function getLastSetForExercise(sessionType: SessionType, exerciseName: string, excludeId?: string): { weight: number; reps: number; daysAgo: number } | null {
  const last = getLastSessionOfType(sessionType, excludeId);
  if (!last) return null;
  const ex = last.exercises.find((e) => e.exerciseName === exerciseName);
  if (!ex || ex.sets.length === 0) return null;
  const best = ex.sets.reduce((a, b) => (b.weight * b.reps > a.weight * a.reps ? b : a));
  const daysAgo = Math.max(1, Math.round((Date.now() - last.startedAt) / 86400000));
  return { weight: best.weight, reps: best.reps, daysAgo };
}

export function weekNumber(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = (date.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

// ---------- Server → local pull sync (Hermes-logged sessions) ----------

const SEEN_SERVER_KEY = "richie.server.seenWorkouts.v1";

type ServerWorkoutRow = {
  id: string;
  date: string;
  sessionType: string;
  totalVolume: number;
  createdAt: number;
};

const KNOWN_TYPES: SessionType[] = ["PUSH_A", "PULL_A", "LEGS", "PUSH_B", "PULL_B"];

/** Import Hermes-logged sessions as completed workouts so streaks and the
 * dashboard reflect them. Unknown types (e.g. CARDIO) are skipped locally —
 * the UI has no template for them; they still count in the API summaries. */
export function mergeServerWorkouts(rows: ServerWorkoutRow[]): number {
  if (typeof window === "undefined") return 0;
  const seen = new Set(read<string[]>(SEEN_SERVER_KEY, []));
  const all = getAllWorkouts();
  for (const w of all) seen.add(w.id);

  let added = 0;
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!KNOWN_TYPES.includes(row.sessionType as SessionType)) continue;
    all.push({
      id: row.id,
      date: row.date,
      sessionType: row.sessionType as SessionType,
      startedAt: row.createdAt,
      endedAt: row.createdAt,
      totalVolume: row.totalVolume,
      completed: true,
      exercises: [],
    });
    added++;
  }
  if (added > 0) write(WORKOUTS_KEY, all);
  write(SEEN_SERVER_KEY, Array.from(seen));
  return added;
}
