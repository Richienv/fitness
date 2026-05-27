import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/targets";
import { getActor, logActivity } from "@/lib/audit";
import {
  calorieTotalsFor,
  inferMealType,
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
    const mealType: MealType =
      body.mealType && MEAL_TYPES.includes(body.mealType as MealType)
        ? (body.mealType as MealType)
        : inferMealType();
    const date = body.date ?? todayKey();

    const id = `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const totals = {
      kcal: parsed.kcal,
      protein: parsed.protein,
      carbs: 0,
      fat: 0,
    };
    const items = [
      {
        id: `${id}-item`,
        name: parsed.name,
        kcal: parsed.kcal,
        protein: parsed.protein,
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
      payload: { rawText: body.text, parsed, mealType, date },
    });

    return NextResponse.json({
      ok: true,
      data: {
        meal: {
          id: saved.id,
          date: saved.date,
          mealType: saved.mealType,
          name: parsed.name,
          kcal: parsed.kcal,
          protein: parsed.protein,
        },
        todayTotals: {
          calories: todayTotals.kcal,
          protein: todayTotals.protein,
        },
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
