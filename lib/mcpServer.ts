// Builds an McpServer instance registering all R2 Fit tools cleanly.
// Accepts optional executors so unit tests & stdio proxy share identical tool schemas.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GetTodaySummaryInputSchema,
  LogMealInputSchema,
  LogWorkoutInputSchema,
  UpdateOrDeleteEntryInputSchema,
  WhoAmIInputSchema,
} from "./mcpSchemas.ts";

export interface McpToolExecutors {
  logMeal: (input: unknown) => Promise<unknown>;
  logWorkout: (input: unknown) => Promise<unknown>;
  getTodaySummary: (input: unknown) => Promise<unknown>;
  updateOrDeleteEntry: (input: unknown) => Promise<unknown>;
  whoAmI?: (input: unknown) => Promise<unknown>;
}

function toolSuccess(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function toolFailure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const status =
    err && typeof err === "object" && "status" in err && typeof err.status === "number"
      ? err.status
      : undefined;
  const code =
    err && typeof err === "object" && "code" in err && typeof err.code === "string"
      ? err.code
      : undefined;
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: false,
          ...(code ? { code } : {}),
          ...(status ? { status } : {}),
          error: message,
        }),
      },
    ],
  };
}

export function createR2FitMcpServer(executors: McpToolExecutors): McpServer {
  const server = new McpServer({
    name: "r2fit-mcp",
    version: "1.1.0",
  });

  server.registerTool(
    "r2fit_whoami",
    {
      title: "Identify Active R2 Fit Profile",
      description:
        "Return the auto-detected active R2 Fit profile from the caller token (Richie or Renita), display name, daily calorie/macro targets, latest body weight, and today's summary. Omit `profile` to auto-detect from the configured token.",
      inputSchema: WhoAmIInputSchema.shape,
    },
    async (args) => {
      try {
        const runner = executors.whoAmI ?? executors.getTodaySummary;
        return toolSuccess(await runner(args));
      } catch (err) {
        return toolFailure(err);
      }
    },
  );

  server.registerTool(
    "r2fit_log_meal",
    {
      title: "Log Meal to R2 Fit",
      description:
        "Log an itemized meal with calories & macros (e.g. broken down from a food photo or description) into R2 Fit. Omit `profile` to auto-detect from token. Returns detected_profile, entry_id, updated today macro totals, and remaining daily targets.",
      inputSchema: LogMealInputSchema.shape,
    },
    async (args) => {
      try {
        return toolSuccess(await executors.logMeal(args));
      } catch (err) {
        return toolFailure(err);
      }
    },
  );

  server.registerTool(
    "r2fit_log_workout",
    {
      title: "Log Workout or Cardio Activity to R2 Fit",
      description:
        "Log a gym session (with optional exercises/sets/reps/weight) or cardio/sport activity (walking, cycling, running, sports, other) with duration, distance, intensity, and calories burned. Omit `profile` to auto-detect from token.",
      inputSchema: LogWorkoutInputSchema.shape,
    },
    async (args) => {
      try {
        return toolSuccess(await executors.logWorkout(args));
      } catch (err) {
        return toolFailure(err);
      }
    },
  );

  server.registerTool(
    "r2fit_get_today_summary",
    {
      title: "Get Today R2 Fit Summary",
      description:
        "Inspect meals, workouts/activities, total kcal/protein/carbs/fat/fiber consumed, total calories burned, targets, and remaining calorie & protein budgets for the active or requested profile and date.",
      inputSchema: GetTodaySummaryInputSchema.shape,
    },
    async (args) => {
      try {
        return toolSuccess(await executors.getTodaySummary(args));
      } catch (err) {
        return toolFailure(err);
      }
    },
  );

  server.registerTool(
    "r2fit_update_or_delete_entry",
    {
      title: "Update or Delete R2 Fit Meal or Workout Entry",
      description:
        "Update (e.g. scale rice portion by 0.5 or patch items/duration/calories) or delete a specific logged meal or workout entry by entry_id and return updated daily totals.",
      inputSchema: UpdateOrDeleteEntryInputSchema.shape,
    },
    async (args) => {
      try {
        return toolSuccess(await executors.updateOrDeleteEntry(args));
      } catch (err) {
        return toolFailure(err);
      }
    },
  );

  return server;
}
