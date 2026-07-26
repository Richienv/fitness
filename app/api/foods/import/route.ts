// POST /api/foods/import  { foods: [{ name, servingGrams, kcal, protein?, fat?,
//                                       carbs?, cuisine?, nameEn? }, …] }
//
// Bulk community food import. Numbers are PER SERVING; each item gives its
// serving weight in grams, which we convert to the per-100 g basis the rest of
// the catalogue uses. Rows land in the SHARED `Food` table (searchable by all),
// deduped by normalized name (sourceCode `USER:<slug>`) like /contribute, so
// re-importing updates instead of duplicating and never clobbers curated rows.
//
// `cuisine` is optional; when omitted we infer it from the name so grouping
// works either way. Designed so you can have Claude generate a big JSON and
// import it in one shot.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { CUISINES, cuisineOf, type CuisineKey } from "@/lib/cuisine";

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

const VALID_CUISINE = new Set<string>(CUISINES.map((c) => c.key));
const MAX_ITEMS = 2000;
const CHUNK = 20;

function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}
function slug(normalized: string): string {
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
const dec = (n: unknown): Prisma.Decimal | null => {
  const v = Number(n);
  return Number.isFinite(v) ? new Prisma.Decimal(v) : null;
};

type InFood = {
  name?: unknown;
  servingGrams?: unknown;
  kcal?: unknown;
  protein?: unknown;
  fat?: unknown;
  carbs?: unknown;
  cuisine?: unknown;
  nameEn?: unknown;
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

    const body = (await req.json().catch(() => null)) as { foods?: unknown } | InFood[] | null;
    // Accept either { foods: [...] } or a bare [...] array.
    const list: unknown = Array.isArray(body) ? body : body?.foods;
    if (!Array.isArray(list) || list.length === 0) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "Expected { foods: [...] } with at least one item." },
        { status: 400, headers: corsHeaders }
      );
    }
    if (list.length > MAX_ITEMS) {
      return NextResponse.json(
        { ok: false, error: "too-many", message: `Max ${MAX_ITEMS} foods per import.` },
        { status: 400, headers: corsHeaders }
      );
    }

    const errors: { index: number; name: string; reason: string }[] = [];
    const jobs: { sourceCode: string; data: Prisma.FoodUncheckedCreateInput }[] = [];

    (list as InFood[]).forEach((raw, i) => {
      const name = typeof raw?.name === "string" ? raw.name.trim() : "";
      const nameNormalized = normalizeName(name);
      const serving = Number(raw?.servingGrams);
      const kcalServing = Number(raw?.kcal);
      if (!name || !nameNormalized) {
        errors.push({ index: i, name: name || "(kosong)", reason: "name wajib diisi" });
        return;
      }
      if (!Number.isFinite(serving) || serving <= 0) {
        errors.push({ index: i, name, reason: "servingGrams harus > 0" });
        return;
      }
      if (!Number.isFinite(kcalServing) || kcalServing < 0) {
        errors.push({ index: i, name, reason: "kcal tidak valid" });
        return;
      }
      // Per-serving → per-100 g.
      const f = 100 / serving;
      const per100 = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? n * f : 0;
      };
      const cuisineRaw = typeof raw?.cuisine === "string" ? raw.cuisine.trim().toLowerCase() : "";
      const cuisine: CuisineKey = VALID_CUISINE.has(cuisineRaw)
        ? (cuisineRaw as CuisineKey)
        : cuisineOf(name);
      const nameEn = typeof raw?.nameEn === "string" && raw.nameEn.trim() ? raw.nameEn.trim() : null;
      const searchText = [nameNormalized, nameEn?.toLowerCase() ?? ""]
        .join(" ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      jobs.push({
        sourceCode: `USER:${slug(nameNormalized)}`,
        data: {
          sourceCode: `USER:${slug(nameNormalized)}`,
          source: "CUSTOM",
          name,
          nameNormalized,
          state: "Olahan",
          foodGroup: "Custom/Estimasi",
          cuisine,
          nameEn,
          note: null,
          searchText,
          popularity: 6,
          energy_kcal: dec(kcalServing * f),
          protein_g: dec(per100(raw?.protein)),
          fat_g: dec(per100(raw?.fat)),
          carb_g: dec(per100(raw?.carbs)),
          portionGCooked: dec(serving),
        },
      });
    });

    let imported = 0;
    for (let i = 0; i < jobs.length; i += CHUNK) {
      const slice = jobs.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        slice.map((j) => {
          const { sourceCode: _sc, ...rest } = j.data;
          void _sc;
          return db.food.upsert({
            where: { sourceCode: j.sourceCode },
            create: j.data,
            update: rest,
          });
        })
      );
      for (let k = 0; k < results.length; k++) {
        if (results[k].status === "fulfilled") imported++;
        else
          errors.push({
            index: i + k,
            name: slice[k].data.name,
            reason: "gagal simpan",
          });
      }
    }

    return NextResponse.json(
      { ok: true, data: { imported, failed: errors.length, errors: errors.slice(0, 50) } },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "food-import-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
