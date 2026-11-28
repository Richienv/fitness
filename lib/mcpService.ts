// Core R2 Fit MCP business logic & strict schema validators.
// Pure server module — NO "use client" directive (enforced by scripts/check-server-imports.mjs).
import { db } from "./db";
import { logActivity } from "./audit";
import { calorieTotalsFor, microTotalsFor, coerceStoredItems, totalsForResolved } from "./hermes";
import { todayKey } from "./targets";
import {
  resolvePersonCharacter,
  resolvePersonNutritionTargets,
  resolvePersonTargetWeightKg,
  type PersonUserLike,
} from "./personTargets";
import {
  enforceMcpProfileAccess,
  McpAuthAccessError,
  type McpAuthContext,
} from "./mcpAuth";
import {
  estimateWorkoutCaloriesBurned,
  inferDurationMinutes,
  mapCardioKindToMcpType,
  mapMcpActivityToCardioKind,
  type McpActivityType,
  type McpIntensity,
} from "./activityCodec";
import {
  GetTodaySummaryInputSchema,
  LogMealInputSchema,
  LogWorkoutInputSchema,
  ProfileSchema,
  UpdateOrDeleteEntryInputSchema,
  WhoAmIInputSchema,
  type McpMealItemInput,
  type McpMealType,
  type McpProfile,
} from "./mcpSchemas";

export {
  GetTodaySummaryInputSchema,
  LogMealInputSchema,
  LogWorkoutInputSchema,
  ProfileSchema,
  UpdateOrDeleteEntryInputSchema,
  WhoAmIInputSchema,
  type McpMealItemInput,
  type McpMealType,
  type McpProfile,
};

export const MCP_ACTOR = "r2fit-mcp";

export class McpServiceError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function parseTimestampToDateAndKey(ts?: string | number): {
  at: Date;
  date: string;
} {
  let at: Date;
  if (typeof ts === "number" && Number.isFinite(ts)) {
    at = new Date(ts > 1e12 ? ts : ts * 1000);
  } else if (typeof ts === "string" && ts.trim()) {
    const raw = ts.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { at: new Date(`${raw}T12:00:00+08:00`), date: raw };
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new McpServiceError(400, "invalid_timestamp", `Invalid timestamp: ${raw}`);
    }
    at = parsed;
  } else {
    at = new Date();
  }
  return { at, date: todayKey(at) };
}

type ResolvedUser = PersonUserLike & {
  id: string;
  email: string;
  goal?: string | null;
};

/**
 * Strictly resolve target profile ("richie" | "renita") from User table, enforcing caller token isolation.
 * NEVER falls back from Renita -> Richie or Richie -> Renita.
 */
export async function resolveMcpUser(
  profileInput?: unknown,
  auth?: McpAuthContext,
): Promise<{
  profile: McpProfile;
  detectedBy: "token" | "argument" | "default";
  user: ResolvedUser;
}> {
  let access: { profile: McpProfile; detectedBy: "token" | "argument" | "default" };
  try {
    access = enforceMcpProfileAccess(profileInput, auth);
  } catch (err) {
    if (err instanceof McpAuthAccessError) {
      throw new McpServiceError(err.status, err.code, err.message);
    }
    throw err;
  }
  const { profile, detectedBy } = access;

  const select = {
    id: true,
    email: true,
    name: true,
    username: true,
    loginAlias: true,
    sex: true,
    goal: true,
    heightCm: true,
    setup: true,
  } as const;

  let user: ResolvedUser | null = await db.user
    .findFirst({ where: { loginAlias: profile }, select })
    .catch(() => null);

  if (!user && profile === "richie") {
    const ownerEmail = process.env.HERMES_OWNER_EMAIL?.trim().toLowerCase();
    if (ownerEmail) {
      user = await db.user
        .findUnique({ where: { email: ownerEmail }, select })
        .catch(() => null);
    }
  }

  if (!user && profile === "renita") {
    const renitaEmail = process.env.RENITA_OWNER_EMAIL?.trim().toLowerCase();
    if (renitaEmail) {
      user = await db.user
        .findUnique({ where: { email: renitaEmail }, select })
        .catch(() => null);
    }
  }

  if (!user) {
    const candidates = await db.user.findMany({ select, take: 25 }).catch(() => []);
    user = candidates.find((c) => resolvePersonCharacter(c) === profile) ?? null;
  }

  if (!user || resolvePersonCharacter(user) !== profile) {
    throw new McpServiceError(
      404,
      "profile_not_found",
      `Account for profile "${profile}" was not found in R2 Fit database.`,
    );
  }

  return { profile, detectedBy, user };
}

