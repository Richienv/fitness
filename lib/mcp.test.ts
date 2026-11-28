import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  authenticateMcpRequest,
  enforceMcpProfileAccess,
  findForbiddenRpcProfileError,
  hasMcpApiKey,
  McpAuthAccessError,
  readSuppliedMcpToken,
  requireMcpAuth,
  resolveMcpAuth,
} from "./mcpAuth.ts";
import {
  estimateWorkoutCaloriesBurned,
  inferDurationMinutes,
  mapCardioKindToActivityKey,
  mapCardioKindToMcpType,
  mapMcpActivityToCardioKind,
} from "./activityCodec.ts";
import { reconcileServerMeals, type ServerMealRow } from "./mealRecords.ts";
import {
  GetTodaySummaryInputSchema,
  LogMealInputSchema,
  LogWorkoutInputSchema,
  OptionalProfileSchema,
  ProfileSchema,
  UpdateOrDeleteEntryInputSchema,
  WhoAmIInputSchema,
} from "./mcpSchemas.ts";
import { createR2FitMcpServer } from "./mcpServer.ts";

test("MCP auth enforces multi-profile Bearer tokens with fail-closed behavior", () => {
  const prevMain = process.env.R2FIT_MCP_API_KEY;
  const prevRichie = process.env.R2FIT_MCP_API_KEY_RICHIE;
  const prevRenita = process.env.R2FIT_MCP_API_KEY_RENITA;
  try {
    delete process.env.R2FIT_MCP_API_KEY;
    delete process.env.R2FIT_MCP_API_KEY_RICHIE;
    delete process.env.R2FIT_MCP_API_KEY_RENITA;

    const reqNoEnv = new Request("https://r2-fit.vercel.app/api/mcp", {
      headers: { Authorization: "Bearer anything" },
    });
    assert.equal(hasMcpApiKey(reqNoEnv), false);
    assert.equal(requireMcpAuth(reqNoEnv)?.status, 503);

    process.env.R2FIT_MCP_API_KEY = "richie-token-abc123";
    process.env.R2FIT_MCP_API_KEY_RENITA = "renita-token-xyz789";

    const reqMissing = new Request("https://r2-fit.vercel.app/api/mcp");
    assert.equal(hasMcpApiKey(reqMissing), false);
    assert.equal(requireMcpAuth(reqMissing)?.status, 401);

    const reqWrong = new Request("https://r2-fit.vercel.app/api/mcp", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    assert.equal(hasMcpApiKey(reqWrong), false);
    assert.equal(requireMcpAuth(reqWrong)?.status, 401);

    const reqRichie = new Request("https://r2-fit.vercel.app/api/mcp", {
      headers: { Authorization: "Bearer richie-token-abc123" },
    });
    assert.equal(readSuppliedMcpToken(reqRichie), "richie-token-abc123");
    assert.equal(hasMcpApiKey(reqRichie), true);
    assert.equal(requireMcpAuth(reqRichie), null);
    assert.deepEqual(resolveMcpAuth(reqRichie), {
      caller: "richie",
      allowProfileOverride: true,
      tokenEnvName: "R2FIT_MCP_API_KEY",
    });

    const reqRenita = new Request("https://r2-fit.vercel.app/api/mcp", {
      headers: { "x-api-key": "renita-token-xyz789" },
    });
    const renitaAuthRes = authenticateMcpRequest(reqRenita);
    assert.equal(renitaAuthRes.error, null);
    assert.deepEqual(renitaAuthRes.auth, {
      caller: "renita",
      allowProfileOverride: false,
      tokenEnvName: "R2FIT_MCP_API_KEY_RENITA",
    });
  } finally {
    if (prevMain === undefined) delete process.env.R2FIT_MCP_API_KEY;
    else process.env.R2FIT_MCP_API_KEY = prevMain;
    if (prevRichie === undefined) delete process.env.R2FIT_MCP_API_KEY_RICHIE;
    else process.env.R2FIT_MCP_API_KEY_RICHIE = prevRichie;
    if (prevRenita === undefined) delete process.env.R2FIT_MCP_API_KEY_RENITA;
    else process.env.R2FIT_MCP_API_KEY_RENITA = prevRenita;
  }
});

test("Token-based auto-detect resolves Renita automatically and hard-blocks Renita -> Richie with 403", () => {
  const richieAuth = {
    caller: "richie" as const,
    allowProfileOverride: true,
    tokenEnvName: "R2FIT_MCP_API_KEY" as const,
  };
  const renitaAuth = {
    caller: "renita" as const,
    allowProfileOverride: false,
    tokenEnvName: "R2FIT_MCP_API_KEY_RENITA" as const,
  };

  // Omitted profile auto-detects from token
  assert.deepEqual(enforceMcpProfileAccess(undefined, richieAuth), {
    profile: "richie",
    detectedBy: "token",
  });
  assert.deepEqual(enforceMcpProfileAccess(undefined, renitaAuth), {
    profile: "renita",
    detectedBy: "token",
  });
  assert.deepEqual(enforceMcpProfileAccess("", renitaAuth), {
    profile: "renita",
    detectedBy: "token",
  });

  // Richie retains backwards-compatible explicit override to Renita when requested
  assert.deepEqual(enforceMcpProfileAccess("renita", richieAuth), {
    profile: "renita",
    detectedBy: "argument",
  });

  // Renita can query her own profile explicitly, but is blocked with HTTP 403 for Richie
  assert.deepEqual(enforceMcpProfileAccess("renita", renitaAuth), {
    profile: "renita",
    detectedBy: "token",
  });
  assert.throws(
    () => enforceMcpProfileAccess("richie", renitaAuth),
    (err: unknown) => err instanceof McpAuthAccessError && err.status === 403,
  );

  // Invalid profile rejected with 400
  assert.throws(
    () => enforceMcpProfileAccess("admin", renitaAuth),
    (err: unknown) => err instanceof McpAuthAccessError && err.status === 400,
  );

  // JSON-RPC Streamable HTTP pre-flight block catches Renita -> Richie tool calls at HTTP layer
  const blockedRpc = findForbiddenRpcProfileError(
    {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "r2fit_log_meal", arguments: { profile: "richie" } },
    },
    renitaAuth,
  );
  assert.equal(blockedRpc?.status, 403);

  const allowedRpcOmitted = findForbiddenRpcProfileError(
    {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "r2fit_get_today_summary", arguments: {} },
    },
    renitaAuth,
  );
  assert.equal(allowedRpcOmitted, null);
});

