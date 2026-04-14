import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/targets";

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
    if (!isMealPayload(body)) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }
    const saved = await db.mealEntry.upsert({
      where: { id: body.id },
      create: {
        id: body.id,
        date: body.date,
        mealType: body.mealType,
        items: body.items as never,
        totals: body.totals as never,
      },
      update: {
        date: body.date,
        mealType: body.mealType,
        items: body.items as never,
        totals: body.totals as never,
      },
    });
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (e) {
    return NextResponse.json(
      { error: "upsert failed", detail: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? todayKey();
    const meals = await db.mealEntry.findMany({ where: { date } });
    return NextResponse.json({ date, meals });
  } catch (e) {
    return NextResponse.json(
      { error: "query failed", detail: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await db.mealEntry.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "delete failed", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