function resolvePersonMacroTargets(
  user: ResolvedUser,
  targetRow: { kcal?: number | null; protein?: number | null } | null,
  dateKey: string,
): { calories: number; protein_g: number; carbs_g: number; fat_g: number } {
  const base = resolvePersonNutritionTargets(user, targetRow, dateKey);
  const setup = user.setup as {
    trainingDays?: unknown;
    targets?: {
      gymDay?: { kcal?: unknown; carbs?: unknown; fat?: unknown };
      restDay?: { kcal?: unknown; carbs?: unknown; fat?: unknown };
    };
  } | null;
  const trainingDays = Array.isArray(setup?.trainingDays)
    ? setup.trainingDays.filter((n): n is number => typeof n === "number")
    : [];
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)).getUTCDay();
  const isGym = trainingDays.length > 0 ? trainingDays.includes(weekday) : true;
  const chosen = isGym ? setup?.targets?.gymDay : setup?.targets?.restDay ?? setup?.targets?.gymDay;
  const rawCarbs = typeof chosen?.carbs === "number" && chosen.carbs > 0 ? chosen.carbs : null;
  const rawFat = typeof chosen?.fat === "number" && chosen.fat > 0 ? chosen.fat : null;
  const fatG = rawFat ? Math.round(rawFat) : Math.max(25, Math.round((base.kcal * 0.27) / 9));
  const carbsG = rawCarbs
    ? Math.round(rawCarbs)
    : Math.max(20, Math.round((base.kcal - base.protein * 4 - fatG * 9) / 4));
  return {
    calories: base.kcal,
    protein_g: base.protein,
    carbs_g: carbsG,
    fat_g: fatG,
  };
}

function authResponseMeta(
  profile: McpProfile,
  detectedBy: "token" | "argument" | "default",
  auth?: McpAuthContext,
) {
  return {
    detected_profile: profile,
    detected_by: detectedBy,
    ...(auth ? { caller_token_profile: auth.caller } : {}),
  };
}

async function resolveBodyWeightKg(user: ResolvedUser, profile: McpProfile): Promise<number> {
  const latest = await db.measurement
    .findFirst({
      where: { userId: user.id, weightKg: { not: null } },
      orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
      select: { weightKg: true },
    })
    .catch(() => null);
  if (latest?.weightKg && Number.isFinite(latest.weightKg) && latest.weightKg > 25) {
    return latest.weightKg;
  }
  const setup = user.setup as { measurement?: { weightKg?: number }; profile?: { weightKg?: number } } | null;
  const setupKg = setup?.measurement?.weightKg ?? setup?.profile?.weightKg;
  if (typeof setupKg === "number" && Number.isFinite(setupKg) && setupKg > 25) {
    return setupKg;
  }
  return profile === "renita" ? 45 : 73;
}

type StoredMealItemWithMeta = {
  custom: true;
  name: string;
  grams: number;
  portionLabel?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  confidence?: "high" | "medium" | "low" | number;
  addedAt: number;
};

function toStoredMealItems(
  items: McpMealItemInput[],
  addedAt: number,
): StoredMealItemWithMeta[] {
  return items.map((it) => ({
    custom: true as const,
    name: it.name,
    grams: Math.round(it.portion_grams),
    portionLabel: it.portion_desc,
    kcal: Math.round(it.calories),
    protein: Math.round(it.protein_g * 10) / 10,
    carbs: Math.round(it.carbs_g * 10) / 10,
    fat: Math.round(it.fat_g * 10) / 10,
    ...(typeof it.fiber_g === "number" ? { fiber: Math.round(it.fiber_g * 10) / 10 } : {}),
    confidence: it.confidence,
    addedAt,
  }));
}

function summarizeMealTotals(
  items: StoredMealItemWithMeta[],
  meta?: { meal_title?: string; notes?: string },
) {
  const kcal = Math.round(items.reduce((s, it) => s + (Number(it.kcal) || 0), 0));
  const protein = Math.round(items.reduce((s, it) => s + (Number(it.protein) || 0), 0));
  const carbs = Math.round(items.reduce((s, it) => s + (Number(it.carbs) || 0), 0));
  const fat = Math.round(items.reduce((s, it) => s + (Number(it.fat) || 0), 0));
  const fiber = Math.round(items.reduce((s, it) => s + (Number(it.fiber) || 0), 0));
  const sugar = Math.round(items.reduce((s, it) => s + (Number(it.sugar) || 0), 0));
  return {
    kcal,
    protein,
    carbs,
    fat,
    fiber,
    sugar,
    ...(meta?.meal_title ? { mealTitle: meta.meal_title } : {}),
    ...(meta?.notes ? { notes: meta.notes } : {}),
    source: MCP_ACTOR,
  };
}

type StoredMcpWorkoutMeta = {
  activity_type?: McpActivityType;
  title?: string;
  duration_min?: number;
  distance_km?: number;
  intensity?: McpIntensity;
  calories_burned?: number;
  notes?: string;
};

