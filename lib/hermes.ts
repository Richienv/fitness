import { db } from "./db";
import { todayKey } from "./targets";
import { getIngredient, macrosFor, type Macros } from "./ingredients";

export const DAILY_CALORIE_TARGET = 2200;
export const DAILY_PROTEIN_TARGET = 175;
export const TARGET_BODYWEIGHT_KG = 71;

const SESSION_TYPES = [
  "PUSH_A",
  "PUSH_B",
  "PULL_A",
  "PULL_B",
  "LEGS",
  "CARDIO",
  "CUSTOM",
] as const;
export type ApiSessionType = (typeof SESSION_TYPES)[number];

const DISPLAY_TO_INTERNAL: Record<string, ApiSessionType> = {
  "PUSH A": "PUSH_A",
  "PUSH B": "PUSH_B",
  "PULL A": "PULL_A",
  "PULL B": "PULL_B",
  LEGS: "LEGS",
  "LEGS + ABS": "LEGS",
  CARDIO: "CARDIO",
  CUSTOM: "CUSTOM",
};

const INTERNAL_TO_DISPLAY: Record<ApiSessionType, string> = {
  PUSH_A: "Push A",
  PUSH_B: "Push B",
  PULL_A: "Pull A",
  PULL_B: "Pull B",
  LEGS: "Legs",
  CARDIO: "Cardio",
  CUSTOM: "Custom",
};

export function normalizeSessionType(input: string): ApiSessionType | null {
  const upper = input.trim().toUpperCase();
  if ((SESSION_TYPES as readonly string[]).includes(upper))
    return upper as ApiSessionType;
  return DISPLAY_TO_INTERNAL[upper] ?? null;
}

export function displaySessionType(t: string): string {
  const norm = normalizeSessionType(t);
  return norm ? INTERNAL_TO_DISPLAY[norm] : t;
}

export function recommendedSessionForDay(day: number): ApiSessionType {
  // Mon=PUSH_A, Tue=PULL_A, Wed=rest→PUSH_B, Thu=LEGS, Fri=PUSH_B, Sat/Sun=PULL_B
  switch (day) {
    case 1:
      return "PUSH_A";
    case 2:
      return "PULL_A";
    case 4:
      return "LEGS";
    case 5:
      return "PUSH_B";
    case 0:
    case 6:
      return "PULL_B";
    default:
      return "PUSH_A";
  }
}

function cstDayOfWeek(dateKey: string): number {
  // dateKey is YYYY-MM-DD in CST. Parse as UTC noon to dodge TZ drift.
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export type MealTotals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
};

export const DAILY_SUGAR_TARGET_G = 50;

export async function calorieTotalsFor(date: string): Promise<MealTotals> {
  const logs = await db.mealEntry.findMany({ where: { date } }).catch(() => []);
  const acc: MealTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 };
  for (const l of logs) {
    const t = l.totals as Partial<MealTotals> | null;
    acc.kcal += t?.kcal ?? 0;
    acc.protein += t?.protein ?? 0;
    acc.carbs += t?.carbs ?? 0;
    acc.fat += t?.fat ?? 0;
    acc.sugar += t?.sugar ?? 0;
  }
  return {
    kcal: Math.round(acc.kcal),
    protein: Math.round(acc.protein),
    carbs: Math.round(acc.carbs),
    fat: Math.round(acc.fat),
    sugar: Math.round(acc.sugar),
  };
}

