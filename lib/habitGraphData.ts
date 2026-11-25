"use client";
// High-level browser adapter for Habit Graph Shadow Recommendations ("Tombol Bayangan").
//
// Bridges real localStorage stores (meals, workouts, activities, settings, targets,
// body weight, Richie vs Renita splits) with the pure `lib/habitGraph.ts` engine.

import {
  recordMealEvent,
  recordWorkoutEvent,
  scoreMealRecommendations,
  scoreWorkoutRecommendations,
  type DayType,
  type HabitComboPayload,
  type HabitExerciseSnapshot,
  type HabitFoodSnapshot,
  type HabitGraph,
  type HabitWorkoutPayload,
  type ShadowRecommendation,
} from "./habitGraph.ts";
import {
  confirmShadowInGraph,
  dismissShadowInGraph,
  readHabitGraph,
  writeHabitGraph,
} from "./habitGraphStore.ts";
import {
  getAllMeals,
  getDaily,
  getMealsForDate,
  gymDayReader,
  isCustomItem,
  saveMeal,
  updateMealItems,
  type CustomMealItem,
  type MealItem,
  type MealLog,
} from "./store.ts";
import { foodLabel } from "./foodLabel.ts";
import { getIngredient, macrosFor } from "./ingredients.ts";
import type { MealType } from "./presets.ts";
import { mealSlotForHour } from "./motivation.ts";
import { dayTarget } from "./dayBudgetData.ts";
import {
  SESSIONS,
  femaleSessions,
  getAllWorkouts,
  getDefForWorkout,
  getLastSetForExercise,
  saveWorkout,
  workoutVolume,
  type SessionDef,
  type SessionType,
  type WorkoutSession,
} from "./workouts.ts";
import {
  ACTIVITY_BY_KEY,
  activityKcal,
  defaultWorkingWeightKg,
  plannedWorkoutKcal,
  type ActivityKey,
  type Intensity,
} from "./burn.ts";
import { readBodyKg, sessionTitle, workoutBurn } from "./burnData.ts";
import { addActivity, getAllActivities, type ActivityEntry } from "./activity.ts";
import { getProfile, getSettings } from "./settings.ts";
import { readCompanion } from "./companionSettings.ts";
import { sentenceCase, weekdayOfKey } from "./trainingLoad.ts";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function mealItemToSnapshot(it: MealItem): HabitFoodSnapshot {
  if (isCustomItem(it)) {
    const clean = it.name.trim();
    return {
      foodKey: `custom:${clean.toLowerCase()}`,
      name: clean,
      grams: it.grams || 0,
      qty: 1,
      portionLabel: it.portionLabel || (it.grams > 0 ? `${Math.round(it.grams)} g` : "1 porsi"),
      kcal: Number(it.kcal) || 0,
      protein: Number(it.protein) || 0,
      carbs: Number(it.carbs) || 0,
      fat: Number(it.fat) || 0,
      ...(it.sugar != null ? { sugar: it.sugar } : {}),
    };
  }
  const ing = getIngredient(it.id);
  const m = macrosFor(it.id, it.qty);
  const grams = ing?.gramsPerUnit ? Math.round(ing.gramsPerUnit * it.qty) : 0;
  const portionLabel = grams > 0
    ? `${grams} g`
    : ing?.unit
      ? `${round1(it.qty)} × ${ing.unit}`
      : `${round1(it.qty)}×`;
  return {
    foodKey: it.id,
    ingredientId: it.id,
    name: ing ? foodLabel(ing) : it.id,
    grams,
    qty: it.qty,
    unit: ing?.unit,
    portionLabel,
    kcal: m.kcal,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    ...(ing?.sugar != null ? { sugar: ing.sugar * it.qty } : {}),
  };
}

