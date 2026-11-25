// Pure Real-Time Habit Graph Memory Engine for R2 Fit.
//
// Zero browser APIs, zero React, zero server/DB imports — safe to run in Node
// unit tests, API routes, and client wrappers alike.
//
// Graph schema:
//   Nodes: user | food | meal_combo | meal_slot | time_bucket | day_type | weekday | workout | exercise
//   Edges: EATEN_AT | PAIRED_WITH | TRAINED_ON | CONFIRMED_SHADOW | DISMISSED_SHADOW
//
// Real-time learning:
//   - Exponential time-decay moving frequency on every meal log, workout log,
//     1-tap shadow checkmark (✓), and shadow dismissal (×).
//   - Dismissal cooldown + penalty dampening so rejected suggestions step back
//     immediately and gracefully fade only after cooldown / organic re-logging.
//   - Scoring combines: frequency + recency decay, time-of-day match,
//     meal-slot match, gym-vs-rest day match, weekday match, macro & calorie
//     budget fit, co-logged pairing (PAIRED_WITH), and confirm/dismiss history.

import type { MealType } from "./presets.ts";

export type HabitNodeKind =
  | "user"
  | "food"
  | "meal_combo"
  | "meal_slot"
  | "time_bucket"
  | "day_type"
  | "weekday"
  | "workout"
  | "exercise";

export type HabitEdgeRel =
  | "EATEN_AT"
  | "PAIRED_WITH"
  | "TRAINED_ON"
  | "CONFIRMED_SHADOW"
  | "DISMISSED_SHADOW";

export type TimeBucket =
  | "early_morning"
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "late_night";

export type DayType = "gym" | "rest";

export type HabitFoodSnapshot = {
  /** Stable identifier: ingredient id, catalogue code, or `custom:<normName>`. */
  foodKey: string;
  /** Original store ref when non-custom (`id` in INGREDIENTS). */
  ingredientId?: string;
  name: string;
  grams: number;
  qty?: number;
  unit?: string;
  portionLabel?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
};

