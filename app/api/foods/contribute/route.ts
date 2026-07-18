// POST /api/foods/contribute  { name, per100g:{kcal,protein?,fat?,carbs?}, portionGrams? }
//
// Community food contribution. When any logged-in user creates a custom food in
// the meal builder, it's written into the SHARED `Food` catalogue so it becomes
// searchable by everyone via /api/foods/search — a community-built library.
//
// Dedup is by normalized name: the sourceCode is `USER:<slug>`, so re-adding the
// same name updates that one row instead of piling up duplicates, and it can
// never overwrite a curated catalogue row (those use TKPI:/CUSTOM:/USDA: codes).
// Safe across deploys — the seed upserts by sourceCode and never deletes rows it
// doesn't recognise, so contributed foods persist.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** lowercase + strip diacritics — must match the seed's normalizeName and the
 *  search route's normalize so contributed rows match queries. */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function slug(normalized: string): string {
  return normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const dec = (n: unknown): Prisma.Decimal | null => {
  const v = Number(n);
  return Number.isFinite(v) ? new Prisma.Decimal(v) : null;
};

type Body = {
  name?: unknown;
  per100g?: { kcal?: unknown; protein?: unknown; fat?: unknown; carbs?: unknown };
  portionGrams?: unknown;
};

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const kcal = Number(body?.per100g?.kcal);
    const nameNormalized = normalizeName(name);
    if (!name || !nameNormalized || !Number.isFinite(kcal) || kcal <= 0) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "name + per100g.kcal required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const sourceCode = `USER:${slug(nameNormalized)}`;
    // Recall bag for ILIKE '%term%' matching (name only — user foods have no
    // English name or notes yet).
    const searchText = nameNormalized.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    const portionGrams = Number(body?.portionGrams);

    const data = {
      source: "CUSTOM" as const,
      name,
      nameNormalized,
      state: "Olahan",
      foodGroup: "Custom/Estimasi",
      nameEn: null,
      note: null,
      searchText,
      // Modest prior: findable, but doesn't outrank curated staples.
      popularity: 6,
      energy_kcal: dec(kcal),
      protein_g: dec(body?.per100g?.protein ?? 0),
      fat_g: dec(body?.per100g?.fat ?? 0),
      carb_g: dec(body?.per100g?.carbs ?? 0),
      portionGCooked:
        Number.isFinite(portionGrams) && portionGrams > 0 ? dec(portionGrams) : null,
    };

    const food = await db.food.upsert({
      where: { sourceCode },
      create: { sourceCode, ...data },
      update: data,
    });

    return NextResponse.json(
      { ok: true, data: { sourceCode: food.sourceCode, name: food.name } },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "food-contribute-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
