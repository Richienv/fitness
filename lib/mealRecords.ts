import type { MealItem } from "./store.ts";
import { scaleNutritionExtras } from "./nutritionLabel.ts";

/** Server items written by older Hermes builds lack the MealItem shape —
 * coerce anything with a name+kcal into a CustomMealItem the UI can render. */
export function coerceServerItems(raw: unknown): MealItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MealItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const at =
      typeof o.addedAt === "number" && isFinite(o.addedAt)
        ? { addedAt: o.addedAt }
        : {};
    if (o.custom === true && typeof o.name === "string") {
      out.push({
        custom: true,
        name: o.name,
        grams: typeof o.grams === "number" ? o.grams : 100,
        kcal: typeof o.kcal === "number" ? o.kcal : 0,
        protein: typeof o.protein === "number" ? o.protein : 0,
        fat: typeof o.fat === "number" ? o.fat : 0,
        carbs: typeof o.carbs === "number" ? o.carbs : 0,
        ...(typeof o.portionLabel === "string"
          ? { portionLabel: o.portionLabel }
          : {}),
        ...scaleNutritionExtras(o, 1),
        ...at,
      });
    } else if (typeof o.id === "string" && typeof o.qty === "number") {
      out.push({ id: o.id, qty: o.qty, ...at });
    } else if (typeof o.name === "string" && typeof o.kcal === "number") {
      out.push({
        custom: true,
        name: o.name,
        grams: 100,
        kcal: o.kcal,
        protein: typeof o.protein === "number" ? o.protein : 0,
        fat: typeof o.fat === "number" ? o.fat : 0,
        carbs: typeof o.carbs === "number" ? o.carbs : 0,
        ...(typeof o.portionLabel === "string"
          ? { portionLabel: o.portionLabel }
          : {}),
        ...scaleNutritionExtras(o, 1),
        ...at,
      });
    }
  }
  return out;
}