async function fetchWorkoutMetadataMap(
  entityIds: string[],
): Promise<Map<string, StoredMcpWorkoutMeta>> {
  const map = new Map<string, StoredMcpWorkoutMeta>();
  if (entityIds.length === 0) return map;
  const rows = await db.activityLog
    .findMany({
      where: {
        actor: MCP_ACTOR,
        entityId: { in: entityIds },
        action: { in: ["log-workout", "update-workout"] },
      },
      orderBy: { createdAt: "asc" },
    })
    .catch(() => []);
  for (const r of rows) {
    if (!r.entityId || !r.payload || typeof r.payload !== "object") continue;
    const p = r.payload as Record<string, unknown>;
    const prev = map.get(r.entityId) ?? {};
    map.set(r.entityId, {
      ...prev,
      ...(typeof p.activity_type === "string"
        ? { activity_type: p.activity_type as McpActivityType }
        : {}),
      ...(typeof p.title === "string" ? { title: p.title } : {}),
      ...(typeof p.duration_min === "number" ? { duration_min: p.duration_min } : {}),
      ...(typeof p.distance_km === "number" ? { distance_km: p.distance_km } : {}),
      ...(typeof p.intensity === "string"
        ? { intensity: p.intensity as McpIntensity }
        : {}),
      ...(typeof p.calories_burned === "number"
        ? { calories_burned: p.calories_burned }
        : {}),
      ...(typeof p.notes === "string" ? { notes: p.notes } : {}),
    });
  }
  return map;
}

function inferGymSessionType(title: string): string {
  const lower = title.toLowerCase();
  if (/push\s*a\b/.test(lower)) return "PUSH_A";
  if (/push\s*b\b/.test(lower)) return "PUSH_B";
  if (/pull\s*a\b/.test(lower)) return "PULL_A";
  if (/pull\s*b\b/.test(lower)) return "PULL_B";
  if (/\bleg(s)?\b|kaki/.test(lower)) return "LEGS";
  return "CUSTOM";
}

export async function r2fitGetTodaySummary(rawInput: unknown, auth?: McpAuthContext) {
  const parsed = GetTodaySummaryInputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new McpServiceError(400, "invalid_input", parsed.error.message);
  }
  const { profile, detectedBy, user } = await resolveMcpUser(parsed.data.profile, auth);
  const date = parsed.data.date ?? todayKey();

  const [mealRows, cardioRows, workoutRows, targetRow, weightKg] = await Promise.all([
    db.mealEntry.findMany({
      where: { userId: user.id, date },
      orderBy: { createdAt: "asc" },
    }),
    db.cardioSession.findMany({
      where: { userId: user.id, date },
      orderBy: { startedAt: "asc" },
    }),
    db.workoutSession.findMany({
      where: { userId: user.id, date },
      orderBy: { createdAt: "asc" },
      include: { exercises: true },
    }),
    db.userTarget.findUnique({ where: { userId: user.id } }).catch(() => null),
    resolveBodyWeightKg(user, profile),
  ]);

  const targets = resolvePersonMacroTargets(user, targetRow, date);
  const metaMap = await fetchWorkoutMetadataMap([
    ...cardioRows.map((c) => c.id),
    ...workoutRows.map((w) => w.id),
  ]);

  const mealTotals = await calorieTotalsFor(user.id, date);
  const microTotals = await microTotalsFor(user.id, date);

  const meals = mealRows.map((m) => {
    const t = (m.totals ?? {}) as {
      kcal?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
      mealTitle?: string;
      notes?: string;
    };
    const stored = coerceStoredItems(m.items);
    const computed = totalsForResolved(stored);
    const items = Array.isArray(m.items) ? (m.items as Array<Record<string, unknown>>) : [];
    const fiberSum = items.reduce(
      (sum, it) => sum + (typeof it?.fiber === "number" ? it.fiber : 0),
      0,
    );
    const mealTitle =
      (typeof t.mealTitle === "string" && t.mealTitle.trim()) ||
      items
        .map((it) => (typeof it?.name === "string" ? it.name : ""))
        .filter(Boolean)
        .slice(0, 3)
        .join(", ") ||
      m.mealType;
    return {
      entry_id: m.id,
      entry_type: "meal" as const,
      meal_type: m.mealType,
      meal_title: mealTitle,
      calories: Math.round(typeof t.kcal === "number" ? t.kcal : computed.kcal),
      protein_g: Math.round(typeof t.protein === "number" ? t.protein : computed.protein),
      carbs_g: Math.round(typeof t.carbs === "number" ? t.carbs : computed.carbs),
      fat_g: Math.round(typeof t.fat === "number" ? t.fat : computed.fat),
      fiber_g: Math.round(typeof t.fiber === "number" ? t.fiber : fiberSum),
      notes: typeof t.notes === "string" ? t.notes : null,
      items,
      logged_at: m.createdAt.toISOString(),
    };
  });

  const cardioWorkouts = cardioRows.map((c) => {
    const m = metaMap.get(c.id);
    const activityType = m?.activity_type ?? mapCardioKindToMcpType(c.kind);
    const durationMin = m?.duration_min ?? Math.max(1, Math.round((c.durationSec / 60) * 10) / 10);
    const distanceKm =
      m?.distance_km ??
      (typeof c.distanceM === "number" && c.distanceM > 0
        ? Math.round((c.distanceM / 1000) * 100) / 100
        : undefined);
    const intensity = m?.intensity ?? "moderate";
    const caloriesBurned =
      m?.calories_burned ??
      estimateWorkoutCaloriesBurned({
        activityType,
        durationMin,
        distanceKm,
        intensity,
        bodyWeightKg: weightKg,
      });
    return {
      entry_id: c.id,
      entry_type: "workout" as const,
      activity_type: activityType,
      title: m?.title ?? c.location ?? c.kind,
      duration_min: durationMin,
      ...(distanceKm !== undefined ? { distance_km: distanceKm } : {}),
      intensity,
      calories_burned: Math.round(caloriesBurned),
      exercises: [] as Array<{ name: string; sets: number; reps: number; weight_kg: number }>,
      notes: m?.notes ?? null,
      logged_at: c.startedAt.toISOString(),
    };
  });

  const gymWorkouts = workoutRows.map((w) => {
    const m = metaMap.get(w.id);
    const exList = w.exercises.map((e) => {
      const setsArr = Array.isArray(e.sets) ? (e.sets as Array<Record<string, unknown>>) : [];
      const first = setsArr[0] ?? {};
      const setsCount =
        typeof first.sets === "number" ? first.sets : Math.max(1, setsArr.length);
      const repsCount = typeof first.reps === "number" ? first.reps : 10;
      const weightVal = typeof first.weight === "number" ? first.weight : 0;
      return { name: e.name, sets: setsCount, reps: repsCount, weight_kg: weightVal };
    });
    const durationMin =
      m?.duration_min ?? Math.max(20, exList.reduce((acc, e) => acc + e.sets * 2.5, 0) || 45);
    const intensity = m?.intensity ?? "moderate";
    const caloriesBurned =
      m?.calories_burned ??
      estimateWorkoutCaloriesBurned({
        activityType: "gym",
        durationMin,
        intensity,
        bodyWeightKg: weightKg,
        totalVolumeKg: w.totalVolume,
      });
    return {
      entry_id: w.id,
      entry_type: "workout" as const,
      activity_type: "gym" as const,
      title: m?.title ?? w.location ?? w.sessionType,
      duration_min: durationMin,
      intensity,
      calories_burned: Math.round(caloriesBurned),
      exercises: exList,
      notes: m?.notes ?? null,
      logged_at: w.createdAt.toISOString(),
    };
  });

  const workouts = [...cardioWorkouts, ...gymWorkouts].sort((a, b) =>
    a.logged_at.localeCompare(b.logged_at),
  );
  const caloriesBurned = workouts.reduce((s, w) => s + w.calories_burned, 0);
  const remainingKcal = Math.round(targets.calories - mealTotals.kcal);
  const remainingProtein = Math.round(targets.protein_g - mealTotals.protein);

  return {
    ...authResponseMeta(profile, detectedBy, auth),
    profile,
    user_name: user.name ?? profile,
    date,
    meals,
    workouts,
    totals: {
      calories_consumed: mealTotals.kcal,
      protein_g: mealTotals.protein,
      carbs_g: mealTotals.carbs,
      fat_g: mealTotals.fat,
      fiber_g: Math.max(
        microTotals.fiber,
        meals.reduce((s, m) => s + m.fiber_g, 0),
      ),
      sugar_g: mealTotals.sugar,
      calories_burned: caloriesBurned,
      net_calories: mealTotals.kcal - caloriesBurned,
    },
    targets,
    remaining: {
      calories: remainingKcal,
      protein_g: remainingProtein,
      carbs_g: Math.round(targets.carbs_g - mealTotals.carbs),
      fat_g: Math.round(targets.fat_g - mealTotals.fat),
      net_calories_with_burn: remainingKcal + caloriesBurned,
    },
    latest_weight_kg: weightKg,
  };
}

