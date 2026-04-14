import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type MealPayload = {
  id: string;
  date: string;
  mealType: string;
  items: unknown;
  totals: unknown;
};

function isMealPayload(x: unknown): x is MealPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.date === "string" &&
    typeof o.mealType === "string" &&
    o.items !== undefined &&
    o.totals !== undefined
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "expected array" }, { status: 400 });
    }
    const valid = body.filter(isMealPayload);
    let synced = 0;
    for (const m of valid) {
      await db.mealEntry.upsert({
        where: { id: m.id },
        create: {
          id: m.id,
          date: m.date,
          mealType: m.mealType,
          items: m.items as never,
          totals: m.totals as never,
        },
        update: {
          date: m.date,
          mealType: m.mealType,
          items: m.items as never,
          totals: m.totals as never,
        },
      });
      synced++;
    }
    return NextResponse.json({ ok: true, synced, skipped: body.length - valid.length });
  } catch (e) {
    return NextResponse.json(
      { error: "sync failed", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