export function snapshotToMealItem(s: HabitFoodSnapshot, scale = 1): MealItem {
  const f = scale > 0 && Number.isFinite(scale) ? scale : 1;
  if (s.ingredientId && getIngredient(s.ingredientId)) {
    const qty = Math.max(0.25, Math.round((s.qty ?? 1) * f * 100) / 100);
    return { id: s.ingredientId, qty };
  }
  const grams = s.grams > 0 ? Math.round(s.grams * f) : 0;
  const custom: CustomMealItem = {
    custom: true,
    name: s.name,
    grams,
    portionLabel: grams > 0 ? `${grams} g` : s.portionLabel || "1 porsi",
    kcal: Math.round(s.kcal * f),
    protein: round1(s.protein * f),
    carbs: round1(s.carbs * f),
    fat: round1(s.fat * f),
    ...(s.sugar != null ? { sugar: round1(s.sugar * f) } : {}),
  };
  return custom;
}

function workoutToPayload(w: WorkoutSession, kg: number): HabitWorkoutPayload {
  const def = getDefForWorkout(w);
  const burn = workoutBurn(w, kg).total;
  const exercises: HabitExerciseSnapshot[] = def.exercises.map((d, idx) => {
    const logged = w.exercises[idx];
    const setsCount = logged && logged.sets.length > 0 ? logged.sets.length : d.sets;
    const topWeight = logged?.sets.reduce((m, s) => Math.max(m, s.weight), 0) || undefined;
    return {
      name: logged?.swappedTo || d.name,
      sets: setsCount,
      repsLabel: d.repsLabel,
      targetReps: d.targetReps,
      weightKg: topWeight,
    };
  });
  const totalSets = exercises.reduce((s, e) => s + e.sets, 0);
  const estDuration = w.durationMin || Math.max(20, Math.round(totalSets * 2.4));
  return {
    kind: "session",
    title: w.sessionType === "CUSTOM" ? w.customName || "Sesi bebas" : sessionTitle(w),
    sessionType: w.sessionType,
    customTemplateId: w.customTemplateId,
    customFocus: w.customFocus,
    setsCount: totalSets,
    exercisesCount: exercises.length,
    durationMin: estDuration,
    estimatedKcal: Math.round(burn > 0 ? burn : plannedWorkoutKcal(def.exercises, kg).total),
    exercises,
  };
}

function activityToPayload(a: ActivityEntry, kg: number): HabitWorkoutPayload {
  const def = ACTIVITY_BY_KEY[a.kind];
  const kcal = Math.round(activityKcal(a, kg));
  const detail =
    a.steps ? `${Math.round(a.steps).toLocaleString("id-ID")} langkah` :
    a.minutes ? `${Math.round(a.minutes)} mnt` :
    a.reps ? `${Math.round(a.reps)} kali` : "";
  return {
    kind: "activity",
    title: detail ? `${def.label} ${detail}` : def.label,
    activityKind: a.kind,
    minutes: a.minutes,
    steps: a.steps,
    reps: a.reps,
    intensity: a.intensity,
    setsCount: 1,
    exercisesCount: 1,
    durationMin: a.minutes ?? (a.steps ? Math.max(10, Math.round(a.steps / 105)) : 10),
    estimatedKcal: kcal,
  };
}

function plannedSessionForToday(date: string, kg: number): HabitWorkoutPayload | null {
  const profile = getProfile();
  const companion = readCompanion();
  const isFemale = profile.sex === "female" || (!profile.sex && companion.character === "renita");
  const program = isFemale ? femaleSessions() : SESSIONS.filter((s) => !s.program);
  const routineDays = getSettings().routine?.trainingDays ?? null;
  const wd = weekdayOfKey(date) ?? new Date().getDay();
  const scheduled = program.filter((s) => s.id !== "FEM_REST" && s.primaryMuscles.length > 0);
  let pick: SessionDef | null = null;
  if (routineDays !== null) {
    const idx = routineDays.indexOf(wd);
    if (idx >= 0 && scheduled.length > 0) pick = scheduled[idx % scheduled.length];
  } else {
    pick = scheduled.find((s) => s.recommendedDays.includes(wd)) ?? null;
  }
  if (!pick) return null;
  const kcal = Math.round(plannedWorkoutKcal(pick.exercises, kg).total);
  const setsCount = pick.exercises.reduce((s, e) => s + e.sets, 0);
  return {
    kind: "session",
    title: sentenceCase(pick.name),
    sessionType: pick.id,
    setsCount,
    exercisesCount: pick.exercises.length,
    durationMin: Math.max(25, Math.round(setsCount * 2.5)),
    estimatedKcal: kcal,
    exercises: pick.exercises.map((e) => ({
      name: e.name,
      sets: e.sets,
      repsLabel: e.repsLabel,
      targetReps: e.targetReps,
    })),
  };
}

