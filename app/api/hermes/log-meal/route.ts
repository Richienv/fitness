import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/targets";
import { getActor, logActivity } from "@/lib/audit";
import {
  calorieTotalsFor,
  inferMealType,
  matchLibraryFood,
  parseMealText,
} from "@/lib/hermes";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      text?: string;
      mealType?: string;
      date?: string;
    };
    if (!body.text || typeof body.text !== "string") {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "text required" },
        { status: 400 }
      );
    }

    const parsed = parseMealText(body.text);
    let { name } = parsed;
    let kcal = parsed.kcal;
    let protein = parsed.protein;
    let fat = 0;
    let carbs = 0;

    // Shared library: fill gaps from a known food, or learn a new one.
    const libMatch = await matchLibraryFood(parsed.name || body.text);
    let addedToLibrary = false;
    if (libMatch) {
      name = libMatch.name;
      if (!parsed.hadExplicitKcal && libMatch.per100g.kcal > 0)
        kcal = Math.round(libMatch.per100g.kcal);
      if (!parsed.hadExplicitProtein)
        protein = Math.round(libMatch.per100g.protein ?? 0);
      fat = Math.round(libMatch.per100g.fat ?? 0);
      carbs = Math.round(libMatch.per100g.carbs ?? 0);
    } else if (
      parsed.hadExplicitKcal &&
      name &&
      name !== "meal" &&
      name.length >= 3 &&
      !/^\d+$/.test(name)
    ) {
      // New food with real macros → grow the shared library so next time
      // "nasi padang" works without numbers, in the app AND via Hermes.
      await db.foodItem
        .create({
          data: {
            name,
            per100g: { kcal, protein, fat: 0, carbs: 0 } as never,
            source: getActor(req),
          },
        })
        .then(() => {
          addedToLibrary = true;
        })
        .catch(() => {});
    }

    const mealType: MealType =
      body.mealType && MEAL_TYPES.includes(body.mealType as MealType)
        ? (body.mealType as MealType)
        : inferMealType();
    const date = body.date ?? todayKey();

    const id = `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const totals = { kcal, protein, fat, carbs };
    // CustomMealItem shape — identical to what the web UI writes, so the
    // dashboard renders Hermes meals exactly like app-logged ones.
    const items = [
      {
        custom: true,
        name,
        grams: 100,
        kcal,
        protein,
        fat,
        carbs,
        source: "hermes-nl",
        rawText: body.text,
      },
    ];

    const saved = await db.mealEntry.create({
      data: {
        id,
        date,
        mealType,
        items: items as never,
        totals: totals as never,
      },
    });

    const todayTotals = await calorieTotalsFor(date);

    const actor = getActor(req);
    await logActivity({
      actor,
      action: "log-meal",
      entityId: saved.id,
      entityType: "MealEntry",
      payload: { rawText: body.text, parsed, mealType, date, addedToLibrary },
    });

    return NextResponse.json({
      ok: true,
      data: {
        meal: {
          id: saved.id,
          date: saved.date,
          mealType: saved.mealType,
          name,
          kcal,
          protein,
        },
        todayTotals: {
          calories: todayTotals.kcal,
          protein: todayTotals.protein,
        },
        matchedLibraryFood: libMatch?.name ?? null,
        addedToLibrary,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "log-meal-failed",
        message: (e as Error).message,
      },
      { status: 500 }
    );
  }
}