export async function todaySnapshot(today = todayKey()) {
  const totals = await calorieTotalsFor(today);
  const remainingKcal = Math.round(DAILY_CALORIE_TARGET - totals.kcal);
  const remainingProtein = Math.round(DAILY_PROTEIN_TARGET - totals.protein);

  const todayType = recommendedSessionForDay(cstDayOfWeek(today));
  const todaySession = await db.workoutSession
    .findFirst({ where: { date: today } })
    .catch(() => null);
  const lastSession = await db.workoutSession
    .findFirst({ orderBy: { createdAt: "desc" } })
    .catch(() => null);

  const latestWeight = await db.measurement
    .findFirst({
      where: { weightKg: { not: null } },
      orderBy: { date: "desc" },
    })
    .catch(() => null);
  const priorWeight = latestWeight
    ? await db.measurement
        .findFirst({
          where: {
            weightKg: { not: null },
            date: { lt: latestWeight.date },
          },
          orderBy: { date: "desc" },
        })
        .catch(() => null)
    : null;

  let trend: "down" | "up" | "flat" | null = null;
  if (latestWeight?.weightKg != null && priorWeight?.weightKg != null) {
    const delta = latestWeight.weightKg - priorWeight.weightKg;
    trend = delta < -0.1 ? "down" : delta > 0.1 ? "up" : "flat";
  }

  const displayToday = INTERNAL_TO_DISPLAY[todayType];
  const sugarRemaining = DAILY_SUGAR_TARGET_G - totals.sugar;
  const sugarFlag = totals.sugar > DAILY_SUGAR_TARGET_G ? " · sugar over!" : "";
  const summary = [
    `${totals.kcal}/${DAILY_CALORIE_TARGET} kcal`,
    `${totals.protein}g protein`,
    `${totals.sugar}g sugar${sugarFlag}`,
    todaySession ? `${displayToday} done` : `${displayToday} pending`,
  ].join(" · ");

  return {
    date: today,
    calories: {
      consumed: totals.kcal,
      target: DAILY_CALORIE_TARGET,
      remaining: remainingKcal,
      protein: totals.protein,
      proteinTarget: DAILY_PROTEIN_TARGET,
      proteinRemaining: remainingProtein,
      carbs: totals.carbs,
      fat: totals.fat,
      sugar: totals.sugar,
      sugarTarget: DAILY_SUGAR_TARGET_G,
      sugarRemaining,
      sugarOver: totals.sugar > DAILY_SUGAR_TARGET_G,
    },
    workout: {
      todayType: displayToday,
      todayTypeKey: todayType,
      completed: !!todaySession,
      lastSession: lastSession?.date ?? null,
      lastSessionType: lastSession
        ? INTERNAL_TO_DISPLAY[
            normalizeSessionType(lastSession.sessionType) ?? "CUSTOM"
          ] ?? lastSession.sessionType
        : null,
    },
    bodyweight: {
      current: latestWeight?.weightKg ?? null,
      target: TARGET_BODYWEIGHT_KG,
      trend,
      lastLogged: latestWeight?.date ?? null,
    },
    summary,
  };
}

export async function weekSnapshot(weekStart?: string) {
  const today = todayKey();
  const start = weekStart ?? addDays(today, -((cstDayOfWeek(today) + 6) % 7));
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(start, i));

  let totalKcal = 0;
  let totalProtein = 0;
  let totalSugar = 0;
  let daysLogged = 0;
  for (const d of days) {
    const t = await calorieTotalsFor(d);
    if (t.kcal > 0) {
      daysLogged++;
      totalKcal += t.kcal;
      totalProtein += t.protein;
      totalSugar += t.sugar;
    }
  }

  const workouts = await db.workoutSession
    .findMany({
      where: { date: { gte: days[0], lte: days[days.length - 1] } },
    })
    .catch(() => []);

  const firstWeight = await db.measurement
    .findFirst({
      where: {
        weightKg: { not: null },
        date: { gte: days[0], lte: days[days.length - 1] },
      },
      orderBy: { date: "asc" },
    })
    .catch(() => null);
  const lastWeight = await db.measurement
    .findFirst({
      where: {
        weightKg: { not: null },
        date: { gte: days[0], lte: days[days.length - 1] },
      },
      orderBy: { date: "desc" },
    })
    .catch(() => null);
  const weightDelta =
    firstWeight?.weightKg != null && lastWeight?.weightKg != null
      ? Number((lastWeight.weightKg - firstWeight.weightKg).toFixed(1))
      : null;

  return {
    weekStart: days[0],
    weekEnd: days[days.length - 1],
    daysLogged,
    avgCalories: daysLogged > 0 ? Math.round(totalKcal / daysLogged) : 0,
    avgProtein: daysLogged > 0 ? Math.round(totalProtein / daysLogged) : 0,
    avgSugar: daysLogged > 0 ? Math.round(totalSugar / daysLogged) : 0,
    workoutsCompleted: workouts.length,
    weightDelta,
    streak: await computeStreak("meal"),
  };
}