function restWalkFallback(kg: number): HabitWorkoutPayload {
  return {
    kind: "activity",
    title: "Jalan kaki 30 mnt",
    activityKind: "jalan",
    minutes: 30,
    intensity: "sedang",
    setsCount: 1,
    exercisesCount: 1,
    durationMin: 30,
    estimatedKcal: Math.round(activityKcal({ kind: "jalan", minutes: 30, intensity: "sedang" }, kg)),
  };
}

/** Ensures historical meals, completed workouts, and logged activities are
 *  folded into the Habit Graph once so existing users get instant predictions. */
export function ensureBootstrappedHabitGraph(): HabitGraph {
  const graph = readHabitGraph();
  if (graph.bootstrapped) return graph;

  const isGym = gymDayReader();
  const kg = readBodyKg();

  const meals = getAllMeals()
    .filter((m) => m.items?.length > 0)
    .sort((a, b) => a.loggedAt - b.loggedAt)
    .slice(-180);
  for (const m of meals) {
    const dayType: DayType = isGym(m.date) ? "gym" : "rest";
    recordMealEvent(graph, {
      eventId: `boot:meal:${m.id}:${m.items.length}`,
      date: m.date,
      mealType: m.mealType,
      at: m.loggedAt,
      dayType,
      items: m.items.map(mealItemToSnapshot),
    });
  }

  const workouts = getAllWorkouts()
    .filter((w) => w.completed)
    .sort((a, b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt))
    .slice(-90);
  for (const w of workouts) {
    const dayType: DayType = isGym(w.date) ? "gym" : "rest";
    recordWorkoutEvent(graph, {
      eventId: `boot:workout:${w.id}`,
      date: w.date,
      at: w.endedAt ?? w.startedAt,
      dayType,
      payload: workoutToPayload(w, kg),
    });
  }

  const activities = getAllActivities()
    .sort((a, b) => a.at - b.at)
    .slice(-90);
  for (const a of activities) {
    const dayType: DayType = isGym(a.date) ? "gym" : "rest";
    recordWorkoutEvent(graph, {
      eventId: `boot:act:${a.id}`,
      date: a.date,
      at: a.at,
      dayType,
      payload: activityToPayload(a, kg),
    });
  }

  graph.bootstrapped = true;
  writeHabitGraph(graph, { emit: false });
  return graph;
}

function consumedMacrosForDate(meals: MealLog[]): { kcal: number; protein: number } {
  let kcal = 0;
  let protein = 0;
  for (const m of meals) {
    for (const it of m.items) {
      if (isCustomItem(it)) {
        kcal += it.kcal;
        protein += it.protein;
      } else {
        const mm = macrosFor(it.id, it.qty);
        kcal += mm.kcal;
        protein += mm.protein;
      }
    }
  }
  return { kcal, protein };
}

