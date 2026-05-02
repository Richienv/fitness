"use client";

import type { MuscleKey, MuscleColorGroup } from "./muscles";
import { MUSCLE_TO_GROUP } from "./muscles";

export type SessionType = "PUSH_A" | "PULL_A" | "LEGS" | "PUSH_B" | "PULL_B" | "CUSTOM";

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
    name: "PUSH A",
    focus: "CHEST FOCUS",
    blurb: "Bench · Incline · OHP · Dips",
    aesthetic: "Thicker chest, shirt-filling upper body, sharper triceps line",
    recommendedDays: [1],
    recommendedLabel: "Mon recommended",
    dayLabel: "MON",
    primaryMuscles: ["chest", "frontDelt", "tricep"],
    exercises: [
      { name: "Bench Press",         sets: 4, repsLabel: "8-10", targetReps: 9,  increment: 2.5, restSec: 120, primary: ["chest"],     secondary: ["frontDelt", "tricep"] },
      { name: "Incline DB Press",    sets: 3, repsLabel: "10",   targetReps: 10, increment: 2.5, restSec: 90,  primary: ["chest"],     secondary: ["frontDelt", "tricep"] },
      { name: "Cable Lateral Raise", sets: 3, repsLabel: "15",   targetReps: 15, increment: 1,   restSec: 60,  primary: ["sideDelt"],  secondary: [] },
      { name: "OHP",                 sets: 3, repsLabel: "10",   targetReps: 10, increment: 2.5, restSec: 90,  primary: ["frontDelt"], secondary: ["sideDelt", "tricep"] },
      { name: "Tricep Pushdown",     sets: 3, repsLabel: "12",   targetReps: 12, increment: 2.5, restSec: 60,  primary: ["tricep"],    secondary: [] },
      { name: "Dips",                sets: 3, repsLabel: "10",   targetReps: 10, increment: 2.5, restSec: 90,  primary: ["chest"],     secondary: ["tricep", "frontDelt"] },
    ],
  },
  {
    id: "PULL_A",
    name: "PULL A",
    focus: "BACK WIDTH",
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
    name: "LEGS + ABS",
    focus: "LOWER BODY",
    blurb: "Squat · RDL · Press · Crunch",
    aesthetic: "Defined quads and glutes, tighter waist, athletic proportions",
    recommendedDays: [4],
    recommendedLabel: "Thu recommended",
    dayLabel: "THU",
    primaryMuscles: ["quad", "hamstring", "glute", "abs"],
    exercises: [
      { name: "Squat",             sets: 4, repsLabel: "8-10", targetReps: 9,  increment: 5,   restSec: 120, primary: ["quad"],      secondary: ["glute", "hamstring"] },
      { name: "Romanian Deadlift", sets: 3, repsLabel: "10",   targetReps: 10, increment: 5,   restSec: 120, primary: ["hamstring"], secondary: ["glute", "midBack"] },
      { name: "Leg Press",         sets: 3, repsLabel: "12",   targetReps: 12, increment: 5,   restSec: 90,  primary: ["quad"],      secondary: ["glute"] },
      { name: "Leg Curl",          sets: 3, repsLabel: "12",   targetReps: 12, increment: 2.5, restSec: 60,  primary: ["hamstring"], secondary: [] },
      { name: "Calf Raise",        sets: 4, repsLabel: "15",   targetReps: 15, increment: 2.5, restSec: 45,  primary: ["calf"],      secondary: [] },
      { name: "Cable Crunch",      sets: 3, repsLabel: "15",   targetReps: 15, increment: 2.5, restSec: 45,  primary: ["abs"],       secondary: [] },
      { name: "Plank",             sets: 2, repsLabel: "45s",  targetReps: 45, increment: 5,   restSec: 45,  primary: ["abs"],       secondary: [] },
    ],
  },
  {
    id: "PUSH_B",
    name: "PUSH B",
    focus: "SHOULDER FOCUS",
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
    name: "PULL B",
    focus: "BACK THICKNESS",
    blurb: "Deadlift · Row · Pulldown",
    aesthetic: "Dense rear delts and traps, deeper back from the side, stronger posture",
    recommendedDays: [6, 0],
    recommendedLabel: "Weekend",
    dayLabel: "WEEKEND",
    primaryMuscles: ["midBack", "lats", "traps", "bicep"],
    exercises: [
      { name: "Deadlift",           sets: 3, repsLabel: "8",       targetReps: 8,  increment: 5,   restSec: 120, primary: ["midBack"],  secondary: ["hamstring", "glute", "traps"] },
      { name: "Wide Grip Pulldown", sets: 4, repsLabel: "10",      targetReps: 10, increment: 2.5, restSec: 90,  primary: ["lats"],     secondary: ["bicep", "rearDelt"] },
      { name: "Cable Row Wide",     sets: 3, repsLabel: "12",      targetReps: 12, increment: 2.5, restSec: 90,  primary: ["midBack"],  secondary: ["lats", "rearDelt"] },
      { name: "DB Row",             sets: 3, repsLabel: "10/side", targetReps: 10, increment: 2.5, restSec: 90,  primary: ["midBack"],  secondary: ["lats", "bicep"] },
      { name: "Face Pull",          sets: 3, repsLabel: "15",      targetReps: 15, increment: 1,   restSec: 60,  primary: ["rearDelt"], secondary: ["traps"] },
      { name: "Incline Curl",       sets: 3, repsLabel: "12",      targetReps: 12, increment: 1,   restSec: 60,  primary: ["bicep"],    secondary: [] },
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
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getAllWorkouts(): WorkoutSession[] {
  return read<WorkoutSession[]>(WORKOUTS_KEY, []);
}

export function getWorkout(id: string): WorkoutSession | null {
  return getAllWorkouts().find((w) => w.id === id) ?? null;
}

export function saveWorkout(w: WorkoutSession): void {
  const all = getAllWorkouts();
  const idx = all.findIndex((x) => x.id === w.id);
  if (idx >= 0) all[idx] = w;
  else all.push(w);
  write(WORKOUTS_KEY, all);
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

export function getDefForWorkout(w: WorkoutSession): SessionDef {
  if (w.sessionType === "CUSTOM" && w.customExercises) {
    return {
      id: "CUSTOM",
      name: w.customName || "CUSTOM",
      focus: w.customFocus || "CUSTOM SESSION",
      blurb: "",
      recommendedDays: [],
      recommendedLabel: "",
      dayLabel: "CUSTOM",
      primaryMuscles: Array.from(
        new Set(w.customExercises.flatMap((e) => e.primary))
      ),
      exercises: w.customExercises,
    };
  }
  return getSession(w.sessionType)!;
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
