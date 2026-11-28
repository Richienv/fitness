import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hasMcpApiKey, readSuppliedMcpToken, requireMcpAuth } from "./mcpAuth.ts";
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
  ProfileSchema,
  UpdateOrDeleteEntryInputSchema,
} from "./mcpSchemas.ts";
import { createR2FitMcpServer } from "./mcpServer.ts";

test("MCP auth enforces R2FIT_MCP_API_KEY Bearer token fail-closed", () => {
  const prev = process.env.R2FIT_MCP_API_KEY;
  try {
    delete process.env.R2FIT_MCP_API_KEY;
    const reqNoEnv = new Request("https://r2-fit.vercel.app/api/mcp", {
      headers: { Authorization: "Bearer anything" },
    });
    assert.equal(hasMcpApiKey(reqNoEnv), false);
    assert.equal(requireMcpAuth(reqNoEnv)?.status, 503);

    process.env.R2FIT_MCP_API_KEY = "test-secret-r2fit-token-123";
    const reqMissing = new Request("https://r2-fit.vercel.app/api/mcp");
    assert.equal(hasMcpApiKey(reqMissing), false);
    assert.equal(requireMcpAuth(reqMissing)?.status, 401);

    const reqWrong = new Request("https://r2-fit.vercel.app/api/mcp", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    assert.equal(hasMcpApiKey(reqWrong), false);
    assert.equal(requireMcpAuth(reqWrong)?.status, 401);

    const reqValid = new Request("https://r2-fit.vercel.app/api/mcp", {
      headers: { Authorization: "Bearer test-secret-r2fit-token-123" },
    });
    assert.equal(readSuppliedMcpToken(reqValid), "test-secret-r2fit-token-123");
    assert.equal(hasMcpApiKey(reqValid), true);
    assert.equal(requireMcpAuth(reqValid), null);
  } finally {
    if (prev === undefined) delete process.env.R2FIT_MCP_API_KEY;
    else process.env.R2FIT_MCP_API_KEY = prev;
  }
});

test("Strict profile schema defaults to richie and rejects arbitrary profile spoofing", () => {
  assert.equal(ProfileSchema.parse(undefined), "richie");
  assert.equal(ProfileSchema.parse("richie"), "richie");
  assert.equal(ProfileSchema.parse("renita"), "renita");
  assert.throws(() => ProfileSchema.parse("admin"));
  assert.throws(() => ProfileSchema.parse("guest"));
});

test("MCP tool input schemas validate meal breakdown, workouts, summary, and entry edits", () => {
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
  assert.equal(meal.profile, "richie");

  const walk = LogWorkoutInputSchema.parse({
    activity_type: "walking",
    title: "Jalan kaki santai 1 km",
    distance_km: 1,
    intensity: "light",
  });
  assert.equal(walk.profile, "richie");

  const gym = LogWorkoutInputSchema.parse({
    activity_type: "gym",
    title: "Chest Day 45 menit",
    duration_min: 45,
    exercises: [{ name: "Bench Press", sets: 4, reps: 10, weight_kg: 60 }],
  });
  assert.equal(gym.exercises?.length, 1);

  const summary = GetTodaySummaryInputSchema.parse({});
  assert.equal(summary.profile, "richie");

  const edit = UpdateOrDeleteEntryInputSchema.parse({
    entry_type: "meal",
    entry_id: "mcp-meal-123",
    action: "update",
    patch: { item_updates: [{ name_match: "nasi", portion_multiplier: 0.5 }] },
  });
  assert.equal(edit.profile, "richie");
});

test("Activity codec infers realistic durations and active calories burned", () => {
  assert.equal(inferDurationMinutes("walking", undefined, 1), 12);
  assert.equal(inferDurationMinutes("cycling", 5), 5);
  assert.equal(inferDurationMinutes("gym", 45), 45);

  const walkBurn = estimateWorkoutCaloriesBurned({
    activityType: "walking",
    durationMin: 12,
    distanceKm: 1,
    intensity: "light",
    bodyWeightKg: 73,
  });
  assert.ok(walkBurn >= 25 && walkBurn <= 90, `unexpected walkBurn=${walkBurn}`);

  const chestBurn = estimateWorkoutCaloriesBurned({
    activityType: "gym",
    durationMin: 45,
    intensity: "moderate",
    bodyWeightKg: 73,
    totalVolumeKg: 2400,
  });
  assert.ok(chestBurn >= 150 && chestBurn <= 600, `unexpected chestBurn=${chestBurn}`);

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

test("createR2FitMcpServer registers all 4 required MCP tools", () => {
  const noop = async () => ({});
  const srv = createR2FitMcpServer({
    logMeal: noop,
    logWorkout: noop,
    getTodaySummary: noop,
    updateOrDeleteEntry: noop,
  }) as unknown as {
    _registeredTools: Record<string, unknown>;
  };
  const names = Object.keys(srv._registeredTools ?? {}).sort();
  assert.deepEqual(names, [
    "r2fit_get_today_summary",
    "r2fit_log_meal",
    "r2fit_log_workout",
    "r2fit_update_or_delete_entry",
  ]);
});

test("stdio r2fit-mcp.mjs responds cleanly to MCP initialize and tools/list over stdio", async () => {
  const stdioPath = fileURLToPath(new URL("../mcp/r2fit-mcp.mjs", import.meta.url));
  const child = spawn(process.execPath, [stdioPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, R2FIT_MCP_API_KEY: "dummy-local-key" },
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

  const initReq = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  };
  child.stdin.write(`${JSON.stringify(initReq)}\n`);

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
  ]);
});
