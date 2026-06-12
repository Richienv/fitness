import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActor, logActivity } from "@/lib/audit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-actor",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    const foods = await db.foodItem.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ ok: true, data: { foods } }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "foods-query-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}

type FoodPayload = {
  id?: string;
  name: string;
  per100g: { kcal: number; protein: number; fat?: number; carbs?: number; sugar?: number; sodium?: number };
  source?: string;
};

function isFoodPayload(x: unknown): x is FoodPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const p = o.per100g as Record<string, unknown> | undefined;
  return (
    typeof o.name === "string" &&
    o.name.trim().length > 0 &&
    !!p &&
    typeof p.kcal === "number"
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isFoodPayload(body)) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "name + per100g.kcal required" },
        { status: 400, headers: corsHeaders }
      );
    }
    const actor = getActor(req);
    const data = {
      name: body.name.trim(),
      per100g: body.per100g as never,
      source: body.source ?? actor,
    };
    const saved = body.id
      ? await db.foodItem.upsert({
          where: { id: body.id },
          create: { id: body.id, ...data },
          update: data,
        })
      : await db.foodItem.create({ data });

    await logActivity({
      actor,
      action: "upsert-food",
      entityId: saved.id,
      entityType: "FoodItem",
      payload: { name: saved.name },
    });

    return NextResponse.json({ ok: true, data: { food: saved } }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "food-upsert-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "id required" },
        { status: 400, headers: corsHeaders }
      );
    }
    await db.foodItem.delete({ where: { id } }).catch(() => null);
    await logActivity({
      actor: getActor(req),
      action: "delete-food",
      entityId: id,
      entityType: "FoodItem",
    });
    return NextResponse.json({ ok: true, data: { id } }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "food-delete-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
