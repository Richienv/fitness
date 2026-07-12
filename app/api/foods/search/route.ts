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

// Builder step → TKPI food groups, so a step can BROWSE the DB library (not
// just search it). Custom composite dishes ride along in the protein step.
const STEP_GROUPS: Record<string, string[]> = {
  protein: [
    "Daging",
    "Ikan dsb",
    "Telur",
    "Kacang",
    "Custom/Estimasi",
    "Masakan Nusantara",
  ],
  carb: ["Serealia", "Umbi", "Buah", "Gula"],
  vegetable: ["Sayur"],
  extra: ["Lemak", "Bumbu", "Kue/Dessert"],
  drink: ["Minuman", "Susu"],
};

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
    const groupKey = url.searchParams.get("group") ?? "";
    const groups = STEP_GROUPS[groupKey];

    // Need either a query or a valid group to return anything.
    if (q.length < 1 && !groups) {
      return NextResponse.json(
        { ok: true, data: { foods: [] } },
        { headers: corsHeaders }
      );
    }

    // Expand via the alias map (e.g. "somay" → also "siomay", "siomai").
    const terms = q.length >= 1 ? expandAliases(q) : [];
    const prefixLike = `${q}%`;

    // Substring (ILIKE) matching — no pg_trgm dependency, so it works whether
    // or not the extension is enabled. `group` (browse) filters by TKPI group;
    // `q` (search) filters by name. Either or both may be present.
    const clauses: Prisma.Sql[] = [];
    if (terms.length) {
      clauses.push(
        Prisma.sql`(${Prisma.join(
          terms.map((t) => Prisma.sql`f."nameNormalized" ILIKE ${`%${t}%`}`),
          " OR "
        )})`
      );
    }
    if (groups) {
      clauses.push(
        Prisma.sql`f."foodGroup" IN (${Prisma.join(groups.map((g) => Prisma.sql`${g}`), ", ")})`
      );
    }
    const where = Prisma.join(clauses, " AND ");
    const anyPrefix = terms.length
      ? Prisma.join(
          terms.map((t) => Prisma.sql`f."nameNormalized" ILIKE ${`${t}%`}`),
          " OR "
        )
      : Prisma.sql`false`;
    const limit = groups && q.length < 1 ? 80 : 30;

    const rows = await db.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT
        f.id, f."sourceCode", f.name, f.state, f."foodGroup",
        f.energy_kcal, f.protein_g, f.fat_g, f.carb_g
      FROM "Food" f
      WHERE ${where}
      ORDER BY
        (${anyPrefix}) DESC,
        (f."nameNormalized" ILIKE ${prefixLike}) DESC,
        (f.state = 'Olahan') DESC,
        length(f.name) ASC,
        f.name ASC
      LIMIT ${limit};
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
