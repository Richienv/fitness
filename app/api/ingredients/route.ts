import { NextResponse } from "next/server";
import { INGREDIENTS } from "@/lib/ingredients";
import { db } from "@/lib/db";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// The full food vocabulary Hermes can map a spoken meal against: the built-in
// ingredient library (macros are PER UNIT — multiply by qty) plus the shared
// custom-food library (macros are PER 100g).
export async function GET() {
  const ingredients = INGREDIENTS.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    group: i.group,
    gramsPerUnit: i.gramsPerUnit ?? null,
    perUnit: { kcal: i.kcal, protein: i.protein, fat: i.fat, carbs: i.carbs },
  }));

  let customFoods: Array<{ id: string; name: string; per100g: unknown }> = [];
  try {
    const foods = await db.foodItem.findMany({ orderBy: { createdAt: "asc" } });
    customFoods = foods.map((f) => ({ id: f.id, name: f.name, per100g: f.per100g }));
  } catch {
    customFoods = [];
  }

  return NextResponse.json(
    { ok: true, data: { ingredients, customFoods } },
    { headers: corsHeaders }
  );
}