export type StreakType = "meal" | "workout" | "weight";

export async function computeStreak(type: StreakType): Promise<number> {
  const today = todayKey();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = addDays(today, -i);
    let hit = false;
    if (type === "meal") {
      const totals = await calorieTotalsFor(d);
      hit = totals.kcal > 0;
    } else if (type === "workout") {
      const w = await db.workoutSession
        .findFirst({ where: { date: d } })
        .catch(() => null);
      hit = !!w;
    } else {
      const m = await db.measurement
        .findFirst({ where: { date: d, weightKg: { not: null } } })
        .catch(() => null);
      hit = !!m;
    }
    if (hit) {
      streak++;
    } else {
      // Allow today to be empty without resetting an active streak.
      if (i === 0) continue;
      break;
    }
  }
  return streak;
}

// ---- Natural language meal parser ----

type ParsedMeal = {
  name: string;
  kcal: number;
  protein: number;
  carbs?: number;
  fat?: number;
  /** True when the text itself carried the number (vs heuristic guess). */
  hadExplicitKcal: boolean;
  hadExplicitProtein: boolean;
};

const PROTEIN_KEYWORDS: Record<string, number> = {
  "protein shake": 24,
  whey: 24,
  ayam: 35,
  chicken: 35,
  beef: 30,
  sapi: 30,
  steak: 35,
  egg: 6,
  telur: 6,
  fish: 28,
  ikan: 28,
  salmon: 30,
  tuna: 28,
  tofu: 8,
  tempe: 18,
};

const CALORIE_HEURISTIC: Record<string, number> = {
  "nasi padang": 800,
  "nasi goreng": 650,
  "nasi uduk": 600,
  "ayam bakar": 450,
  "ayam goreng": 500,
  "mie goreng": 600,
  indomie: 380,
  "protein shake": 130,
  oats: 150,
  rice: 200,
};

export function parseMealText(input: string): ParsedMeal {
  const text = input.trim().toLowerCase();

  // Extract calories: "800 kal" / "800 kcal" / "800 cal"
  const kcalMatch = text.match(/(\d{2,5})\s*(kcal|kal|cal|calories|kalori)/);
  // Extract protein: "35g protein" / "35 gram protein"
  const proteinMatch = text.match(
    /(\d{1,3})\s*(g|gram|gr)?\s*(protein|prot)/
  );
  // Fallback: bare number (assumed kcal)
  const bareNumbers = text.match(/\b(\d{2,5})\b/g) ?? [];

  let kcal = kcalMatch ? Number(kcalMatch[1]) : NaN;
  let protein = proteinMatch ? Number(proteinMatch[1]) : NaN;
  const hadExplicitKcal = Number.isFinite(kcal);
  const hadExplicitProtein = Number.isFinite(protein);

  // Try library matches if missing values
  let matchedName: string | null = null;
  for (const key of Object.keys(CALORIE_HEURISTIC)) {
    if (text.includes(key)) {
      matchedName = key;
      if (!Number.isFinite(kcal)) kcal = CALORIE_HEURISTIC[key];
      break;
    }
  }

  if (!Number.isFinite(kcal) && bareNumbers.length > 0) {
    // First plausible kcal number (>=50)
    const candidate = bareNumbers
      .map(Number)
      .find((n) => n >= 50 && n <= 5000);
    if (candidate) kcal = candidate;
  }

  if (!Number.isFinite(protein)) {
    for (const [kw, p] of Object.entries(PROTEIN_KEYWORDS)) {
      if (text.includes(kw)) {
        protein = p;
        if (!matchedName) matchedName = kw;
        break;
      }
    }
  }

  // Strip parsed tokens to derive name
  let name = input.trim();
  name = name
    .replace(/(\d{1,5})\s*(kcal|kal|cal|calories|kalori)/gi, "")
    .replace(/(\d{1,3})\s*(g|gram|gr)?\s*(protein|prot)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) name = matchedName ?? "meal";

  return {
    name,
    kcal: Math.max(0, Math.round(Number.isFinite(kcal) ? kcal : 0)),
    protein: Math.max(
      0,
      Math.round(Number.isFinite(protein) ? protein : 0)
    ),
    hadExplicitKcal,
    hadExplicitProtein,
  };
}