export function getMealShadowOffers(opts: {
  date: string;
  hour?: number;
  mealSlot?: MealType;
  currentPlateFoodKeys?: string[];
  limit?: number;
}): ShadowRecommendation[] {
  if (typeof window === "undefined" || !opts.date) return [];
  const graph = ensureBootstrappedHabitGraph();
  const now = Date.now();
  const hour = opts.hour ?? new Date(now).getHours();
  const mealSlot = opts.mealSlot ?? mealSlotForHour(hour);
  const daily = getDaily(opts.date);
  const dayType: DayType = daily.gymDay ? "gym" : "rest";
  const todayMeals = getMealsForDate(opts.date);
  const consumed = consumedMacrosForDate(todayMeals);
  const target = dayTarget(opts.date, { gymDay: daily.gymDay }).target;
  const slotMeals = todayMeals.filter((m) => m.mealType === mealSlot && m.items.length > 0);
  const slotFoodKeys = slotMeals.flatMap((m) => m.items.map((it) => mealItemToSnapshot(it).foodKey));
  const currentPlate = opts.currentPlateFoodKeys ?? slotFoodKeys;

  return scoreMealRecommendations(graph, {
    now,
    hour,
    mealSlot,
    dayType,
    remainingKcal: target.kcal - consumed.kcal,
    remainingProtein: target.protein - consumed.protein,
    kcalTarget: target.kcal,
    proteinTarget: target.protein,
    slotAlreadyLogged: slotMeals.length > 0,
    currentPlateFoodKeys: currentPlate,
    limit: opts.limit ?? 3,
  });
}

export function getWorkoutShadowOffers(opts: {
  date: string;
  hour?: number;
  activeWorkoutId?: string | null;
  limit?: number;
}): ShadowRecommendation[] {
  if (typeof window === "undefined" || !opts.date) return [];
  const graph = ensureBootstrappedHabitGraph();
  const now = Date.now();
  const hour = opts.hour ?? new Date(now).getHours();
  const daily = getDaily(opts.date);
  const dayType: DayType = daily.gymDay ? "gym" : "rest";
  const weekday = weekdayOfKey(opts.date) ?? new Date(now).getDay();
  const workoutDoneToday = getAllWorkouts().some((w) => w.date === opts.date && w.completed);
  const kg = readBodyKg();

  return scoreWorkoutRecommendations(graph, {
    now,
    hour,
    weekday,
    dayType,
    workoutDoneToday,
    activeWorkoutId: opts.activeWorkoutId,
    plannedWorkout: plannedSessionForToday(opts.date, kg),
    fallbackRestActivity: restWalkFallback(kg),
    limit: opts.limit ?? 2,
  });
}

export function getHomeShadowOffers(opts: {
  date: string;
  hour?: number;
  activeWorkoutId?: string | null;
}): ShadowRecommendation[] {
  if (typeof window === "undefined" || !opts.date) return [];
  const meals = getMealShadowOffers({ date: opts.date, hour: opts.hour, limit: 2 });
  const workouts = opts.activeWorkoutId
    ? []
    : getWorkoutShadowOffers({ date: opts.date, hour: opts.hour, limit: 1 });
  const combined: ShadowRecommendation[] = [];
  if (meals[0]) combined.push(meals[0]);
  if (workouts[0]) combined.push(workouts[0]);
  if (meals[1] && combined.length < 3) combined.push(meals[1]);
  return combined;
}

export function acceptMealShadow(
  offer: ShadowRecommendation,
  opts: {
    date: string;
    mealType?: MealType;
    scale?: number;
    customCombo?: HabitComboPayload;
  },
): { mealId: string; stamp: number; kcal: number; protein: number; label: string; slot: MealType } | null {
  const combo = opts.customCombo ?? offer.meal;
  if (!combo || !combo.items.length) return null;
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  const slot = opts.mealType ?? combo.slot;
  const items = combo.items.map((s) => snapshotToMealItem(s, scale));
  const entry = saveMeal({ date: opts.date, mealType: slot, items });
  confirmShadowInGraph(offer.targetNodeId, Date.now());
  return {
    mealId: entry.id,
    stamp: entry.loggedAt,
    kcal: Math.round(combo.kcal * scale),
    protein: round1(combo.protein * scale),
    label: combo.label,
    slot,
  };
}