test("Strict profile schemas keep omitted profile undefined so server auto-detects from token", () => {
  assert.equal(OptionalProfileSchema.parse(undefined), undefined);
  assert.equal(ProfileSchema.parse("richie"), "richie");
  assert.equal(ProfileSchema.parse("renita"), "renita");
  assert.throws(() => ProfileSchema.parse("admin"));
  assert.throws(() => ProfileSchema.parse("guest"));

  const meal = LogMealInputSchema.parse({
    meal_type: "lunch",
    meal_title: "Nasi Padang Dada Ayam",
    items: [
      {
        name: "Nasi putih",
        portion_desc: "1 porsi",
        portion_grams: 150,
        calories: 195,
        protein_g: 4,
        carbs_g: 42,
        fat_g: 0.4,
        fiber_g: 0.6,
        confidence: "high",
      },
    ],
  });
  assert.equal(meal.profile, undefined);

  const walk = LogWorkoutInputSchema.parse({
    activity_type: "walking",
    title: "Jalan kaki santai 1 km",
    distance_km: 1,
    intensity: "light",
  });
  assert.equal(walk.profile, undefined);

  const gym = LogWorkoutInputSchema.parse({
    activity_type: "gym",
    title: "Lower Body 45 menit",
    duration_min: 45,
    exercises: [{ name: "Romanian Deadlift", sets: 4, reps: 10, weight_kg: 35 }],
  });
  assert.equal(gym.exercises?.length, 1);

  assert.equal(GetTodaySummaryInputSchema.parse({}).profile, undefined);
  assert.equal(WhoAmIInputSchema.parse({}).profile, undefined);

  const edit = UpdateOrDeleteEntryInputSchema.parse({
    entry_type: "meal",
    entry_id: "mcp-meal-123",
    action: "update",
    patch: { item_updates: [{ name_match: "nasi", portion_multiplier: 0.5 }] },
  });
  assert.equal(edit.profile, undefined);
});

test("Activity codec estimates active calories accurately for Renita (45.5 kg) vs Richie (73 kg)", () => {
  assert.equal(inferDurationMinutes("walking", undefined, 1), 12);
  assert.equal(inferDurationMinutes("cycling", 5), 5);
  assert.equal(inferDurationMinutes("gym", 45), 45);

  const richieWalk = estimateWorkoutCaloriesBurned({
    activityType: "walking",
    durationMin: 12,
    distanceKm: 1,
    intensity: "light",
    bodyWeightKg: 73,
  });
  const renitaWalk = estimateWorkoutCaloriesBurned({
    activityType: "walking",
    durationMin: 12,
    distanceKm: 1,
    intensity: "light",
    bodyWeightKg: 45.5,
  });
  assert.ok(richieWalk > renitaWalk, `expected richie (${richieWalk}) > renita (${renitaWalk})`);
  assert.ok(renitaWalk >= 18 && renitaWalk <= 50, `unexpected renitaWalk=${renitaWalk}`);

  const richieGym = estimateWorkoutCaloriesBurned({
    activityType: "gym",
    durationMin: 45,
    intensity: "moderate",
    bodyWeightKg: 73,
    totalVolumeKg: 2400,
  });
  const renitaGym = estimateWorkoutCaloriesBurned({
    activityType: "gym",
    durationMin: 45,
    intensity: "moderate",
    bodyWeightKg: 45.5,
    totalVolumeKg: 1200,
  });
  assert.ok(richieGym > renitaGym, `expected richieGym (${richieGym}) > renitaGym (${renitaGym})`);
  assert.ok(renitaGym >= 100 && renitaGym <= 250, `unexpected renitaGym=${renitaGym}`);

  assert.equal(mapMcpActivityToCardioKind("walking"), "jalan");
  assert.equal(mapCardioKindToActivityKey("sepeda"), "sepeda");
  assert.equal(mapCardioKindToMcpType("jalan"), "walking");
});