// ---- Structured meal items (Hermes maps speech → library items) ----

export type HermesItemInput =
  // Library ingredient: send qty (units) OR grams (auto-converted via gramsPerUnit)
  | { id: string; qty?: number; grams?: number }
  // Custom food: absolute macros for the portion eaten
  | {
      name: string;
      grams?: number;
      kcal: number;
      protein?: number;
      fat?: number;
      carbs?: number;
      sugar?: number;
    };

// Matches the web app's MealItem union exactly, so the dashboard renders
// Hermes-logged items natively ("3× Whole egg", "Tofu 100g", …).
export type ResolvedMealItem =
  | { id: string; qty: number }
  | {
      custom: true;
      name: string;
      grams: number;
      kcal: number;
      protein: number;
      fat: number;
      carbs: number;
      sugar?: number;
    };

function isLibraryItem(
  i: ResolvedMealItem
): i is { id: string; qty: number } {
  return "id" in i;
}

function isCustom(
  i: ResolvedMealItem
): i is Extract<ResolvedMealItem, { custom: true }> {
  return "custom" in i && i.custom === true;
}

function sugarFor(id: string, qty: number): number {
  const ing = getIngredient(id);
  return (ing?.sugar ?? 0) * qty;
}

/** Sum totals (kcal/protein/carbs/fat/sugar) for any item array — handles
 * both library refs and custom snapshots. Used after merging. */
export function totalsForResolved(items: ResolvedMealItem[]): MealTotals {
  let kcal = 0, protein = 0, fat = 0, carbs = 0, sugar = 0;
  for (const it of items) {
    if (isLibraryItem(it)) {
      const m = macrosFor(it.id, it.qty);
      kcal += m.kcal; protein += m.protein; fat += m.fat; carbs += m.carbs;
      sugar += sugarFor(it.id, it.qty);
    } else if (isCustom(it)) {
      kcal += it.kcal; protein += it.protein; fat += it.fat; carbs += it.carbs;
      sugar += it.sugar ?? 0;
    }
  }
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    sugar: Math.round(sugar),
  };
}

/** Merge new items into existing, mirroring the web app's stepper:
 *  - Library items with the same id → sum qty (so "3 eggs" + "2 eggs" = ×5)
 *  - Custom items with the same name (case-insensitive) → sum grams + macros. */
export function mergeItems(
  existing: ResolvedMealItem[],
  incoming: ResolvedMealItem[]
): ResolvedMealItem[] {
  const out: ResolvedMealItem[] = existing.map((i) =>
    isLibraryItem(i) ? { ...i } : { ...i }
  );
  for (const inc of incoming) {
    if (isLibraryItem(inc)) {
      const found = out.find(
        (i): i is { id: string; qty: number } =>
          isLibraryItem(i) && i.id === inc.id
      );
      if (found) found.qty = +(found.qty + inc.qty).toFixed(4);
      else out.push({ ...inc });
    } else if (isCustom(inc)) {
      const key = inc.name.trim().toLowerCase();
      const found = out.find(
        (i): i is Extract<ResolvedMealItem, { custom: true }> =>
          isCustom(i) && i.name.trim().toLowerCase() === key
      );
      if (found) {
        found.grams += inc.grams;
        found.kcal += inc.kcal;
        found.protein += inc.protein;
        found.fat += inc.fat;
        found.carbs += inc.carbs;
        found.sugar = (found.sugar ?? 0) + (inc.sugar ?? 0);
      } else {
        out.push({ ...inc });
      }
    }
  }
  return out;
}

