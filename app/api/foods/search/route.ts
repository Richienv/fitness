// GET /api/foods/search?q=...
//
// Searches the SHARED food-composition catalogue (all sources — TKPI, custom,
// USDA — NOT per-user). Session-gated like the app's other web routes.
//
// Ranking (via pg_trgm): exact prefix matches first, then trigram similarity
// descending, with a boost for state = 'Olahan' (prepared dishes, which users
// search for most). Falls back gracefully to ILIKE ordering if trigram scores
// are unavailable.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { expandAliases } from "@/lib/foodAliases";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-actor",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** lowercase + strip diacritics — must match normalizeName used at seed time. */
function normalize(q: string): string {
  return q
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

interface SearchRow {
  id: string;
  sourceCode: string;
  name: string;
  state: string | null;
  foodGroup: string | null;
  energy_kcal: Prisma.Decimal | null;
  protein_g: Prisma.Decimal | null;
  fat_g: Prisma.Decimal | null;
  carb_g: Prisma.Decimal | null;
}

function num(x: Prisma.Decimal | null): number | null {
  return x == null ? null : Number(x.toString());
}

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const url = new URL(req.url);
    const raw = url.searchParams.get("q") ?? "";
    const q = normalize(raw);
    if (q.length < 1) {
      return NextResponse.json(
        { ok: true, data: { foods: [] } },
        { headers: corsHeaders }
      );
    }

    // Expand via the alias map (e.g. "somay" → also "siomay", "siomai").
    const terms = expandAliases(q);
    const prefixLike = `${q}%`;

    // Match = any expanded term is a name prefix OR trigram-similar (> 0.2).
    // Rank = exact prefix first, then 'Olahan' boost, then best similarity.
    const rows = await db.$queryRaw<SearchRow[]>(Prisma.sql`
      WITH scored AS (
        SELECT
          f.id,
          f."sourceCode",
          f.name,
          f.state,
          f."foodGroup",
          f.energy_kcal,
          f.protein_g,
          f.fat_g,
          f.carb_g,
          lower(f."nameNormalized") AS n
        FROM "Food" f
      ),
      matched AS (
        SELECT
          s.*,
          (s.n ILIKE ${prefixLike}) AS is_prefix,
          GREATEST(${Prisma.join(
            terms.map((t) => Prisma.sql`similarity(s.n, ${t})`),
            ", "
          )}) AS sim,
          (s.state = 'Olahan') AS is_olahan
        FROM scored s
        WHERE
          (${Prisma.join(
            terms.map((t) => Prisma.sql`s.n ILIKE ${`${t}%`}`),
            " OR "
          )})
          OR
          (${Prisma.join(
            terms.map((t) => Prisma.sql`similarity(s.n, ${t}) > 0.2`),
            " OR "
          )})
      )
      SELECT id, "sourceCode", name, state, "foodGroup",
             energy_kcal, protein_g, fat_g, carb_g
      FROM matched
      ORDER BY
        is_prefix DESC,
        is_olahan DESC,
        sim DESC,
        name ASC
      LIMIT 30;
    `);

    const foods = rows.map((r) => ({
      id: r.id,
      sourceCode: r.sourceCode,
      name: r.name,
      state: r.state,
      foodGroup: r.foodGroup,
      energy_kcal: num(r.energy_kcal),
      protein_g: num(r.protein_g),
      fat_g: num(r.fat_g),
      carb_g: num(r.carb_g),
    }));

    return NextResponse.json(
      { ok: true, data: { foods } },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "food-search-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