export function undoAcceptedMealShadow(mealId: string, stamp: number): void {
  const meal = getAllMeals().find((m) => m.id === mealId);
  if (!meal) return;
  updateMealItems(
    meal.id,
    meal.items.filter((i) => i.addedAt !== stamp),
  );
}

export function acceptWorkoutShadow(
  offer: ShadowRecommendation,
  opts: {
    date: string;
    setsScale?: number;
    durationMin?: number;
    steps?: number;
    reps?: number;
    intensity?: Intensity;
  },
): { kind: "session" | "activity"; id: string; title: string; kcal: number } | null {
  const payload = offer.workout;
  if (!payload) return null;
  const kg = readBodyKg();

  if (payload.kind === "activity" && payload.activityKind) {
    const actKind = payload.activityKind as ActivityKey;
    const minutes = opts.durationMin ?? payload.minutes;
    const steps = opts.steps ?? payload.steps;
    const reps = opts.reps ?? payload.reps;
    const intensity = opts.intensity ?? payload.intensity;
    const added = addActivity({
      date: opts.date,
      kind: actKind,
      ...(minutes ? { minutes } : {}),
      ...(steps ? { steps } : {}),
      ...(reps ? { reps } : {}),
      ...(intensity ? { intensity } : {}),
    });
    confirmShadowInGraph(offer.targetNodeId, Date.now());
    const kcal = Math.round(activityKcal(added, kg));
    return { kind: "activity", id: added.id, title: payload.title, kcal };
  }

  const now = Date.now();
  const profile = getProfile();
  const sessionType = (payload.sessionType || "CUSTOM") as SessionType;
  const baseDef = sessionType !== "CUSTOM" ? SESSIONS.find((s) => s.id === sessionType) : null;
  const setsScale = opts.setsScale && opts.setsScale > 0 ? opts.setsScale : 1;

  const defExercises = baseDef?.exercises ?? [];
  const snapshotExercises = payload.exercises ?? [];

  const exercises = (defExercises.length > 0
    ? defExercises
    : snapshotExercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        repsLabel: e.repsLabel,
        targetReps: e.targetReps,
        increment: 2.5,
        restSec: 60,
        primary: ["chest"] as const,
        secondary: [] as const,
      }))
  ).map((ex) => {
    const snap = snapshotExercises.find((s) => s.name === ex.name);
    const last = sessionType !== "CUSTOM" ? getLastSetForExercise(sessionType, ex.name) : null;
    const weight =
      last?.weight ??
      snap?.weightKg ??
      defaultWorkingWeightKg(ex.name, kg, ex.primary, profile.sex);
    const reps = last?.reps ?? snap?.targetReps ?? ex.targetReps ?? 10;
    const setCount = Math.max(1, Math.round((snap?.sets ?? ex.sets) * setsScale));
    return {
      exerciseName: ex.name,
      sets: Array.from({ length: setCount }, (_, idx) => ({
        setNumber: idx + 1,
        weight,
        reps,
        loggedAt: now,
      })),
    };
  });

  const durationMin = opts.durationMin ?? payload.durationMin ?? Math.max(25, exercises.length * 8);
  const session: WorkoutSession = {
    id: crypto.randomUUID(),
    date: opts.date,
    sessionType,
    ...(sessionType === "CUSTOM"
      ? {
          customTemplateId: payload.customTemplateId,
          customName: payload.title,
          customFocus: payload.customFocus || "Sesi bayangan",
        }
      : {}),
    startedAt: now - durationMin * 60_000,
    endedAt: now,
    durationMin,
    completed: true,
    exercises,
  };
  session.totalVolume = workoutVolume(session);
  saveWorkout(session);
  confirmShadowInGraph(offer.targetNodeId, now);
  const kcal = Math.round(workoutBurn(session, kg).total);
  return { kind: "session", id: session.id, title: payload.title, kcal };
}

export function dismissShadowOffer(targetNodeId: string): void {
  dismissShadowInGraph(targetNodeId, Date.now());
}