export function resolveMealItems(items: HermesItemInput[]): {
  resolved: ResolvedMealItem[];
  totals: MealTotals;
  labels: string[];
  unknownIds: string[];
} {
  const resolved: ResolvedMealItem[] = [];
  const unknownIds: string[] = [];

  for (const it of items) {
    if ("id" in it && it.id) {
      const ing = getIngredient(it.id);
      if (!ing) {
        unknownIds.push(it.id);
        continue;
      }
      const qty =
        typeof it.grams === "number" && ing.gramsPerUnit
          ? it.grams / ing.gramsPerUnit
          : typeof it.qty === "number"
            ? it.qty
            : 1;
      resolved.push({ id: it.id, qty });
    } else if ("name" in it && it.name && typeof it.kcal === "number") {
      const grams = typeof it.grams === "number" ? it.grams : 100;
      resolved.push({
        custom: true as const,
        name: it.name,
        grams,
        kcal: Math.round(it.kcal),
        protein: Math.round(it.protein ?? 0),
        fat: Math.round(it.fat ?? 0),
        carbs: Math.round(it.carbs ?? 0),
        ...(typeof it.sugar === "number" ? { sugar: Math.round(it.sugar) } : {}),
      });
    }
  }

  // Collapse same-id / same-name dupes within the SAME call too.
  const collapsed = mergeItems([], resolved);

  return {
    resolved: collapsed,
    totals: totalsForResolved(collapsed),
    labels: collapsed.map((i) =>
      isLibraryItem(i)
        ? `${+i.qty.toFixed(2)}× ${getIngredient(i.id)?.name ?? i.id}`
        : i.name
    ),
    unknownIds,
  };
}

/** Best-effort coercion of arbitrary stored items into ResolvedMealItem. */
export function coerceStoredItems(raw: unknown): ResolvedMealItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ResolvedMealItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (o.custom === true && typeof o.name === "string") {
      out.push({
        custom: true,
        name: o.name,
        grams: typeof o.grams === "number" ? o.grams : 100,
        kcal: typeof o.kcal === "number" ? o.kcal : 0,
        protein: typeof o.protein === "number" ? o.protein : 0,
        fat: typeof o.fat === "number" ? o.fat : 0,
        carbs: typeof o.carbs === "number" ? o.carbs : 0,
        ...(typeof o.sugar === "number" ? { sugar: o.sugar } : {}),
      });
    } else if (typeof o.id === "string" && typeof o.qty === "number") {
      out.push({ id: o.id, qty: o.qty });
    }
  }
  return out;
}

// ---- Shared food library (FoodItem table) ----

export type FoodPer100g = {
  kcal: number;
  protein: number;
  fat?: number;
  carbs?: number;
  sugar?: number;
  sodium?: number;
};

/** Case-insensitive fuzzy lookup against the shared library: the food name
 * appearing inside the spoken text, or vice versa. Small table → fetch all. */
export async function matchLibraryFood(text: string) {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;
  const foods = await db.foodItem.findMany().catch(() => []);
  let best: { id: string; name: string; per100g: FoodPer100g } | null = null;
  for (const f of foods) {
    const fname = f.name.trim().toLowerCase();
    if (!fname) continue;
    if (lower.includes(fname) || fname.includes(lower)) {
      // Prefer the longest name match (more specific food wins)
      if (!best || fname.length > best.name.length) {
        best = { id: f.id, name: f.name, per100g: f.per100g as FoodPer100g };
      }
    }
  }
  return best;
}

export function inferMealType(
  date: Date = new Date()
): "breakfast" | "lunch" | "dinner" | "snack" {
  // CST hour
  const cstHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      hour12: false,
    }).format(date)
  );
  if (cstHour < 10) return "breakfast";
  if (cstHour < 15) return "lunch";
  if (cstHour < 21) return "dinner";
  return "snack";
}
