import { gramBasis } from "./trayMath.ts";
import { scopedKey } from "./userScope.ts";
import type { NutritionExtras } from "./nutritionLabel.ts";
export type RecipeFood = NutritionExtras & {
  id: string;
  name: string;
  unit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  gramsPerUnit?: number;
  portionG?: number;
  missingNutrition?: boolean;
};
export type RecipePart = {
  food: RecipeFood;
  quantity: number;
  estimated: boolean;
};
export type Recipe = {
  id: string;
  name: string;
  servings: number;
  parts: RecipePart[];
};
export function recipeNutrition(parts: RecipePart[], servings = 1) {
  const n = {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    sugar: 0 as number | null,
    sodium: 0 as number | null,
    salt: 0 as number | null,
    saturatedFat: 0 as number | null,
    transFat: 0 as number | null,
    fiber: 0 as number | null,
    grams: 0 as number | null,
  };
  for (const { food, quantity } of parts) {
    if (!Number.isFinite(quantity) || quantity <= 0 || food.missingNutrition)
      continue;
    const weight = gramBasis(food);
    const multiplier = weight ? quantity / weight : quantity;
    for (const key of ["kcal", "protein", "carbs", "fat"] as const)
      n[key] += food[key] * multiplier;
    if (food.sugar == null) n.sugar = null;
    else if (n.sugar !== null) n.sugar += food.sugar * multiplier;
    for (const key of [
      "sodium",
      "salt",
      "saturatedFat",
      "transFat",
      "fiber",
    ] as const) {
      if (food[key] == null) n[key] = null;
      else if (n[key] !== null) n[key]! += food[key]! * multiplier;
    }
    if (weight && n.grams !== null) n.grams += quantity;
    else n.grams = null;
  }
  const divisor = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return {
    ...n,
    sugar: n.sugar === null ? null : n.sugar / divisor,
    sodium: n.sodium === null ? null : n.sodium / divisor,
    salt: n.salt === null ? null : n.salt / divisor,
    saturatedFat: n.saturatedFat === null ? null : n.saturatedFat / divisor,
    transFat: n.transFat === null ? null : n.transFat / divisor,
    fiber: n.fiber === null ? null : n.fiber / divisor,
    kcal: n.kcal / divisor,
    protein: n.protein / divisor,
    carbs: n.carbs / divisor,
    fat: n.fat / divisor,
    grams: n.grams === null ? null : n.grams / divisor,
  };
}
const KEY = "richie.recipes.v1";
export function getRecipes(): Recipe[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(scopedKey(KEY)) || "[]");
    return Array.isArray(list)
      ? list.filter(
          (r): r is Recipe =>
            r &&
            typeof r.id === "string" &&
            typeof r.name === "string" &&
            Number.isFinite(r.servings) &&
            r.servings > 0 &&
            Array.isArray(r.parts) &&
            r.parts.length > 0 &&
            r.parts.every(
              (p: RecipePart) =>
                p?.food &&
                typeof p.food.id === "string" &&
                typeof p.food.name === "string" &&
                typeof p.food.unit === "string" &&
                Number.isFinite(p.quantity) &&
                p.quantity > 0 &&
                ["kcal", "protein", "carbs", "fat"].every(
                  (k) =>
                    Number.isFinite(p.food[k as keyof RecipeFood]) &&
                    Number(p.food[k as keyof RecipeFood]) >= 0,
                ),
            ),
        )
      : [];
  } catch {
    return [];
  }
}
export function saveRecipe(recipe: Recipe): boolean {
  try {
    localStorage.setItem(
      scopedKey(KEY),
      JSON.stringify(
        [recipe, ...getRecipes().filter((r) => r.id !== recipe.id)].slice(
          0,
          100,
        ),
      ),
    );
    return true;
  } catch {
    return false;
  }
}
