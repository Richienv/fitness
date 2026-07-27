import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

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
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "expected array" }, { status: 400 });
    }
    const valid = body.filter(isMealPayload);
    let synced = 0;
    let forbidden = 0;
    // OWNERSHIP: rows already owned by someone else are skipped, never
    // overwritten — an unscoped upsert here would let a caller rewrite another
    // user's meals in bulk. (Same reasoning as POST /api/meals.)
    const ids = valid.map((m) => m.id);
    const owners = new Map(
      (
        await db.mealEntry.findMany({
          where: { id: { in: ids } },
          select: { id: true, userId: true },
        })
      ).map((r) => [r.id, r.userId])
    );
    for (const m of valid) {
      const owner = owners.get(m.id);
      if (owner && owner !== userId) {
        forbidden++;
        continue;
      }
      const fields = {
        date: m.date,
        mealType: m.mealType,
        items: m.items as never,
        totals: m.totals as never,
      };
      if (owner) await db.mealEntry.update({ where: { id: m.id }, data: fields });
      else await db.mealEntry.create({ data: { id: m.id, userId, ...fields } });
      synced++;
    }
    return NextResponse.json({
      ok: true,
      synced,
      skipped: body.length - valid.length,
      forbidden,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "sync failed", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
