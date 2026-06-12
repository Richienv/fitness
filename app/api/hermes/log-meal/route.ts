import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/targets";
import { getActor, logActivity } from "@/lib/audit";
import {
  calorieTotalsFor,
  coerceStoredItems,
  inferMealType,
  matchLibraryFood,
  mergeItems,
  parseMealText,
  resolveMealItems,
  totalsForResolved,
  type HermesItemInput,
  type ResolvedMealItem,
} from "@/lib/hermes";
import { getIngredient } from "@/lib/ingredients";

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
      const { resolved, unknownIds } = resolveMealItems(body.items);
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

      // Mirror the web app: one row per (date, mealType). Add 3 eggs now
      // and 2 eggs later → one row with egg ×5, not two side-by-side items.
      const existing = await db.mealEntry
        .findFirst({ where: { date, mealType }, orderBy: { createdAt: "asc" } })
        .catch(() => null);

      let saved;
      let mergedItems: ResolvedMealItem[];
      let mergedTotals;
      if (existing) {
        mergedItems = mergeItems(coerceStoredItems(existing.items), resolved);
        mergedTotals = totalsForResolved(mergedItems);
        saved = await db.mealEntry.update({
          where: { id: existing.id },
          data: { items: mergedItems as never, totals: mergedTotals as never },
        });
      } else {
        mergedItems = resolved;
        mergedTotals = totalsForResolved(mergedItems);
        saved = await db.mealEntry.create({
          data: {
            id,
            date,
            mealType,
            items: mergedItems as never,
            totals: mergedTotals as never,
          },
        });
      }

      const labels = mergedItems.map((it) =>
        "id" in it
          ? `${+it.qty.toFixed(2)}× ${getIngredient(it.id)?.name ?? it.id}`
          : it.name
      );

      const todayTotals = await calorieTotalsFor(date);
      await logActivity({
        actor,
        action: "log-meal",
        entityId: saved.id,
        entityType: "MealEntry",
        payload: {
          mode: "structured",
          incoming: resolved,
          mealEntryAfter: { items: mergedItems, totals: mergedTotals },
          mealType,
          date,
          unknownIds,
          learned,
          mergedIntoExisting: !!existing,
        },
      });

      return NextResponse.json({
        ok: true,
        data: {
          meal: {
            id: saved.id,
            date: saved.date,
            mealType: saved.mealType,
            items: labels,
            kcal: mergedTotals.kcal,
            protein: mergedTotals.protein,
            sugar: mergedTotals.sugar,
          },
          todayTotals: {
            calories: todayTotals.kcal,
            protein: todayTotals.protein,
            sugar: todayTotals.sugar,
          },
          mergedIntoExisting: !!existing,
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

    const totals = { kcal, protein, fat, carbs, sugar: 0 };
    const incomingItem: ResolvedMealItem = {
      custom: true,
      name,
      grams: 100,
      kcal,
      protein,
      fat,
      carbs,
    };

    // Same merge-by-mealType rule as the structured path.
    const existing = await db.mealEntry
      .findFirst({ where: { date, mealType }, orderBy: { createdAt: "asc" } })
      .catch(() => null);

    let saved;
    if (existing) {
      const merged = mergeItems(coerceStoredItems(existing.items), [incomingItem]);
      const mergedTotals = totalsForResolved(merged);
      saved = await db.mealEntry.update({
        where: { id: existing.id },
        data: { items: merged as never, totals: mergedTotals as never },
      });
    } else {
      saved = await db.mealEntry.create({
        data: {
          id,
          date,
          mealType,
          items: [incomingItem] as never,
          totals: totals as never,
        },
      });
    }

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
