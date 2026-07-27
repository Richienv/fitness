import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
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
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const body = await req.json();
    if (!isMealPayload(body)) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }
    const fields = {
      date: body.date,
      mealType: body.mealType,
      items: body.items as never,
      totals: body.totals as never,
    };
    // OWNERSHIP: upsert's `where` takes only a unique selector, so it can't
    // carry userId — an unscoped update would let a caller overwrite another
    // user's meal by id (and, since the social feed renders meals, plant
    // content on someone else's day). Check the owner explicitly.
    const existing = await db.mealEntry.findUnique({
      where: { id: body.id },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const saved = existing
      ? await db.mealEntry.update({ where: { id: body.id }, data: fields })
      : await db.mealEntry.create({ data: { id: body.id, userId, ...fields } });
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
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    if (from) {
      const meals = await db.mealEntry.findMany({
        where: { userId, date: { gte: from } },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ from, meals });
    }
    const date = url.searchParams.get("date") ?? todayKey();
    const meals = await db.mealEntry.findMany({ where: { userId, date } });
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
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await db.mealEntry.deleteMany({ where: { id, userId } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "delete failed", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
