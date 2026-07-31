// GET /api/foods/all
//
// Returns the ENTIRE shared food catalogue with light columns, so the client
// can sort (by calories / name) and group (by cuisine) across the whole library
// — not just the ~30 relevant search hits. Session-gated; cached in-process
// with a short TTL since the catalogue only changes on re-seed / import.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

interface Row {
  sourceCode: string;
  name: string;
  nameEn: string | null;
  aliases: string | null;
  portionGCooked: Prisma.Decimal | null;
  foodGroup: string | null;
  cuisine: string | null;
  energy_kcal: Prisma.Decimal | null;
  protein_g: Prisma.Decimal | null;
  fat_g: Prisma.Decimal | null;
  carb_g: Prisma.Decimal | null;
}

const num = (x: Prisma.Decimal | null): number | null =>
  x == null ? null : Number(x.toString());

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; foods: unknown[] } | null = null;

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
    }

    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return NextResponse.json(
        { ok: true, data: { foods: cache.foods, cached: true } },
        { headers: corsHeaders }
      );
    }

    const rows = await db.$queryRaw<Row[]>(Prisma.sql`
      SELECT f."sourceCode", f.name, f."nameEn", f.aliases, f."foodGroup", f.cuisine,
             f."portionGCooked",
             f.energy_kcal, f.protein_g, f.fat_g, f.carb_g
      FROM "Food" f
      WHERE f.energy_kcal IS NOT NULL
      ORDER BY LEAST(COALESCE(f.popularity, 0), 200) DESC, f.name ASC;
    `);

    const foods = rows.map((r) => ({
      sourceCode: r.sourceCode,
      name: r.name,
      nameEn: r.nameEn,
      aliases: r.aliases,
      // The row's own conventional serving. Without it every catalogue food
      // defaults to 100 g, and a bungkus of Indomie logs as 205 kcal instead
      // of 380 — the donated database ships a curated serving_g per row and
      // we were dropping it here.
      portionG: num(r.portionGCooked),
      foodGroup: r.foodGroup,
      cuisine: r.cuisine,
      energy_kcal: num(r.energy_kcal),
      protein_g: num(r.protein_g),
      fat_g: num(r.fat_g),
      carb_g: num(r.carb_g),
    }));

    cache = { at: Date.now(), foods };

    return NextResponse.json({ ok: true, data: { foods } }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "food-all-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
