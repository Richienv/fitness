// GET /api/foods/search?q=...&group=...
//
// Searches the SHARED food-composition catalogue (all sources — TKPI, custom,
// R2FIT library, USDA — NOT per-user). Session-gated like the app's other web
// routes.
//
// Ranking is a weighted score, not a flat sort, so the most relevant hit lands
// first (see scoreExpr below). It matches against a persisted `searchText`
// index (name + English name + serving desc + group) in addition to the name,
// and mixes in a static `popularity` prior. Results are cached in-process with
// a short TTL so debounced keystrokes and repeat/browse queries are instant and
// don't re-hit Postgres. No pg_trgm dependency — pure ILIKE, works everywhere.

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
  nameEn: string | null;
  state: string | null;
  foodGroup: string | null;
  energy_kcal: Prisma.Decimal | null;
  protein_g: Prisma.Decimal | null;
  fat_g: Prisma.Decimal | null;
  carb_g: Prisma.Decimal | null;
  score: number;
}

interface SearchFood {
  id: string;
  sourceCode: string;
  name: string;
  nameEn: string | null;
  state: string | null;
  foodGroup: string | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  score: number;
}

function num(x: Prisma.Decimal | null): number | null {
  return x == null ? null : Number(x.toString());
}

// Builder step → food groups, so a step can BROWSE the library (not just search
// it). Custom composite dishes ride along in the protein step.
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

// ─── In-process result cache (TTL + LRU) ───────────────────────────────────
// Per-instance, best-effort. The catalogue is shared (not per-user), so a hit
// is safe to reuse across sessions. Keyed by normalized query + group + limit.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 400;
const cache = new Map<string, { at: number; foods: SearchFood[] }>();

function cacheGet(key: string): SearchFood[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh recency (Map preserves insertion order → move to end).
  cache.delete(key);
  cache.set(key, hit);
  return hit.foods;
}

function cacheSet(key: string, foods: SearchFood[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), foods });
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
    const groupKey = url.searchParams.get("group") ?? "";
    const groups = STEP_GROUPS[groupKey];
    const hasQuery = q.length >= 1;

    // Need either a query or a valid group to return anything.
    if (!hasQuery && !groups) {
      return NextResponse.json(
        { ok: true, data: { foods: [] } },
        { headers: corsHeaders }
      );
    }

    const limit = groups && !hasQuery ? 80 : 30;
    const cacheKey = `${groupKey}|${q}|${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(
        { ok: true, data: { foods: cached, cached: true } },
        { headers: corsHeaders }
      );
    }

    // Expand via the alias map (e.g. "somay" → also "siomay", "siomai").
    const terms = hasQuery ? expandAliases(q) : [];
    // Individual words (order-independent multi-word matching).
    const words = hasQuery
      ? q.split(/\s+/).filter((w) => w.length >= 2)
      : [];

    const like = (col: Prisma.Sql, pat: string) =>
      Prisma.sql`${col} ILIKE ${pat}`;
    const nameCol = Prisma.sql`f."nameNormalized"`;
    const textCol = Prisma.sql`f."searchText"`;
    // English name, lowercased for matching (null → '').
    const enCol = Prisma.sql`lower(COALESCE(f."nameEn", ''))`;
    const orOver = (frags: Prisma.Sql[]) =>
      frags.length ? Prisma.join(frags, " OR ") : Prisma.sql`false`;

    // WHERE: any alias term appears in the Indonesian name, the English name, or
    // the search index — so a query in either language finds the row.
    const clauses: Prisma.Sql[] = [];
    if (terms.length) {
      const nameOrText = terms.flatMap((t) => [
        like(nameCol, `%${t}%`),
        like(enCol, `%${t}%`),
        like(textCol, `%${t}%`),
      ]);
      clauses.push(Prisma.sql`(${orOver(nameOrText)})`);
    }
    if (groups) {
      clauses.push(
        Prisma.sql`f."foodGroup" IN (${Prisma.join(
          groups.map((g) => Prisma.sql`${g}`),
          ", "
        )})`
      );
    }
    const where = clauses.length
      ? Prisma.join(clauses, " AND ")
      : Prisma.sql`true`;

    // Weighted relevance score. Each tier uses GREATEST over alias terms via OR
    // (a CASE that fires once), so aliases never double-count.
    // A query word counts if it appears in the Indonesian OR the English name.
    const wordBonus = words.length
      ? Prisma.join(
          words.map(
            (w) =>
              Prisma.sql`(CASE WHEN ${like(nameCol, `%${w}%`)} OR ${like(enCol, `%${w}%`)} THEN 40 ELSE 0 END)`
          ),
          " + "
        )
      : Prisma.sql`0`;

    // Both names are scored at parallel tiers (English a hair below Indonesian),
    // so typing either language surfaces the row near the top.
    const scoreExpr = hasQuery
      ? Prisma.sql`(
          (CASE WHEN ${nameCol} = ${q} THEN 1000 ELSE 0 END)
          + (CASE WHEN ${enCol} = ${q} THEN 900 ELSE 0 END)
          + (CASE WHEN (${orOver(terms.map((t) => like(nameCol, `${t}%`)))}) THEN 500 ELSE 0 END)
          + (CASE WHEN (${orOver(terms.map((t) => like(enCol, `${t}%`)))}) THEN 450 ELSE 0 END)
          + (CASE WHEN (${orOver(
            terms.map((t) => Prisma.sql`(' ' || ${nameCol} || ' ') ILIKE ${`% ${t} %`}`)
          )}) THEN 250 ELSE 0 END)
          + (CASE WHEN (${orOver(
            terms.map((t) => Prisma.sql`(' ' || ${enCol} || ' ') ILIKE ${`% ${t} %`}`)
          )}) THEN 230 ELSE 0 END)
          + (CASE WHEN (${orOver(terms.map((t) => like(nameCol, `%${t}%`)))}) THEN 120 ELSE 0 END)
          + (CASE WHEN (${orOver(terms.map((t) => like(enCol, `%${t}%`)))}) THEN 110 ELSE 0 END)
          + (CASE WHEN (${orOver(terms.map((t) => like(textCol, `%${t}%`)))}) THEN 60 ELSE 0 END)
          + (${wordBonus})
          + (CASE WHEN f.state = 'Olahan' THEN 30 ELSE 0 END)
          + LEAST(COALESCE(f.popularity, 0), 200)
          - (length(f.name)::float * 0.4)
        )`
      : // Browse mode (no query): rank purely by popularity.
        Prisma.sql`(LEAST(COALESCE(f.popularity, 0), 200) - length(f.name)::float * 0.4)`;

    const rows = await db.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT
        f.id, f."sourceCode", f.name, f."nameEn", f.state, f."foodGroup",
        f.energy_kcal, f.protein_g, f.fat_g, f.carb_g,
        ${scoreExpr} AS score
      FROM "Food" f
      WHERE ${where}
      ORDER BY score DESC, length(f.name) ASC, f.name ASC
      LIMIT ${limit};
    `);

    const foods: SearchFood[] = rows.map((r) => ({
      id: r.id,
      sourceCode: r.sourceCode,
      name: r.name,
      nameEn: r.nameEn,
      state: r.state,
      foodGroup: r.foodGroup,
      energy_kcal: num(r.energy_kcal),
      protein_g: num(r.protein_g),
      fat_g: num(r.fat_g),
      carb_g: num(r.carb_g),
      score: Math.round(Number(r.score)),
    }));

    cacheSet(cacheKey, foods);

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
