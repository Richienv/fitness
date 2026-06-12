import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/targets";
import { getActor, logActivity } from "@/lib/audit";
import {
  calorieTotalsFor,
  inferMealType,
  matchLibraryFood,
  parseMealText,
  resolveMealItems,
  type HermesItemInput,
  type ResolvedMealItem,
} from "@/lib/hermes";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** Grow the shared library from a custom item so it's pickable next time
 * (in the app and via Hermes). Stored PER 100g. Skips if the name exists. */
async function learnCustomFood(
  item: Extract<ResolvedMealItem, { custom: true }>,
  actor: string
): Promise<boolean> {
  if (item.grams <= 0 || item.kcal <= 0) return false;
  const existing = await matchLibraryFood(item.name).catch(() => null);
  if (existing) return false;
  const f = 100 / item.grams;
  await db.foodItem
    .create({
      data: {
        name: item.name,
        per100g: {
          kcal: Math.round(item.kcal * f),
          protein: Math.round(item.protein * f),
          fat: Math.round(item.fat * f),
          carbs: Math.round(item.carbs * f),
        } as never,
        source: actor,
      },
    })
    .catch(() => {});
  return true;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      text?: string;
      items?: HermesItemInput[];
      mealType?: string;
      date?: string;
    };

    const actor = getActor(req);
    const mealType: MealType =
      body.mealType && MEAL_TYPES.includes(body.mealType as MealType)
        ? (body.mealType as MealType)
        : inferMealType();
    const date = body.date ?? todayKey();
    const id = `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // --- Preferred path: structured items mapped to the library ---
    if (Array.isArray(body.items) && body.items.length > 0) {
      const { resolved, totals, labels, unknownIds } = resolveMealItems(body.items);
      if (resolved.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "no-valid-items",
            message: `No items resolved. Unknown ids: ${unknownIds.join(", ") || "none"}`,
          },
          { status: 400 }
        );
      }

      const learned: string[] = [];
      for (const item of resolved) {
        if ("custom" in item) {
          const didLearn = await learnCustomFood(item, actor);
          if (didLearn) learned.push(item.name);
        }
      }

      const saved = await db.mealEntry.create({
        data: {
          id,
          date,
          mealType,
          items: resolved as never,
          totals: totals as never,
        },
      });

      const todayTotals = await calorieTotalsFor(date);
      await logActivity({
        actor,
        action: "log-meal",
        entityId: saved.id,
        entityType: "MealEntry",
        payload: { mode: "structured", items: resolved, totals, mealType, date, unknownIds, learned },
      });

      return NextResponse.json({
        ok: true,
        data: {
          meal: {
            id: saved.id,
            date: saved.date,
            mealType: saved.mealType,
            items: labels,
            kcal: totals.kcal,
            protein: totals.protein,
          },
          todayTotals: { calories: todayTotals.kcal, protein: todayTotals.protein },
          unknownIds,
          learnedFoods: learned,
        },
      });
    }

    // --- Fallback path: natural-language text (single item) ---
    if (!body.text || typeof body.text !== "string") {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "items[] or text required" },
        { status: 400 }
      );
    }

    const parsed = parseMealText(body.text);
    let { name } = parsed;
    let kcal = parsed.kcal;
    let protein = parsed.protein;
    let fat = 0;
    let carbs = 0;

    const libMatch = await matchLibraryFood(parsed.name || body.text);
    let addedToLibrary = false;
    if (libMatch) {
      name = libMatch.name;
      if (!parsed.hadExplicitKcal && libMatch.per100g.kcal > 0)
        kcal = Math.round(libMatch.per100g.kcal);
      if (!parsed.hadExplicitProtein) protein = Math.round(libMatch.per100g.protein ?? 0);
      fat = Math.round(libMatch.per100g.fat ?? 0);
      carbs = Math.round(libMatch.per100g.carbs ?? 0);
    } else if (
      parsed.hadExplicitKcal &&
      name &&
      name !== "meal" &&
      name.length >= 3 &&
      !/^\d+$/.test(name)
    ) {
      await db.foodItem
        .create({
          data: {
            name,
            per100g: { kcal, protein, fat: 0, carbs: 0 } as never,
            source: actor,
          },
        })
        .then(() => {
          addedToLibrary = true;
        })
        .catch(() => {});
    }

    const totals = { kcal, protein, fat, carbs };
    const items = [
      { custom: true, name, grams: 100, kcal, protein, fat, carbs, source: "hermes-nl", rawText: body.text },
    ];

    const saved = await db.mealEntry.create({
      data: { id, date, mealType, items: items as never, totals: totals as never },
    });

    const todayTotals = await calorieTotalsFor(date);
    await logActivity({
      actor,
      action: "log-meal",
      entityId: saved.id,
      entityType: "MealEntry",
      payload: { mode: "text", rawText: body.text, parsed, mealType, date, addedToLibrary },
    });

    return NextResponse.json({
      ok: true,
      data: {
        meal: { id: saved.id, date: saved.date, mealType: saved.mealType, name, kcal, protein },
        todayTotals: { calories: todayTotals.kcal, protein: todayTotals.protein },
        matchedLibraryFood: libMatch?.name ?? null,
        addedToLibrary,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "log-meal-failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}