test("reconcileServerMeals keeps independent mcp-meal-* rows separated so updates and deletes sync 1:1", () => {
  const r1: ServerMealRow = {
    id: "mcp-meal-1",
    date: "2026-11-28",
    mealType: "lunch",
    items: [{ custom: true, name: "Nasi putih", grams: 150, kcal: 195, protein: 4, carbs: 42, fat: 0.4, addedAt: 1 }],
    totals: { kcal: 195, protein: 4, carbs: 42, fat: 0.4 },
  };
  const r2: ServerMealRow = {
    id: "mcp-meal-2",
    date: "2026-11-28",
    mealType: "lunch",
    items: [{ custom: true, name: "Dada ayam", grams: 180, kcal: 297, protein: 55, carbs: 0, fat: 6.5, addedAt: 2 }],
    totals: { kcal: 297, protein: 55, carbs: 0, fat: 6.5 },
  };
  const first = reconcileServerMeals([], [], {}, [r1, r2], { fromDate: "2026-11-20" });
  assert.equal(first.meals.length, 2);
  assert.deepEqual(
    first.meals.map((m) => m.id),
    ["mcp-meal-1", "mcp-meal-2"],
  );

  // Deleting mcp-meal-2 remotely removes only mcp-meal-2 on client sync
  const afterDel = reconcileServerMeals(first.meals, first.importedIds, first.sigs, [r1], {
    fromDate: "2026-11-20",
  });
  assert.equal(afterDel.meals.length, 1);
  assert.equal(afterDel.meals[0].id, "mcp-meal-1");
});

test("createR2FitMcpServer registers all 5 MCP tools including r2fit_whoami", async () => {
  const noop = async () => ({});
  let whoAmICalledWith: unknown = null;
  const srv = createR2FitMcpServer({
    logMeal: noop,
    logWorkout: noop,
    getTodaySummary: noop,
    updateOrDeleteEntry: noop,
    whoAmI: async (input) => {
      whoAmICalledWith = input;
      return {
        detected_profile: "renita",
        profile: "renita",
        message: "Tersambung sebagai profil R2 Fit: Renita",
      };
    },
  }) as unknown as {
    _registeredTools: Record<string, { handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }> }>;
  };
  const names = Object.keys(srv._registeredTools ?? {}).sort();
  assert.deepEqual(names, [
    "r2fit_get_today_summary",
    "r2fit_log_meal",
    "r2fit_log_workout",
    "r2fit_update_or_delete_entry",
    "r2fit_whoami",
  ]);
  const res = await srv._registeredTools.r2fit_whoami.handler({});
  assert.deepEqual(whoAmICalledWith, {});
  assert.equal(JSON.parse(res.content[0].text).detected_profile, "renita");
});

test("stdio r2fit-mcp.mjs exposes all 5 tools including r2fit_whoami and accepts R2FIT_MCP_API_KEY_RENITA", async () => {
  const stdioPath = fileURLToPath(new URL("../mcp/r2fit-mcp.mjs", import.meta.url));
  const child = spawn(process.execPath, [stdioPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, R2FIT_MCP_API_KEY_RENITA: "dummy-renita-key" },
  });

  const messages: Array<Record<string, unknown>> = [];
  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        messages.push(JSON.parse(line));
      }
    }
  });

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    })}\n`,
  );

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for initialize")), 4000);
    const check = () => {
      if (messages.some((m) => m.id === 1)) {
        clearTimeout(timer);
        resolve();
      } else {
        setTimeout(check, 25);
      }
    };
    check();
  });

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);

  const listResp = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for tools/list")), 4000);
    const check = () => {
      const found = messages.find((m) => m.id === 2);
      if (found) {
        clearTimeout(timer);
        resolve(found);
      } else {
        setTimeout(check, 25);
      }
    };
    check();
  });

  child.kill();
  const result = listResp.result as { tools: Array<{ name: string }> };
  const toolNames = result.tools.map((t) => t.name).sort();
  assert.deepEqual(toolNames, [
    "r2fit_get_today_summary",
    "r2fit_log_meal",
    "r2fit_log_workout",
    "r2fit_update_or_delete_entry",
    "r2fit_whoami",
  ]);
});
