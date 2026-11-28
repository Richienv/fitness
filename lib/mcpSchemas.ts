// Single source of truth for all 4 R2 Fit MCP tool Zod schemas & pure helpers.
// Zero DB/Next imports so Node CLI, Next.js server routes, and tests share identical validation.
import { z } from "zod";

export const ProfileSchema = z.enum(["richie", "renita"]);
export const OptionalProfileSchema = ProfileSchema.optional();
export type McpProfile = z.infer<typeof ProfileSchema>;

export const WhoAmIInputSchema = z.object({
  profile: OptionalProfileSchema,
});

export const MealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export type McpMealType = z.infer<typeof MealTypeSchema>;

export const MealItemInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  portion_desc: z.string().trim().min(1).max(120),
  portion_grams: z.number().nonnegative().max(10_000),
  calories: z.number().nonnegative().max(20_000),
  protein_g: z.number().nonnegative().max(2_000),
  carbs_g: z.number().nonnegative().max(2_000),
  fat_g: z.number().nonnegative().max(2_000),
  fiber_g: z.number().nonnegative().max(1_000).optional(),
  confidence: z
    .union([z.enum(["high", "medium", "low"]), z.number().min(0).max(1)])
    .default("medium"),
});
export type McpMealItemInput = z.infer<typeof MealItemInputSchema>;

export const LogMealInputSchema = z.object({
  profile: OptionalProfileSchema,
  meal_type: MealTypeSchema,
  timestamp: z.union([z.string(), z.number()]).optional(),
  meal_title: z.string().trim().min(1).max(160),
  items: z.array(MealItemInputSchema).min(1).max(50),
  notes: z.string().trim().max(500).optional(),
});

export const GymExerciseInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sets: z.number().int().positive().max(100).default(3),
  reps: z.number().int().positive().max(500).default(10),
  weight_kg: z.number().nonnegative().max(1_000).default(0),
});

export const LogWorkoutInputSchema = z.object({
  profile: OptionalProfileSchema,
  activity_type: z.enum(["walking", "cycling", "running", "gym", "sports", "other"]),
  title: z.string().trim().min(1).max(160),
  duration_min: z.number().positive().max(1_440).optional(),
  distance_km: z.number().nonnegative().max(1_000).optional(),
  intensity: z.enum(["light", "moderate", "intense"]).default("moderate"),
  calories_burned: z.number().nonnegative().max(15_000).optional(),
  exercises: z.array(GymExerciseInputSchema).max(40).optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const GetTodaySummaryInputSchema = z.object({
  profile: OptionalProfileSchema,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});

export const ItemUpdatePatchSchema = z.object({
  index: z.number().int().nonnegative().optional(),
  name_match: z.string().trim().min(1).max(120).optional(),
  portion_multiplier: z.number().positive().max(20).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  portion_desc: z.string().trim().min(1).max(120).optional(),
  portion_grams: z.number().nonnegative().max(10_000).optional(),
  calories: z.number().nonnegative().max(20_000).optional(),
  protein_g: z.number().nonnegative().max(2_000).optional(),
  carbs_g: z.number().nonnegative().max(2_000).optional(),
  fat_g: z.number().nonnegative().max(2_000).optional(),
  fiber_g: z.number().nonnegative().max(1_000).optional(),
});

export const UpdateOrDeleteEntryInputSchema = z.object({
  profile: OptionalProfileSchema,
  entry_type: z.enum(["meal", "workout"]),
  entry_id: z.string().trim().min(1).max(120),
  action: z.enum(["update", "delete"]),
  patch: z
    .object({
      meal_type: MealTypeSchema.optional(),
      meal_title: z.string().trim().min(1).max(160).optional(),
      notes: z.string().trim().max(500).optional(),
      timestamp: z.union([z.string(), z.number()]).optional(),
      items: z.array(MealItemInputSchema).min(1).max(50).optional(),
      portion_multiplier: z.number().positive().max(20).optional(),
      scale_factor: z.number().positive().max(20).optional(),
      item_updates: z.array(ItemUpdatePatchSchema).min(1).max(30).optional(),
      activity_type: z
        .enum(["walking", "cycling", "running", "gym", "sports", "other"])
        .optional(),
      title: z.string().trim().min(1).max(160).optional(),
      duration_min: z.number().positive().max(1_440).optional(),
      distance_km: z.number().nonnegative().max(1_000).optional(),
      intensity: z.enum(["light", "moderate", "intense"]).optional(),
      calories_burned: z.number().nonnegative().max(15_000).optional(),
      exercises: z.array(GymExerciseInputSchema).max(40).optional(),
    })
    .optional(),
});