export type HabitComboPayload = {
  slot: MealType;
  items: HabitFoodSnapshot[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  label: string;
};

export type HabitExerciseSnapshot = {
  name: string;
  sets: number;
  repsLabel: string;
  targetReps: number;
  weightKg?: number;
};

export type HabitWorkoutPayload = {
  kind: "session" | "activity";
  title: string;
  sessionType?: string;
  customTemplateId?: string;
  customFocus?: string;
  activityKind?: string;
  minutes?: number;
  steps?: number;
  reps?: number;
  intensity?: "santai" | "sedang" | "berat";
  setsCount: number;
  exercisesCount: number;
  durationMin: number;
  estimatedKcal: number;
  exercises?: HabitExerciseSnapshot[];
};

export type HabitNode = {
  id: string;
  kind: HabitNodeKind;
  label: string;
  reinforcements: number;
  createdAt: number;
  updatedAt: number;
  payload?: HabitFoodSnapshot | HabitComboPayload | HabitWorkoutPayload | Record<string, unknown>;
};

export type HabitEdge = {
  src: string;
  rel: HabitEdgeRel;
  dst: string;
  weight: number;
  count: number;
  createdAt: number;
  updatedAt: number;
  cooldownUntil?: number;
  consecutiveDismissals?: number;
};

export type HabitGraph = {
  version: 1;
  userKey: string;
  nodes: Record<string, HabitNode>;
  edges: Record<string, HabitEdge>;
  seenEventIds: string[];
  bootstrapped: boolean;
  updatedAt: number;
};

export type HabitMealEvent = {
  eventId?: string;
  date: string;
  mealType: MealType;
  at: number;
  hour?: number;
  dayType: DayType;
  items: HabitFoodSnapshot[];
};

export type HabitWorkoutEvent = {
  eventId?: string;
  date: string;
  at: number;
  hour?: number;
  weekday?: number;
  dayType: DayType;
  payload: HabitWorkoutPayload;
};

export type ShadowKind = "meal_combo" | "food" | "paired_addon" | "workout" | "activity";

export type ShadowRecommendation = {
  id: string;
  targetNodeId: string;
  kind: ShadowKind;
  title: string;
  badge: string;
  reason: string;
  frequencyCount: number;
  confidence: number;
  score: number;
  meal?: HabitComboPayload;
  workout?: HabitWorkoutPayload;
};

export type MealShadowContext = {
  now: number;
  hour: number;
  mealSlot: MealType;
  dayType: DayType;
  remainingKcal: number;
  remainingProtein: number;
  kcalTarget: number;
  proteinTarget: number;
  /** True when the current mealSlot already has items logged today. */
  slotAlreadyLogged?: boolean;
  /** Food keys currently logged in this slot today or sitting in tray. */
  currentPlateFoodKeys?: string[];
  /** Food keys already logged anywhere today (optional tie context). */
  todayLoggedFoodKeys?: string[];
  limit?: number;
};

export type WorkoutShadowContext = {
  now: number;
  hour: number;
  weekday: number;
  dayType: DayType;
  workoutDoneToday?: boolean;
  activeWorkoutId?: string | null;
  /** Optional fallback session from user's weekly split for cold-start/hybrid. */
  plannedWorkout?: HabitWorkoutPayload | null;
  /** Optional cold-start active-recovery activity on rest days. */
  fallbackRestActivity?: HabitWorkoutPayload | null;
  limit?: number;
};

// ─── Constants & Decay Math ──────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const FOOD_HALF_LIFE_DAYS = 14;
export const WORKOUT_HALF_LIFE_DAYS = 21;
export const CONFIRM_HALF_LIFE_DAYS = 21;
export const DISMISS_HALF_LIFE_DAYS = 4;

const MAX_FOOD_NODES = 220;
const MAX_COMBO_NODES = 120;
const MAX_WORKOUT_NODES = 60;
const MAX_EXERCISE_NODES = 160;
const MAX_SEEN_EVENTS = 250;

export const TIME_BUCKETS: TimeBucket[] = [
  "early_morning",
  "morning",
  "midday",
  "afternoon",
  "evening",
  "late_night",
];

const BUCKET_LABEL: Record<TimeBucket, string> = {
  early_morning: "pagi buta",
  morning: "pagi",
  midday: "siang",
  afternoon: "sore",
  evening: "malam",
  late_night: "larut malam",
};

const SLOT_LABEL: Record<MealType, string> = {
  breakfast: "Sarapan",
  lunch: "Makan siang",
  snack: "Camilan",
  dinner: "Makan malam",
};

const SLOT_COHERENT_BUCKETS: Record<MealType, readonly TimeBucket[]> = {
  breakfast: ["early_morning", "morning"],
  lunch: ["midday", "afternoon"],
  snack: ["morning", "afternoon", "evening", "late_night"],
  dinner: ["evening", "late_night"],
};

const CONDIMENT_WORD_RE =
  /\b(sauce|saus|kecap|sambal|sambel|oil|minyak|dressing|mayo|mayonnaise|mayones|mustard|ketchup|vinegar|cuka|garam|salt|pepper|lada|merica|bumbu|seasoning|syrup|sirup|selai|jam|mentega|butter|margarine|margarin|gravy|chutney|tare|ponzu|dipping)\b/i;

const CONDIMENT_LEAD_RE =
  /^(?:extra\s+|creamy\s+|sweet\s+|spicy\s+|garlic\s+|chili\s+|chilli\s+|sesame\s+|soy\s+|oyster\s+|peanut\s+|salad\s+|cheese\s+|bbq\s+)?(sauce|saus|kecap|sambal|sambel|oil|minyak|dressing|mayo|mayonnaise|mayones|bumbu|dip|gravy|ketchup|mustard)\b/i;

/**
 * True for standalone sauces, oils, dips, and tiny (<50g / <95kcal) condiment
 * entries that should not be recommended on an empty tray — only surfaced as
 * PAIRED_WITH add-ons once a main food is already on the plate.
 */
export function isCondimentLikeFood(
  food: Pick<HabitFoodSnapshot, "name" | "grams" | "kcal">,
): boolean {
  const name = (food.name ?? "").trim();
  if (!name) return false;
  if (CONDIMENT_LEAD_RE.test(name)) return true;
  if (!CONDIMENT_WORD_RE.test(name)) return false;
  const grams = Number(food.grams) || 0;
  const kcal = Number(food.kcal) || 0;
  if (grams > 0 && grams < 50) return true;
  if (grams === 0 && kcal <= 95) return true;
  return false;
}

const WEEKDAY_LABEL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function timeBucketForHour(hour: number): TimeBucket {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 4 && h < 7) return "early_morning";
  if (h >= 7 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "midday";
  if (h >= 14 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "late_night";
}

export function timeBucketProximity(a: TimeBucket, b: TimeBucket): number {
  if (a === b) return 1.0;
  const ia = TIME_BUCKETS.indexOf(a);
  const ib = TIME_BUCKETS.indexOf(b);
  const n = TIME_BUCKETS.length;
  const dist = Math.min((ia - ib + n) % n, (ib - ia + n) % n);
  if (dist === 1) return 0.55;
  if (dist === 2) return 0.18;
  return 0.05;
}

export function decayWeight(weight: number, ageDays: number, halfLifeDays: number): number {
  if (!(weight > 0) || !Number.isFinite(weight)) return 0;
  const d = Math.max(0, ageDays);
  return weight * Math.pow(2, -d / Math.max(0.5, halfLifeDays));
}

function decayedEdgeWeight(edge: HabitEdge | undefined, now: number, halfLifeDays: number): number {
  if (!edge) return 0;
  return decayWeight(edge.weight, Math.max(0, (now - edge.updatedAt) / DAY_MS), halfLifeDays);
}

function edgeKey(src: string, rel: HabitEdgeRel, dst: string): string {
  return `${src}|${rel}|${dst}`;
}

export function userNodeId(userKey = "default"): string {
  return `user:${userKey.trim().toLowerCase() || "default"}`;
}

export function foodNodeId(foodKey: string): string {
  return foodKey.startsWith("food:") ? foodKey : `food:${foodKey}`;
}

export function comboNodeId(slot: MealType, items: Pick<HabitFoodSnapshot, "foodKey">[]): string {
  const keys = [...new Set(items.map((i) => i.foodKey).filter(Boolean))].sort();
  return `combo:${slot}:${keys.join("+")}`;
}

export function workoutNodeId(p: Pick<HabitWorkoutPayload, "kind" | "sessionType" | "customTemplateId" | "activityKind" | "title">): string {
  if (p.kind === "activity") {
    return `workout:act:${(p.activityKind || p.title).toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}`;
  }
  if (p.sessionType === "CUSTOM" && p.customTemplateId) {
    return `workout:custom:${p.customTemplateId}`;
  }
  return `workout:${p.sessionType || p.title.toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}`;
}

function exerciseNodeId(name: string): string {
  return `exercise:${name.trim().toLowerCase()}`;
}

export function createHabitGraph(userKey = "default", now = Date.now()): HabitGraph {
  const uid = userNodeId(userKey);
  return {
    version: 1,
    userKey,
    nodes: {
      [uid]: {
        id: uid,
        kind: "user",
        label: userKey,
        reinforcements: 1,
        createdAt: now,
        updatedAt: now,
      },
    },
    edges: {},
    seenEventIds: [],
    bootstrapped: false,
    updatedAt: now,
  };
}

export function normalizeHabitGraph(raw: unknown, fallbackUserKey = "default"): HabitGraph {
  if (!raw || typeof raw !== "object") return createHabitGraph(fallbackUserKey);
  const g = raw as Partial<HabitGraph>;
  const userKey = typeof g.userKey === "string" && g.userKey ? g.userKey : fallbackUserKey;
  const out = createHabitGraph(userKey, typeof g.updatedAt === "number" ? g.updatedAt : Date.now());
  out.bootstrapped = g.bootstrapped === true;
  if (Array.isArray(g.seenEventIds)) {
    out.seenEventIds = g.seenEventIds
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .slice(-MAX_SEEN_EVENTS);
  }
  if (g.nodes && typeof g.nodes === "object" && !Array.isArray(g.nodes)) {
    for (const [id, n] of Object.entries(g.nodes)) {
      if (!n || typeof n !== "object" || typeof n.id !== "string" || typeof n.kind !== "string") continue;
      out.nodes[id] = {
        id: n.id,
        kind: n.kind,
        label: typeof n.label === "string" ? n.label : n.id,
        reinforcements: Number.isFinite(n.reinforcements) && n.reinforcements >= 0 ? n.reinforcements : 1,
        createdAt: Number.isFinite(n.createdAt) ? n.createdAt : out.updatedAt,
        updatedAt: Number.isFinite(n.updatedAt) ? n.updatedAt : out.updatedAt,
        ...(n.payload ? { payload: n.payload } : {}),
      };
    }
  }
  if (g.edges && typeof g.edges === "object" && !Array.isArray(g.edges)) {
    for (const [k, e] of Object.entries(g.edges)) {
      if (!e || typeof e !== "object" || typeof e.src !== "string" || typeof e.rel !== "string" || typeof e.dst !== "string") continue;
      if (!Number.isFinite(e.weight) || !Number.isFinite(e.count)) continue;
      out.edges[k] = {
        src: e.src,
        rel: e.rel,
        dst: e.dst,
        weight: Math.max(0, e.weight),
        count: Math.max(0, e.count),
        createdAt: Number.isFinite(e.createdAt) ? e.createdAt : out.updatedAt,
        updatedAt: Number.isFinite(e.updatedAt) ? e.updatedAt : out.updatedAt,
        ...(Number.isFinite(e.cooldownUntil) ? { cooldownUntil: e.cooldownUntil } : {}),
        ...(Number.isFinite(e.consecutiveDismissals) ? { consecutiveDismissals: e.consecutiveDismissals } : {}),
      };
    }
  }
  return out;
}

function upsertNode(
  g: HabitGraph,
  id: string,
  kind: HabitNodeKind,
  label: string,
  at: number,
  payload?: HabitNode["payload"],
  incrementReinforcement = true,
): HabitNode {
  const prev = g.nodes[id];
  const node: HabitNode = prev
    ? {
        ...prev,
        label: label || prev.label,
        reinforcements: incrementReinforcement ? prev.reinforcements + 1 : prev.reinforcements,
        updatedAt: Math.max(prev.updatedAt, at),
        payload: payload ?? prev.payload,
      }
    : {
        id,
        kind,
        label,
        reinforcements: 1,
        createdAt: at,
        updatedAt: at,
        ...(payload ? { payload } : {}),
      };
  g.nodes[id] = node;
  return node;
}

function reinforceEdge(
  g: HabitGraph,
  src: string,
  rel: HabitEdgeRel,
  dst: string,
  deltaWeight: number,
  at: number,
  halfLifeDays: number,
): HabitEdge {
  const k = edgeKey(src, rel, dst);
  const prev = g.edges[k];
  if (!prev) {
    const e: HabitEdge = {
      src,
      rel,
      dst,
      weight: deltaWeight,
      count: 1,
      createdAt: at,
      updatedAt: at,
    };
    g.edges[k] = e;
    return e;
  }
  const ageDays = Math.max(0, (at - prev.updatedAt) / DAY_MS);
  const decayed = decayWeight(prev.weight, ageDays, halfLifeDays);
  const next: HabitEdge = {
    ...prev,
    weight: decayed + deltaWeight,
    count: prev.count + 1,
    updatedAt: Math.max(prev.updatedAt, at),
  };
  g.edges[k] = next;
  return next;
}

function markSeen(g: HabitGraph, eventId?: string): boolean {
  if (!eventId) return false;
  if (g.seenEventIds.includes(eventId)) return true;
  g.seenEventIds.push(eventId);
  if (g.seenEventIds.length > MAX_SEEN_EVENTS) {
    g.seenEventIds.splice(0, g.seenEventIds.length - MAX_SEEN_EVENTS);
  }
  return false;
}

function ensureContextNodes(g: HabitGraph, opts: {
  at: number;
  slot?: MealType;
  bucket: TimeBucket;
  dayType: DayType;
  weekday?: number;
}) {
  upsertNode(g, `time:${opts.bucket}`, "time_bucket", BUCKET_LABEL[opts.bucket], opts.at, undefined, false);
  upsertNode(g, `day:${opts.dayType}`, "day_type", opts.dayType === "gym" ? "Hari latihan" : "Hari istirahat", opts.at, undefined, false);
  if (opts.slot) {
    upsertNode(g, `slot:${opts.slot}`, "meal_slot", SLOT_LABEL[opts.slot], opts.at, undefined, false);
  }
  if (typeof opts.weekday === "number" && opts.weekday >= 0 && opts.weekday <= 6) {
    upsertNode(g, `dow:${opts.weekday}`, "weekday", WEEKDAY_LABEL[opts.weekday], opts.at, undefined, false);
  }
}

function formatComboLabel(items: HabitFoodSnapshot[]): string {
  const names = [...new Set(items.map((i) => i.name.trim()).filter(Boolean))];
  if (names.length === 0) return "Makanan";
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} + ${names[1]} + ${names.length - 2} lainnya`;
}

function pruneKind(g: HabitGraph, kind: HabitNodeKind, maxKeep: number, now: number, halfLifeDays: number) {
  const nodes = Object.values(g.nodes).filter((n) => n.kind === kind);
  if (nodes.length <= maxKeep) return;
  const scored = nodes
    .map((n) => ({
      id: n.id,
      keepScore: decayWeight(n.reinforcements, Math.max(0, (now - n.updatedAt) / DAY_MS), halfLifeDays),
    }))
    .sort((a, b) => b.keepScore - a.keepScore);
  const drop = new Set(scored.slice(maxKeep).map((x) => x.id));
  for (const id of drop) delete g.nodes[id];
  for (const [ek, e] of Object.entries(g.edges)) {
    if (drop.has(e.src) || drop.has(e.dst)) delete g.edges[ek];
  }
}

function hourFromTimestamp(at: number): number {
  return new Date(at).getHours();
}

function weekdayFromDateOrAt(date: string, at: number): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  }
  return new Date(at).getDay();
}

// ─── Real-Time Event Ingestion ───────────────────────────────────────────────

export function recordMealEvent(graph: HabitGraph, event: HabitMealEvent): HabitGraph {
  if (!event.items.length) return graph;
  if (markSeen(graph, event.eventId)) return graph;

  const at = Number.isFinite(event.at) ? event.at : Date.now();
  const hour = event.hour ?? hourFromTimestamp(at);
  const bucket = timeBucketForHour(hour);
  ensureContextNodes(graph, { at, slot: event.mealType, bucket, dayType: event.dayType });

  // Merge duplicate foodKeys within the same logged meal cleanly.
  const merged = new Map<string, HabitFoodSnapshot>();
  for (const item of event.items) {
    if (!item.foodKey || !item.name) continue;
    const prev = merged.get(item.foodKey);
    if (!prev) {
      merged.set(item.foodKey, { ...item });
    } else {
      merged.set(item.foodKey, {
        ...prev,
        grams: prev.grams + item.grams,
        qty: (prev.qty ?? 1) + (item.qty ?? 1),
        kcal: prev.kcal + item.kcal,
        protein: prev.protein + item.protein,
        carbs: prev.carbs + item.carbs,
        fat: prev.fat + item.fat,
        sugar: (prev.sugar ?? 0) + (item.sugar ?? 0),
      });
    }
  }
  const items = [...merged.values()];
  if (!items.length) return graph;

  const foodIds: string[] = [];
  for (const it of items) {
    const fid = foodNodeId(it.foodKey);
    foodIds.push(fid);
    upsertNode(graph, fid, "food", it.name, at, it, true);
    reinforceEdge(graph, fid, "EATEN_AT", `slot:${event.mealType}`, 1.0, at, FOOD_HALF_LIFE_DAYS);
    reinforceEdge(graph, fid, "EATEN_AT", `time:${bucket}`, 1.0, at, FOOD_HALF_LIFE_DAYS);
    reinforceEdge(graph, fid, "EATEN_AT", `day:${event.dayType}`, 0.85, at, FOOD_HALF_LIFE_DAYS);
  }

  // Co-logged PAIRED_WITH edges between distinct foods in the same meal
  for (let i = 0; i < foodIds.length; i++) {
    for (let j = i + 1; j < foodIds.length; j++) {
      const a = foodIds[i] < foodIds[j] ? foodIds[i] : foodIds[j];
      const b = foodIds[i] < foodIds[j] ? foodIds[j] : foodIds[i];
      reinforceEdge(graph, a, "PAIRED_WITH", b, 0.85, at, FOOD_HALF_LIFE_DAYS);
      reinforceEdge(graph, b, "PAIRED_WITH", a, 0.85, at, FOOD_HALF_LIFE_DAYS);
    }
  }

  // Meal combo node (captures multi-item habits like Oat + Whey + Egg, or single-dish meals)
  const cid = comboNodeId(event.mealType, items);
  const comboPayload: HabitComboPayload = {
    slot: event.mealType,
    items,
    label: formatComboLabel(items),
    kcal: Math.round(items.reduce((s, i) => s + i.kcal, 0)),
    protein: Math.round(items.reduce((s, i) => s + i.protein, 0) * 10) / 10,
    carbs: Math.round(items.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
    fat: Math.round(items.reduce((s, i) => s + i.fat, 0) * 10) / 10,
    sugar: Math.round(items.reduce((s, i) => s + (i.sugar ?? 0), 0) * 10) / 10,
  };
  upsertNode(graph, cid, "meal_combo", comboPayload.label, at, comboPayload, true);
  reinforceEdge(graph, cid, "EATEN_AT", `slot:${event.mealType}`, 1.0, at, FOOD_HALF_LIFE_DAYS);
  reinforceEdge(graph, cid, "EATEN_AT", `time:${bucket}`, 1.0, at, FOOD_HALF_LIFE_DAYS);
  reinforceEdge(graph, cid, "EATEN_AT", `day:${event.dayType}`, 0.85, at, FOOD_HALF_LIFE_DAYS);

  graph.updatedAt = Math.max(graph.updatedAt, at);
  pruneKind(graph, "food", MAX_FOOD_NODES, at, FOOD_HALF_LIFE_DAYS);
  pruneKind(graph, "meal_combo", MAX_COMBO_NODES, at, FOOD_HALF_LIFE_DAYS);
  return graph;
}

export function recordWorkoutEvent(graph: HabitGraph, event: HabitWorkoutEvent): HabitGraph {
  if (markSeen(graph, event.eventId)) return graph;
  const at = Number.isFinite(event.at) ? event.at : Date.now();
  const hour = event.hour ?? hourFromTimestamp(at);
  const bucket = timeBucketForHour(hour);
  const weekday = event.weekday ?? weekdayFromDateOrAt(event.date, at);

  ensureContextNodes(graph, { at, bucket, dayType: event.dayType, weekday });

  const wid = workoutNodeId(event.payload);
  upsertNode(graph, wid, "workout", event.payload.title, at, event.payload, true);
  reinforceEdge(graph, wid, "TRAINED_ON", `day:${event.dayType}`, 1.0, at, WORKOUT_HALF_LIFE_DAYS);
  reinforceEdge(graph, wid, "TRAINED_ON", `dow:${weekday}`, 1.15, at, WORKOUT_HALF_LIFE_DAYS);
  reinforceEdge(graph, wid, "TRAINED_ON", `time:${bucket}`, 0.9, at, WORKOUT_HALF_LIFE_DAYS);

  for (const ex of event.payload.exercises ?? []) {
    if (!ex.name) continue;
    const eid = exerciseNodeId(ex.name);
    upsertNode(graph, eid, "exercise", ex.name, at, ex, true);
    reinforceEdge(graph, eid, "TRAINED_ON", `day:${event.dayType}`, 0.75, at, WORKOUT_HALF_LIFE_DAYS);
    reinforceEdge(graph, eid, "TRAINED_ON", `dow:${weekday}`, 0.85, at, WORKOUT_HALF_LIFE_DAYS);
    reinforceEdge(graph, eid, "TRAINED_ON", `time:${bucket}`, 0.65, at, WORKOUT_HALF_LIFE_DAYS);
  }

  graph.updatedAt = Math.max(graph.updatedAt, at);
  pruneKind(graph, "workout", MAX_WORKOUT_NODES, at, WORKOUT_HALF_LIFE_DAYS);
  pruneKind(graph, "exercise", MAX_EXERCISE_NODES, at, WORKOUT_HALF_LIFE_DAYS);
  return graph;
}

export function recordShadowConfirm(
  graph: HabitGraph,
  targetNodeId: string,
  at = Date.now(),
): HabitGraph {
  const uid = userNodeId(graph.userKey);
  upsertNode(graph, uid, "user", graph.userKey, at, undefined, false);
  reinforceEdge(graph, uid, "CONFIRMED_SHADOW", targetNodeId, 1.5, at, CONFIRM_HALF_LIFE_DAYS);

  // Confirming overrides any active dismissal cooldown on that target.
  const dk = edgeKey(uid, "DISMISSED_SHADOW", targetNodeId);
  const dis = graph.edges[dk];
  if (dis) {
    graph.edges[dk] = {
      ...dis,
      weight: dis.weight * 0.25,
      consecutiveDismissals: 0,
      cooldownUntil: 0,
    };
  }
  const target = graph.nodes[targetNodeId];
  if (target) target.updatedAt = Math.max(target.updatedAt, at);
  graph.updatedAt = Math.max(graph.updatedAt, at);
  return graph;
}

export function recordShadowDismiss(
  graph: HabitGraph,
  targetNodeId: string,
  at = Date.now(),
  baseCooldownHours = 12,
): HabitGraph {
  const uid = userNodeId(graph.userKey);
  upsertNode(graph, uid, "user", graph.userKey, at, undefined, false);
  const dk = edgeKey(uid, "DISMISSED_SHADOW", targetNodeId);
  const prev = graph.edges[dk];
  const streak = (prev?.consecutiveDismissals ?? 0) + 1;
  const cooldownHours = Math.min(96, baseCooldownHours * Math.pow(2, Math.min(3, streak - 1)));
  const e = reinforceEdge(graph, uid, "DISMISSED_SHADOW", targetNodeId, 1.0, at, DISMISS_HALF_LIFE_DAYS);
  e.consecutiveDismissals = streak;
  e.cooldownUntil = at + cooldownHours * HOUR_MS;
  graph.updatedAt = Math.max(graph.updatedAt, at);
  return graph;
}

// ─── Scoring & Recommendations ───────────────────────────────────────────────

function edgeSumByPrefix(
  graph: HabitGraph,
  src: string,
  rel: HabitEdgeRel,
  dstPrefix: string,
  now: number,
  halfLifeDays: number,
): { total: number; maxCount: number; byDst: Record<string, { weight: number; count: number }> } {
  let total = 0;
  let maxCount = 0;
  const byDst: Record<string, { weight: number; count: number }> = {};
  for (const e of Object.values(graph.edges)) {
    if (e.src !== src || e.rel !== rel || !e.dst.startsWith(dstPrefix)) continue;
    const w = decayedEdgeWeight(e, now, halfLifeDays);
    total += w;
    if (e.count > maxCount) maxCount = e.count;
    byDst[e.dst] = { weight: w, count: e.count };
  }
  return { total, maxCount, byDst };
}

function feedbackFactor(graph: HabitGraph, targetNodeId: string, now: number): {
  blocked: boolean;
  multiplier: number;
  confirmCount: number;
} {
  const uid = userNodeId(graph.userKey);
  const dismiss = graph.edges[edgeKey(uid, "DISMISSED_SHADOW", targetNodeId)];
  if (dismiss?.cooldownUntil && now < dismiss.cooldownUntil) {
    return { blocked: true, multiplier: 0, confirmCount: 0 };
  }
  const confirm = graph.edges[edgeKey(uid, "CONFIRMED_SHADOW", targetNodeId)];
  const cw = decayedEdgeWeight(confirm, now, CONFIRM_HALF_LIFE_DAYS);
  const dw = decayedEdgeWeight(dismiss, now, DISMISS_HALF_LIFE_DAYS);
  const boost = 1 + Math.min(0.65, cw * 0.22);
  const dampen = 1 / (1 + dw * 0.65);
  return {
    blocked: false,
    multiplier: boost * dampen,
    confirmCount: confirm?.count ?? 0,
  };
}

/** Macro + calorie budget fit multiplier in ~[0.45, 1.38]. */
export function macroBudgetFit(
  kcal: number,
  protein: number,
  ctx: Pick<MealShadowContext, "remainingKcal" | "remainingProtein" | "kcalTarget" | "proteinTarget">,
): number {
  const remK = ctx.remainingKcal;
  const remP = ctx.remainingProtein;
  let fit = 1.0;

  if (ctx.kcalTarget > 0) {
    if (remK <= 150) {
      // Budget is nearly full or exceeded: prefer light / high-protein picks.
      if (kcal <= 220 && protein >= 15) fit += 0.22;
      else if (kcal > 400) fit -= Math.min(0.45, (kcal - 350) / 700);
    } else if (kcal <= remK * 1.1) {
      // Fits comfortably inside remaining calorie budget.
      const utilization = Math.min(1, kcal / Math.max(150, remK));
      fit += 0.16 * (0.4 + 0.6 * (1 - Math.abs(utilization - 0.55)));
    } else {
      // Overshoots remaining budget.
      const over = (kcal - remK) / Math.max(250, ctx.kcalTarget * 0.35);
      fit -= Math.min(0.42, over * 0.32);
    }
  }

  // Protein gap alignment: when protein is still needed, reward protein density.
  if (remP >= 15 && protein > 0) {
    const cover = Math.min(1, protein / remP);
    const density = kcal > 0 ? Math.min(1, (protein * 4) / kcal) : 0.5;
    fit += 0.2 * (0.55 * cover + 0.45 * density);
  }

  return Math.max(0.45, Math.min(1.4, fit));
}

function foodPortionLabel(f: HabitFoodSnapshot): string {
  if (f.portionLabel) return f.portionLabel;
  if (f.grams > 0) return `${Math.round(f.grams)} g`;
  if (f.unit) return f.unit;
  return "1 porsi";
}

function pickCoherentTimeBucket(
  slot: MealType,
  currentBucket: TimeBucket,
  timesByDst: Record<string, { weight: number; count: number }>,
): TimeBucket | null {
  const coherent = new Set(SLOT_COHERENT_BUCKETS[slot]);
  let bestRecorded: TimeBucket | null = null;
  let bestWeight = -1;
  for (const [dst, val] of Object.entries(timesByDst)) {
    const b = dst.slice(5) as TimeBucket;
    if (coherent.has(b) && val.weight > bestWeight) {
      bestWeight = val.weight;
      bestRecorded = b;
    }
  }
  if (bestRecorded) return bestRecorded;
  return coherent.has(currentBucket) ? currentBucket : null;
}

function comboFrequencyLabel(
  count: number,
  slot: MealType,
  coherentBucket: TimeBucket | null,
  isPair: boolean,
  pairBase?: string,
  slotCount = 0,
): {
  badge: string;
  reason: string;
} {
  if (isPair && pairBase) {
    return {
      badge: "Sering ditambah",
      reason: `Sering bareng ${pairBase}${count > 1 ? ` · ${count}×` : ""}`,
    };
  }
  const slotWord = SLOT_LABEL[slot];
  if (coherentBucket) {
    if (count >= 3) {
      return {
        badge: `${slotWord} biasanya`,
        reason: `Biasanya jam ${BUCKET_LABEL[coherentBucket]} · ${count}× tercatat`,
      };
    }
    if (count === 2) {
      return {
        badge: `Sering di ${slotWord.toLowerCase()}`,
        reason: `Sering jam ${BUCKET_LABEL[coherentBucket]} · ${count}×`,
      };
    }
    return {
      badge: `Cocok untuk ${slotWord.toLowerCase()}`,
      reason:
        slotCount > 0
          ? `Pernah dicatat jam ${BUCKET_LABEL[coherentBucket]}`
          : `Pas untuk ${slotWord.toLowerCase()} · jam ${BUCKET_LABEL[coherentBucket]}`,
    };
  }

  // Fallback when current clock or recorded time disagrees with the selected slot
  // (e.g. checking "Makan siang" late at night) — never emit contradictory time copy.
  if (count >= 3) {
    return {
      badge: `${slotWord} andalan`,
      reason: `${count}× tercatat di riwayatmu`,
    };
  }
  if (count === 2) {
    return {
      badge: `Sering di ${slotWord.toLowerCase()}`,
      reason: `Pernah dicatat ${count}× untuk ${slotWord.toLowerCase()}`,
    };
  }
  return {
    badge: `Cocok untuk ${slotWord.toLowerCase()}`,
    reason:
      slotCount > 0
        ? `Pernah dicatat untuk ${slotWord.toLowerCase()}`
        : `Sesuai porsi ${slotWord.toLowerCase()}`,
  };
}

export function scoreMealRecommendations(
  graph: HabitGraph,
  ctx: MealShadowContext,
): ShadowRecommendation[] {
  const limit = ctx.limit ?? 3;
  const now = ctx.now;
  const currentBucket = timeBucketForHour(ctx.hour);
  const currentPlate = new Set(ctx.currentPlateFoodKeys ?? []);
  const plateFoodNodeIds = [...currentPlate].map(foodNodeId);
  const hasPlateFood = currentPlate.size > 0;

  const candidates: ShadowRecommendation[] = [];

  // 1. Score multi-item / meal_combo nodes when slot is NOT yet logged (or tray is empty)
  for (const node of Object.values(graph.nodes)) {
    if (node.kind !== "meal_combo" || !node.payload) continue;
    const payload = node.payload as HabitComboPayload;
    if (!payload.items?.length) continue;
    // Empty tray should never recommend a condiment-only entry.
    if (!hasPlateFood && payload.items.every((it) => isCondimentLikeFood(it))) continue;

    const fb = feedbackFactor(graph, node.id, now);
    if (fb.blocked) continue;

    const comboKeys = payload.items.map((i) => i.foodKey);
    // Avoid re-suggesting the exact meal already sitting on the plate/slot today.
    if (currentPlate.size > 0 && comboKeys.every((k) => currentPlate.has(k))) continue;

    const slots = edgeSumByPrefix(graph, node.id, "EATEN_AT", "slot:", now, FOOD_HALF_LIFE_DAYS);
    const times = edgeSumByPrefix(graph, node.id, "EATEN_AT", "time:", now, FOOD_HALF_LIFE_DAYS);
    const days = edgeSumByPrefix(graph, node.id, "EATEN_AT", "day:", now, FOOD_HALF_LIFE_DAYS);

    const slotW = slots.byDst[`slot:${ctx.mealSlot}`]?.weight ?? 0;
    const slotCount = slots.byDst[`slot:${ctx.mealSlot}`]?.count ?? 0;
    const slotShare = slots.total > 0 ? (slotW + 0.15) / (slots.total + 0.6) : 0.25;
    // Skip combos that clearly belong to a different meal slot if slot has 0 evidence and another slot dominates.
    if (slotW === 0 && slots.total > 1.8) continue;

    let timeFit = 0.2;
    if (times.total > 0) {
      let weightedProx = 0;
      for (const [dst, val] of Object.entries(times.byDst)) {
        const b = dst.slice(5) as TimeBucket;
        weightedProx += val.weight * timeBucketProximity(currentBucket, b);
      }
      timeFit = weightedProx / times.total;
    }

    const dayW = days.byDst[`day:${ctx.dayType}`]?.weight ?? 0;
    const dayFit = days.total > 0 ? 0.65 + 0.35 * (dayW / days.total) : 0.8;

    const freqW = slotW + (times.byDst[`time:${currentBucket}`]?.weight ?? 0) * 0.5;
    const freqSat = freqW / (freqW + 2.2);
    const budget = macroBudgetFit(payload.kcal, payload.protein, ctx);

    const rawScore =
      (0.45 * freqSat + 0.25 * slotShare + 0.2 * timeFit + 0.1 * dayFit) *
      dayFit *
      budget *
      fb.multiplier *
      (ctx.slotAlreadyLogged ? 0.68 : 1.0);

    const count = Math.max(slotCount, node.reinforcements);
    const coherentBucket = pickCoherentTimeBucket(ctx.mealSlot, currentBucket, times.byDst);
    const { badge, reason } = comboFrequencyLabel(
      count,
      ctx.mealSlot,
      coherentBucket,
      false,
      undefined,
      slotCount,
    );
    const budgetHint =
      ctx.remainingProtein >= 20 && payload.protein >= 20
        ? `${reason} · pas ${Math.round(payload.protein)} g protein`
        : reason;

    candidates.push({
      id: `shadow:${node.id}`,
      targetNodeId: node.id,
      kind: "meal_combo",
      title: payload.label,
      badge,
      reason: budgetHint,
      frequencyCount: count,
      confidence: Math.min(0.99, Math.round(rawScore * 100) / 100),
      score: rawScore,
      meal: { ...payload, slot: ctx.mealSlot },
    });
  }

  // 2. Score individual food nodes — especially strong for PAIRED_WITH add-ons or single snacks
  for (const node of Object.values(graph.nodes)) {
    if (node.kind !== "food" || !node.payload) continue;
    const food = node.payload as HabitFoodSnapshot;
    if (currentPlate.has(food.foodKey)) continue;

    const fb = feedbackFactor(graph, node.id, now);
    if (fb.blocked) continue;

    const slots = edgeSumByPrefix(graph, node.id, "EATEN_AT", "slot:", now, FOOD_HALF_LIFE_DAYS);
    const times = edgeSumByPrefix(graph, node.id, "EATEN_AT", "time:", now, FOOD_HALF_LIFE_DAYS);
    const days = edgeSumByPrefix(graph, node.id, "EATEN_AT", "day:", now, FOOD_HALF_LIFE_DAYS);

    const slotW = slots.byDst[`slot:${ctx.mealSlot}`]?.weight ?? 0;
    const slotCount = slots.byDst[`slot:${ctx.mealSlot}`]?.count ?? 0;

    // Co-occurrence via PAIRED_WITH edges with what's already on the plate/slot!
    let bestPairWeight = 0;
    let bestPairCount = 0;
    let bestPairName = "";
    for (const plateNodeId of plateFoodNodeIds) {
      const pe = graph.edges[edgeKey(plateNodeId, "PAIRED_WITH", node.id)];
      if (!pe) continue;
      const pw = decayedEdgeWeight(pe, now, FOOD_HALF_LIFE_DAYS);
      if (pw > bestPairWeight) {
        bestPairWeight = pw;
        bestPairCount = pe.count;
        bestPairName = graph.nodes[plateNodeId]?.label ?? "";
      }
    }
    const isPaired = bestPairWeight > 0.35;
    // Skip standalone sauces/condiments on an empty tray; only allow them as pairings
    // when a main food is already in the tray/plate.
    if (isCondimentLikeFood(food) && (!hasPlateFood || !isPaired)) continue;
    // Skip single foods that belong clearly to another meal slot unless paired.
    if (!isPaired && slotW === 0 && slots.total > 1.8) continue;

    // When a full combo wasn't logged yet, single foods slightly trail combos unless strongly paired or higher frequency.
    let timeFit = 0.2;
    if (times.total > 0) {
      let wp = 0;
      for (const [dst, val] of Object.entries(times.byDst)) {
        wp += val.weight * timeBucketProximity(currentBucket, dst.slice(5) as TimeBucket);
      }
      timeFit = wp / times.total;
    }
    const dayW = days.byDst[`day:${ctx.dayType}`]?.weight ?? 0;
    const dayFit = days.total > 0 ? 0.65 + 0.35 * (dayW / days.total) : 0.8;

    const pairSat = bestPairWeight / (bestPairWeight + 1.4);
    const freqSat = slotW / (slotW + 2.4);
    const budget = macroBudgetFit(food.kcal, food.protein, ctx);

    const baseScore = isPaired
      ? (0.48 * pairSat + 0.27 * freqSat + 0.15 * timeFit + 0.1 * dayFit) * 1.12
      : (0.42 * freqSat + 0.25 * (slots.total > 0 ? slotW / slots.total : 0.2) + 0.23 * timeFit + 0.1 * dayFit) * 0.86;

    const rawScore = baseScore * budget * fb.multiplier;
    const count = isPaired ? Math.max(bestPairCount, slotCount) : Math.max(slotCount, node.reinforcements);
    const coherentBucket = pickCoherentTimeBucket(ctx.mealSlot, currentBucket, times.byDst);
    const { badge, reason } = comboFrequencyLabel(
      count,
      ctx.mealSlot,
      coherentBucket,
      isPaired,
      bestPairName,
      slotCount,
    );
    const singleCombo: HabitComboPayload = {
      slot: ctx.mealSlot,
      items: [food],
      label: `${food.name} (${foodPortionLabel(food)})`,
      kcal: Math.round(food.kcal),
      protein: Math.round(food.protein * 10) / 10,
      carbs: Math.round(food.carbs * 10) / 10,
      fat: Math.round(food.fat * 10) / 10,
      sugar: food.sugar,
    };

    candidates.push({
      id: `shadow:${node.id}`,
      targetNodeId: node.id,
      kind: isPaired ? "paired_addon" : "food",
      title: food.name,
      badge,
      reason,
      frequencyCount: count,
      confidence: Math.min(0.99, Math.round(rawScore * 100) / 100),
      score: rawScore,
      meal: singleCombo,
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.frequencyCount - a.frequencyCount);

  // Deduplicate identical titles / single-item combos that wrap the exact same single food
  const seenSignatures = new Set<string>();
  const picked: ShadowRecommendation[] = [];
  for (const c of candidates) {
    const sig = (c.meal?.items ?? [])
      .map((i) => i.foodKey)
      .sort()
      .join("|");
    if (sig && seenSignatures.has(sig)) continue;
    if (sig) seenSignatures.add(sig);
    picked.push(c);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function scoreWorkoutRecommendations(
  graph: HabitGraph,
  ctx: WorkoutShadowContext,
): ShadowRecommendation[] {
  const limit = ctx.limit ?? 2;
  const now = ctx.now;
  const currentBucket = timeBucketForHour(ctx.hour);
  const candidates: ShadowRecommendation[] = [];

  for (const node of Object.values(graph.nodes)) {
    if (node.kind !== "workout" || !node.payload) continue;
    const payload = node.payload as HabitWorkoutPayload;

    const fb = feedbackFactor(graph, node.id, now);
    if (fb.blocked) continue;

    // If user already completed a gym workout today, avoid suggesting another heavy lifting split; favor light activities.
    if (ctx.workoutDoneToday && payload.kind === "session") continue;

    const days = edgeSumByPrefix(graph, node.id, "TRAINED_ON", "day:", now, WORKOUT_HALF_LIFE_DAYS);
    const dows = edgeSumByPrefix(graph, node.id, "TRAINED_ON", "dow:", now, WORKOUT_HALF_LIFE_DAYS);
    const times = edgeSumByPrefix(graph, node.id, "TRAINED_ON", "time:", now, WORKOUT_HALF_LIFE_DAYS);

    const dayW = days.byDst[`day:${ctx.dayType}`]?.weight ?? 0;
    const dayShare = days.total > 0 ? (dayW + 0.1) / (days.total + 0.3) : 0.5;
    const dowW = dows.byDst[`dow:${ctx.weekday}`]?.weight ?? 0;
    const dowCount = dows.byDst[`dow:${ctx.weekday}`]?.count ?? 0;
    const dowShare = dows.total > 0 ? (dowW + 0.15) / (dows.total + 0.7) : 0.25;

    let timeFit = 0.25;
    if (times.total > 0) {
      let wp = 0;
      for (const [dst, val] of Object.entries(times.byDst)) {
        wp += val.weight * timeBucketProximity(currentBucket, dst.slice(5) as TimeBucket);
      }
      timeFit = wp / times.total;
    }

    const freqSat = days.total / (days.total + 2.0);
    // Boost day-type fit strongly so rest-day walks win on rest days and gym splits win on gym days.
    const dayMatchBoost = dayW > 0 ? 1.0 : ctx.dayType === "rest" && payload.kind === "session" ? 0.55 : 0.8;
    const rawScore =
      (0.36 * freqSat + 0.28 * dowShare + 0.22 * dayShare + 0.14 * timeFit) *
      dayMatchBoost *
      fb.multiplier;

    const badge =
      payload.kind === "activity"
        ? "Aktivitas langganan"
        : ctx.dayType === "gym"
          ? "Sesi hari latihan"
          : "Sesi favorit";
    const reason =
      dowCount >= 2
        ? `Sering setiap ${WEEKDAY_LABEL[ctx.weekday]} · ${node.reinforcements}×`
        : `${node.reinforcements}× dicatat · ${BUCKET_LABEL[currentBucket]}`;

    candidates.push({
      id: `shadow:${node.id}`,
      targetNodeId: node.id,
      kind: payload.kind === "activity" ? "activity" : "workout",
      title: payload.title,
      badge,
      reason,
      frequencyCount: node.reinforcements,
      confidence: Math.min(0.99, Math.round(rawScore * 100) / 100),
      score: rawScore,
      workout: payload,
    });
  }

  // Cold-start / split fallback if the graph doesn't already cover today's planned session or rest recovery walk.
  if (ctx.dayType === "gym" && !ctx.workoutDoneToday && ctx.plannedWorkout) {
    const pid = workoutNodeId(ctx.plannedWorkout);
    const already = candidates.some((c) => c.targetNodeId === pid);
    const fb = feedbackFactor(graph, pid, now);
    if (!already && !fb.blocked) {
      candidates.push({
        id: `shadow:${pid}`,
        targetNodeId: pid,
        kind: "workout",
        title: ctx.plannedWorkout.title,
        badge: "Jadwal hari latihan",
        reason: `Program ${WEEKDAY_LABEL[ctx.weekday]} · 1 ketuk catat`,
        frequencyCount: 1,
        confidence: 0.72,
        score: 0.42 * fb.multiplier,
        workout: ctx.plannedWorkout,
      });
    }
  } else if (ctx.dayType === "rest" && ctx.fallbackRestActivity) {
    const rid = workoutNodeId(ctx.fallbackRestActivity);
    const already = candidates.some((c) => c.targetNodeId === rid);
    const fb = feedbackFactor(graph, rid, now);
    if (!already && !fb.blocked) {
      candidates.push({
        id: `shadow:${rid}`,
        targetNodeId: rid,
        kind: "activity",
        title: ctx.fallbackRestActivity.title,
        badge: "Pemulihan hari istirahat",
        reason: "Bakar aktif ringan · cocok hari istirahat",
        frequencyCount: 1,
        confidence: 0.68,
        score: 0.38 * fb.multiplier,
        workout: ctx.fallbackRestActivity,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.frequencyCount - a.frequencyCount);
  return candidates.slice(0, limit);
}