export async function r2fitWhoAmI(rawInput: unknown = {}, auth?: McpAuthContext) {
  const parsed = WhoAmIInputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new McpServiceError(400, "invalid_input", parsed.error.message);
  }
  const { profile, user } = await resolveMcpUser(parsed.data.profile, auth);
  const summary = await r2fitGetTodaySummary(
    parsed.data.profile ? { profile: parsed.data.profile } : {},
    auth,
  );
  const displayName = profile === "renita" ? "Renita" : "Richie";
  const targetWeightKg = resolvePersonTargetWeightKg(user);
  return {
    ...authResponseMeta(profile, summary.detected_by, auth),
    profile,
    user_name: summary.user_name,
    display_name: displayName,
    message: `Tersambung sebagai profil R2 Fit: ${displayName}`,
    date: summary.date,
    latest_weight_kg: summary.latest_weight_kg,
    target_weight_kg: targetWeightKg,
    goal: user.goal ?? "maintain",
    targets: summary.targets,
    today_totals: summary.totals,
    remaining: summary.remaining,
  };
}

export async function r2fitLogMeal(rawInput: unknown, auth?: McpAuthContext) {
  const parsed = LogMealInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new McpServiceError(400, "invalid_input", parsed.error.message);
  }
  const input = parsed.data;
  const { profile, detectedBy, user } = await resolveMcpUser(input.profile, auth);
  const { at, date } = parseTimestampToDateAndKey(input.timestamp);
  const entryId = `mcp-meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const storedItems = toStoredMealItems(input.items, at.getTime());
  const totals = summarizeMealTotals(storedItems, {
    meal_title: input.meal_title,
    notes: input.notes,
  });

  const saved = await db.mealEntry.create({
    data: {
      id: entryId,
      userId: user.id,
      date,
      mealType: input.meal_type,
      items: storedItems as never,
      totals: totals as never,
      createdAt: at,
    },
  });

  await logActivity({
    actor: MCP_ACTOR,
    action: "log-meal",
    entityId: saved.id,
    entityType: "MealEntry",
    payload: {
      profile,
      meal_type: input.meal_type,
      meal_title: input.meal_title,
      date,
      item_count: storedItems.length,
      totals,
    },
  });

  const summary = await r2fitGetTodaySummary({ profile, date }, auth);
  return {
    ...authResponseMeta(profile, detectedBy, auth),
    entry_id: saved.id,
    entry_type: "meal" as const,
    profile,
    date,
    meal_type: saved.mealType,
    meal_title: input.meal_title,
    meal_totals: {
      calories: totals.kcal,
      protein_g: totals.protein,
      carbs_g: totals.carbs,
      fat_g: totals.fat,
      fiber_g: totals.fiber,
    },
    today_totals: summary.totals,
    targets: summary.targets,
    remaining: summary.remaining,
  };
}

export async function r2fitLogWorkout(rawInput: unknown, auth?: McpAuthContext) {
  const parsed = LogWorkoutInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new McpServiceError(400, "invalid_input", parsed.error.message);
  }
  const input = parsed.data;
  const { profile, detectedBy, user } = await resolveMcpUser(input.profile, auth);
  const { at, date } = parseTimestampToDateAndKey(input.timestamp);
  const weightKg = await resolveBodyWeightKg(user, profile);
  const durationMin = inferDurationMinutes(
    input.activity_type,
    input.duration_min,
    input.distance_km,
  );
  const exercises = input.exercises ?? [];
  const totalVolume = exercises.reduce(
    (sum, ex) => sum + ex.sets * ex.reps * ex.weight_kg,
    0,
  );

  const caloriesBurned = Math.round(
    typeof input.calories_burned === "number"
      ? input.calories_burned
      : estimateWorkoutCaloriesBurned({
          activityType: input.activity_type,
          durationMin,
          distanceKm: input.distance_km,
          intensity: input.intensity,
          bodyWeightKg: weightKg,
          totalVolumeKg: totalVolume,
        }),
  );

  let entryId: string;
  if (input.activity_type === "gym") {
    entryId = `mcp-gym-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sessionType = inferGymSessionType(input.title);
    await db.workoutSession.create({
      data: {
        id: entryId,
        userId: user.id,
        date,
        sessionType,
        totalVolume,
        location: input.title.slice(0, 60),
        createdAt: at,
        exercises: {
          create: exercises.map((ex) => ({
            name: ex.name,
            sets: Array.from({ length: ex.sets }, (_, idx) => ({
              setNumber: idx + 1,
              weight: ex.weight_kg,
              reps: ex.reps,
              loggedAt: at.getTime(),
            })) as never,
          })),
        },
      },
    });
    await logActivity({
      actor: MCP_ACTOR,
      action: "log-workout",
      entityId: entryId,
      entityType: "WorkoutSession",
      payload: {
        profile,
        activity_type: "gym",
        title: input.title,
        duration_min: durationMin,
        intensity: input.intensity,
        calories_burned: caloriesBurned,
        notes: input.notes,
        date,
      },
    });
  } else {
    entryId = `mcp-act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const kind = mapMcpActivityToCardioKind(input.activity_type);
    await db.cardioSession.create({
      data: {
        id: entryId,
        userId: user.id,
        date,
        kind,
        distanceM:
          typeof input.distance_km === "number" && input.distance_km > 0
            ? Math.round(input.distance_km * 1000)
            : null,
        durationSec: Math.round(durationMin * 60),
        location: input.title.slice(0, 60),
        startedAt: at,
        createdAt: at,
      },
    });
    await logActivity({
      actor: MCP_ACTOR,
      action: "log-workout",
      entityId: entryId,
      entityType: "CardioSession",
      payload: {
        profile,
        activity_type: input.activity_type,
        title: input.title,
        duration_min: durationMin,
        ...(typeof input.distance_km === "number" ? { distance_km: input.distance_km } : {}),
        intensity: input.intensity,
        calories_burned: caloriesBurned,
        notes: input.notes,
        date,
      },
    });
  }

  const summary = await r2fitGetTodaySummary({ profile, date }, auth);
  return {
    ...authResponseMeta(profile, detectedBy, auth),
    entry_id: entryId,
    entry_type: "workout" as const,
    profile,
    date,
    activity_type: input.activity_type,
    title: input.title,
    duration_min: durationMin,
    ...(typeof input.distance_km === "number" ? { distance_km: input.distance_km } : {}),
    intensity: input.intensity,
    calories_burned: caloriesBurned,
    latest_weight_kg: weightKg,
    total_calories_burned_today: summary.totals.calories_burned,
    workout_count_today: summary.workouts.length,
    today_totals: summary.totals,
    targets: summary.targets,
    remaining: summary.remaining,
  };
}

function scaleItemFields(
  it: StoredMealItemWithMeta,
  mult: number,
): StoredMealItemWithMeta {
  return {
    ...it,
    grams: Math.max(0, Math.round(it.grams * mult)),
    kcal: Math.max(0, Math.round(it.kcal * mult)),
    protein: Math.max(0, Math.round(it.protein * mult * 10) / 10),
    carbs: Math.max(0, Math.round(it.carbs * mult * 10) / 10),
    fat: Math.max(0, Math.round(it.fat * mult * 10) / 10),
    ...(typeof it.fiber === "number"
      ? { fiber: Math.max(0, Math.round(it.fiber * mult * 10) / 10) }
      : {}),
  };
}

export async function r2fitUpdateOrDeleteEntry(rawInput: unknown, auth?: McpAuthContext) {
  const parsed = UpdateOrDeleteEntryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new McpServiceError(400, "invalid_input", parsed.error.message);
  }
  const input = parsed.data;
  const { profile, detectedBy, user } = await resolveMcpUser(input.profile, auth);

  if (input.entry_type === "meal") {
    const existing = await db.mealEntry.findUnique({ where: { id: input.entry_id } });
    if (!existing) {
      throw new McpServiceError(404, "entry_not_found", `Meal "${input.entry_id}" not found.`);
    }
    if (existing.userId !== user.id) {
      throw new McpServiceError(403, "forbidden", "Meal does not belong to requested profile.");
    }

    if (input.action === "delete") {
      await db.mealEntry.deleteMany({ where: { id: existing.id, userId: user.id } });
      await logActivity({
        actor: MCP_ACTOR,
        action: "delete-meal",
        entityId: existing.id,
        entityType: "MealEntry",
        payload: { profile, date: existing.date },
      });
      const summary = await r2fitGetTodaySummary({ profile, date: existing.date }, auth);
      return {
        ...authResponseMeta(profile, detectedBy, auth),
        deleted: true,
        entry_type: "meal" as const,
        entry_id: existing.id,
        profile,
        date: existing.date,
        today_totals: summary.totals,
        targets: summary.targets,
        remaining: summary.remaining,
      };
    }

    const patch = input.patch ?? {};
    const existingTotals = (existing.totals ?? {}) as {
      mealTitle?: string;
      notes?: string;
    };
    const nextMealTitle = patch.meal_title ?? existingTotals.mealTitle;
    const nextNotes = patch.notes !== undefined ? patch.notes : existingTotals.notes;
    const nextMealType = patch.meal_type ?? (existing.mealType as McpMealType);
    let nextDate = existing.date;
    let nextCreatedAt = existing.createdAt;
    if (patch.timestamp !== undefined) {
      const parsedTs = parseTimestampToDateAndKey(patch.timestamp);
      nextDate = parsedTs.date;
      nextCreatedAt = parsedTs.at;
    }

    let nextItems: StoredMealItemWithMeta[];
    if (patch.items && patch.items.length > 0) {
      nextItems = toStoredMealItems(patch.items, nextCreatedAt.getTime());
    } else {
      const currentRaw = Array.isArray(existing.items)
        ? (existing.items as Array<Record<string, unknown>>)
        : [];
      nextItems = currentRaw.map((o) => ({
        custom: true as const,
        name: typeof o?.name === "string" ? o.name : "Item",
        grams: typeof o?.grams === "number" ? o.grams : 100,
        ...(typeof o?.portionLabel === "string" ? { portionLabel: o.portionLabel } : {}),
        kcal: typeof o?.kcal === "number" ? o.kcal : 0,
        protein: typeof o?.protein === "number" ? o.protein : 0,
        carbs: typeof o?.carbs === "number" ? o.carbs : 0,
        fat: typeof o?.fat === "number" ? o.fat : 0,
        ...(typeof o?.fiber === "number" ? { fiber: o.fiber } : {}),
        ...(typeof o?.confidence === "string" || typeof o?.confidence === "number"
          ? { confidence: o.confidence as "high" | "medium" | "low" | number }
          : {}),
        addedAt: typeof o?.addedAt === "number" ? o.addedAt : nextCreatedAt.getTime(),
      }));

      const wholeMult = patch.portion_multiplier ?? patch.scale_factor;
      if (typeof wholeMult === "number" && wholeMult > 0) {
        nextItems = nextItems.map((it) => scaleItemFields(it, wholeMult));
      }

      if (patch.item_updates) {
        for (const u of patch.item_updates) {
          const targetIdx =
            typeof u.index === "number"
              ? u.index
              : u.name_match
                ? nextItems.findIndex((it) =>
                    it.name.toLowerCase().includes(u.name_match!.toLowerCase()),
                  )
                : -1;
          if (targetIdx < 0 || targetIdx >= nextItems.length) continue;
          let item = { ...nextItems[targetIdx] };
          if (typeof u.portion_multiplier === "number") {
            item = scaleItemFields(item, u.portion_multiplier);
          }
          if (u.name !== undefined) item.name = u.name;
          if (u.portion_desc !== undefined) item.portionLabel = u.portion_desc;
          if (u.portion_grams !== undefined) item.grams = Math.round(u.portion_grams);
          if (u.calories !== undefined) item.kcal = Math.round(u.calories);
          if (u.protein_g !== undefined) item.protein = Math.round(u.protein_g * 10) / 10;
          if (u.carbs_g !== undefined) item.carbs = Math.round(u.carbs_g * 10) / 10;
          if (u.fat_g !== undefined) item.fat = Math.round(u.fat_g * 10) / 10;
          if (u.fiber_g !== undefined) item.fiber = Math.round(u.fiber_g * 10) / 10;
          nextItems[targetIdx] = item;
        }
      }
    }

    const nextTotals = summarizeMealTotals(nextItems, {
      meal_title: nextMealTitle,
      notes: nextNotes,
    });
    const updated = await db.mealEntry.update({
      where: { id: existing.id },
      data: {
        date: nextDate,
        mealType: nextMealType,
        items: nextItems as never,
        totals: nextTotals as never,
        createdAt: nextCreatedAt,
      },
    });
    await logActivity({
      actor: MCP_ACTOR,
      action: "update-meal",
      entityId: updated.id,
      entityType: "MealEntry",
      payload: { profile, date: nextDate, totals: nextTotals },
    });
    const summary = await r2fitGetTodaySummary({ profile, date: nextDate }, auth);
    return {
      ...authResponseMeta(profile, detectedBy, auth),
      updated: true,
      entry_type: "meal" as const,
      entry_id: updated.id,
      profile,
      date: nextDate,
      meal_type: updated.mealType,
      meal_title: nextMealTitle ?? updated.mealType,
      meal_totals: {
        calories: nextTotals.kcal,
        protein_g: nextTotals.protein,
        carbs_g: nextTotals.carbs,
        fat_g: nextTotals.fat,
        fiber_g: nextTotals.fiber,
      },
      today_totals: summary.totals,
      targets: summary.targets,
      remaining: summary.remaining,
    };
  }

  // entry_type === "workout" -> try CardioSession first, then WorkoutSession
  const existingCardio = await db.cardioSession
    .findUnique({ where: { id: input.entry_id } })
    .catch(() => null);
  if (existingCardio) {
    if (existingCardio.userId !== user.id) {
      throw new McpServiceError(403, "forbidden", "Workout does not belong to requested profile.");
    }
    if (input.action === "delete") {
      await db.cardioSession.deleteMany({
        where: { id: existingCardio.id, userId: user.id },
      });
      await logActivity({
        actor: MCP_ACTOR,
        action: "delete-workout",
        entityId: existingCardio.id,
        entityType: "CardioSession",
        payload: { profile, date: existingCardio.date },
      });
      const summary = await r2fitGetTodaySummary({ profile, date: existingCardio.date }, auth);
      return {
        ...authResponseMeta(profile, detectedBy, auth),
        deleted: true,
        entry_type: "workout" as const,
        entry_id: existingCardio.id,
        profile,
        date: existingCardio.date,
        today_totals: summary.totals,
        workout_count_today: summary.workouts.length,
      };
    }

    const patch = input.patch ?? {};
    const prevMeta = (await fetchWorkoutMetadataMap([existingCardio.id])).get(existingCardio.id);
    const nextActivityType =
      patch.activity_type ??
      prevMeta?.activity_type ??
      mapCardioKindToMcpType(existingCardio.kind);
    const nextTitle = patch.title ?? prevMeta?.title ?? existingCardio.location ?? existingCardio.kind;
    const nextDistanceKm =
      patch.distance_km !== undefined
        ? patch.distance_km
        : existingCardio.distanceM != null
          ? existingCardio.distanceM / 1000
          : undefined;
    const nextDurationMin =
      patch.duration_min ??
      inferDurationMinutes(
        nextActivityType,
        existingCardio.durationSec > 0 ? existingCardio.durationSec / 60 : undefined,
        nextDistanceKm,
      );
    const nextIntensity = patch.intensity ?? prevMeta?.intensity ?? "moderate";
    const weightKg = await resolveBodyWeightKg(user, profile);
    const nextCalories = Math.round(
      patch.calories_burned ??
        estimateWorkoutCaloriesBurned({
          activityType: nextActivityType,
          durationMin: nextDurationMin,
          distanceKm: nextDistanceKm,
          intensity: nextIntensity,
          bodyWeightKg: weightKg,
        }),
    );
    let nextDate = existingCardio.date;
    let nextStartedAt = existingCardio.startedAt;
    if (patch.timestamp !== undefined) {
      const ts = parseTimestampToDateAndKey(patch.timestamp);
      nextDate = ts.date;
      nextStartedAt = ts.at;
    }

    await db.cardioSession.update({
      where: { id: existingCardio.id },
      data: {
        date: nextDate,
        kind: mapMcpActivityToCardioKind(nextActivityType),
        distanceM:
          typeof nextDistanceKm === "number" && nextDistanceKm > 0
            ? Math.round(nextDistanceKm * 1000)
            : null,
        durationSec: Math.round(nextDurationMin * 60),
        location: nextTitle.slice(0, 60),
        startedAt: nextStartedAt,
      },
    });
    await logActivity({
      actor: MCP_ACTOR,
      action: "update-workout",
      entityId: existingCardio.id,
      entityType: "CardioSession",
      payload: {
        profile,
        activity_type: nextActivityType,
        title: nextTitle,
        duration_min: nextDurationMin,
        ...(typeof nextDistanceKm === "number" ? { distance_km: nextDistanceKm } : {}),
        intensity: nextIntensity,
        calories_burned: nextCalories,
        notes: patch.notes !== undefined ? patch.notes : prevMeta?.notes,
        date: nextDate,
      },
    });
    const summary = await r2fitGetTodaySummary({ profile, date: nextDate }, auth);
    return {
      ...authResponseMeta(profile, detectedBy, auth),
      updated: true,
      entry_type: "workout" as const,
      entry_id: existingCardio.id,
      profile,
      date: nextDate,
      activity_type: nextActivityType,
      title: nextTitle,
      duration_min: nextDurationMin,
      calories_burned: nextCalories,
      today_totals: summary.totals,
      workout_count_today: summary.workouts.length,
    };
  }

  const existingWorkout = await db.workoutSession
    .findUnique({ where: { id: input.entry_id }, include: { exercises: true } })
    .catch(() => null);
  if (!existingWorkout) {
    throw new McpServiceError(
      404,
      "entry_not_found",
      `Workout "${input.entry_id}" not found.`,
    );
  }
  if (existingWorkout.userId !== user.id) {
    throw new McpServiceError(403, "forbidden", "Workout does not belong to requested profile.");
  }

  if (input.action === "delete") {
    await db.workoutSession.deleteMany({
      where: { id: existingWorkout.id, userId: user.id },
    });
    await logActivity({
      actor: MCP_ACTOR,
      action: "delete-workout",
      entityId: existingWorkout.id,
      entityType: "WorkoutSession",
      payload: { profile, date: existingWorkout.date },
    });
    const summary = await r2fitGetTodaySummary({ profile, date: existingWorkout.date }, auth);
    return {
      ...authResponseMeta(profile, detectedBy, auth),
      deleted: true,
      entry_type: "workout" as const,
      entry_id: existingWorkout.id,
      profile,
      date: existingWorkout.date,
      today_totals: summary.totals,
      workout_count_today: summary.workouts.length,
    };
  }

  const patch = input.patch ?? {};
  const prevMeta = (await fetchWorkoutMetadataMap([existingWorkout.id])).get(existingWorkout.id);
  const nextTitle = patch.title ?? prevMeta?.title ?? existingWorkout.location ?? existingWorkout.sessionType;
  const nextDurationMin = patch.duration_min ?? prevMeta?.duration_min ?? 45;
  const nextIntensity = patch.intensity ?? prevMeta?.intensity ?? "moderate";
  const nextExercises = patch.exercises;
  const nextTotalVolume = nextExercises
    ? nextExercises.reduce((sum, ex) => sum + ex.sets * ex.reps * ex.weight_kg, 0)
    : existingWorkout.totalVolume;
  const weightKg = await resolveBodyWeightKg(user, profile);
  const nextCalories = Math.round(
    patch.calories_burned ??
      estimateWorkoutCaloriesBurned({
        activityType: "gym",
        durationMin: nextDurationMin,
        intensity: nextIntensity,
        bodyWeightKg: weightKg,
        totalVolumeKg: nextTotalVolume,
      }),
  );
  let nextDate = existingWorkout.date;
  let nextCreatedAt = existingWorkout.createdAt;
  if (patch.timestamp !== undefined) {
    const ts = parseTimestampToDateAndKey(patch.timestamp);
    nextDate = ts.date;
    nextCreatedAt = ts.at;
  }

  await db.workoutSession.update({
    where: { id: existingWorkout.id },
    data: {
      date: nextDate,
      sessionType: patch.title ? inferGymSessionType(patch.title) : existingWorkout.sessionType,
      totalVolume: nextTotalVolume,
      location: nextTitle.slice(0, 60),
      createdAt: nextCreatedAt,
      ...(nextExercises
        ? {
            exercises: {
              deleteMany: {},
              create: nextExercises.map((ex) => ({
                name: ex.name,
                sets: Array.from({ length: ex.sets }, (_, idx) => ({
                  setNumber: idx + 1,
                  weight: ex.weight_kg,
                  reps: ex.reps,
                  loggedAt: nextCreatedAt.getTime(),
                })) as never,
              })),
            },
          }
        : {}),
    },
  });
  await logActivity({
    actor: MCP_ACTOR,
    action: "update-workout",
    entityId: existingWorkout.id,
    entityType: "WorkoutSession",
    payload: {
      profile,
      activity_type: "gym",
      title: nextTitle,
      duration_min: nextDurationMin,
      intensity: nextIntensity,
      calories_burned: nextCalories,
      notes: patch.notes !== undefined ? patch.notes : prevMeta?.notes,
      date: nextDate,
    },
  });
  const summary = await r2fitGetTodaySummary({ profile, date: nextDate }, auth);
  return {
    ...authResponseMeta(profile, detectedBy, auth),
    updated: true,
    entry_type: "workout" as const,
    entry_id: existingWorkout.id,
    profile,
    date: nextDate,
    activity_type: "gym" as const,
    title: nextTitle,
    duration_min: nextDurationMin,
    calories_burned: nextCalories,
    today_totals: summary.totals,
    workout_count_today: summary.workouts.length,
  };
}
