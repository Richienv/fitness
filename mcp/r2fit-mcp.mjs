#!/usr/bin/env node
/**
 * Stdio MCP server bridge (`r2fit-mcp`) for OpenBot / local AI clients on macOS.
 * Exposes all 5 R2 Fit tools over MCP stdio and forwards requests securely over HTTPS
 * using `Authorization: Bearer $R2FIT_MCP_API_KEY` (or `R2FIT_MCP_API_KEY_RENITA` / `R2FIT_MCP_API_KEY_RICHIE`)
 * to `R2FIT_BASE_URL` (default https://r2-fit.vercel.app).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.R2FIT_BASE_URL || "https://r2-fit.vercel.app").replace(/\/+$/, "");

function requireToken() {
  const token = (
    process.env.R2FIT_MCP_API_KEY ||
    process.env.R2FIT_MCP_API_KEY_RENITA ||
    process.env.R2FIT_MCP_API_KEY_RICHIE ||
    ""
  ).trim();
  if (!token) {
    throw new Error(
      "Missing R2FIT_MCP_API_KEY (or R2FIT_MCP_API_KEY_RENITA / R2FIT_MCP_API_KEY_RICHIE) environment variable.",
    );
  }
  return token;
}

async function callR2FitApi(path, { method = "GET", body } = {}) {
  const token = requireToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok || json?.ok === false) {
    const err = new Error(json?.message || json?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json.data ?? json;
}

const OptionalProfileSchema = z.enum(["richie", "renita"]).optional();
const MealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

const MealItemSchema = z.object({
  name: z.string().trim().min(1),
  portion_desc: z.string().trim().min(1),
  portion_grams: z.number().nonnegative(),
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative().optional(),
  confidence: z.union([z.enum(["high", "medium", "low"]), z.number().min(0).max(1)]).default("medium"),
});

const GymExerciseSchema = z.object({
  name: z.string().trim().min(1),
  sets: z.number().int().positive().default(3),
  reps: z.number().int().positive().default(10),
  weight_kg: z.number().nonnegative().default(0),
});

const server = new McpServer({
  name: "r2fit-mcp",
  version: "1.1.0",
});

server.registerTool(
  "r2fit_whoami",
  {
    title: "Identify Active R2 Fit Profile",
    description:
      "Return the auto-detected active R2 Fit profile from the configured token (Richie or Renita), targets, latest body weight, and today's summary.",
    inputSchema: {
      profile: OptionalProfileSchema,
    },
  },
  async (args) => {
    try {
      const qs = new URLSearchParams();
      if (args?.profile) qs.set("profile", args.profile);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const data = await callR2FitApi(`/api/mcp/whoami${suffix}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: err.message }) }],
      };
    }
  },
);

server.registerTool(
  "r2fit_log_meal",
  {
    title: "Log Meal to R2 Fit",
    description:
      "Log a meal with macro breakdown into R2 Fit. Omit `profile` to auto-detect from token. Returns detected_profile, entry_id, today totals, and remaining daily targets.",
    inputSchema: {
      profile: OptionalProfileSchema,
      meal_type: MealTypeSchema,
      timestamp: z.union([z.string(), z.number()]).optional(),
      meal_title: z.string().trim().min(1),
      items: z.array(MealItemSchema).min(1),
      notes: z.string().trim().optional(),
    },
  },
  async (args) => {
    try {
      const data = await callR2FitApi("/api/mcp/meals", { method: "POST", body: args });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: err.message }) }],
      };
    }
  },
);

server.registerTool(
  "r2fit_log_workout",
  {
    title: "Log Workout or Activity to R2 Fit",
    description:
      "Log a gym workout, walk, run, bike ride, or sport into R2 Fit. Omit `profile` to auto-detect from token. Returns detected_profile, entry_id, and total calories burned today.",
    inputSchema: {
      profile: OptionalProfileSchema,
      activity_type: z.enum(["walking", "cycling", "running", "gym", "sports", "other"]),
      title: z.string().trim().min(1),
      duration_min: z.number().positive().optional(),
      distance_km: z.number().nonnegative().optional(),
      intensity: z.enum(["light", "moderate", "intense"]).default("moderate"),
      calories_burned: z.number().nonnegative().optional(),
      exercises: z.array(GymExerciseSchema).optional(),
      timestamp: z.union([z.string(), z.number()]).optional(),
      notes: z.string().trim().optional(),
    },
  },
  async (args) => {
    try {
      const data = await callR2FitApi("/api/mcp/workouts", { method: "POST", body: args });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: err.message }) }],
      };
    }
  },
);

server.registerTool(
  "r2fit_get_today_summary",
  {
    title: "Get Today R2 Fit Summary",
    description:
      "Fetch today's meals, workouts/activities, calories & macros consumed, calories burned, and remaining daily targets for the auto-detected or specified profile.",
    inputSchema: {
      profile: OptionalProfileSchema,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
  },
  async (args) => {
    try {
      const qs = new URLSearchParams();
      if (args?.profile) qs.set("profile", args.profile);
      if (args?.date) qs.set("date", args.date);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const data = await callR2FitApi(`/api/mcp/summary${suffix}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: err.message }) }],
      };
    }
  },
);

server.registerTool(
  "r2fit_update_or_delete_entry",
  {
    title: "Update or Delete R2 Fit Entry",
    description:
      "Update or delete a logged meal or workout entry by entry_id (e.g. half a portion of rice, fix calories, or remove last log). Omit `profile` to auto-detect from token.",
    inputSchema: {
      profile: OptionalProfileSchema,
      entry_type: z.enum(["meal", "workout"]),
      entry_id: z.string().trim().min(1),
      action: z.enum(["update", "delete"]),
      patch: z.record(z.string(), z.unknown()).optional(),
    },
  },
  async (args) => {
    try {
      const data = await callR2FitApi("/api/mcp/entries", { method: "POST", body: args });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: err.message }) }],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("r2fit-mcp fatal error:", err);
  process.exit(1);
});
