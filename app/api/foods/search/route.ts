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
// don't re-hit Postgres.
//
// Matching is enhanced two ways over plain ILIKE:
//   1. English↔Indonesian synonyms + common typo fixes are expanded per word
//      (lib/foodAliases), so "beef minced" finds "daging sapi giling".
//   2. A fuzzy pg_trgm `word_similarity` tier catches arbitrary typos ("dagin
//      cincang" → "daging cincang"). It is probed once and guarded: if the
//      extension isn't installed the route degrades cleanly to pure ILIKE.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { expandQuery } from "@/lib/foodAliases";

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

/** Household measure ("1 porsi", "1 potong") from the FoodServing table. */
interface Serving {
  label: string;
  grams: number;
}

interface SearchRow {
  id: string;
  sourceCode: string;
  name: string;
  nameEn: string | null;
  state: string | null;
  foodGroup: string | null;
  cuisine: string | null;
  portionGCooked: Prisma.Decimal | null;
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
  cuisine: string | null;
  /** Default household portion in grams (null when unknown). */
  portionG: number | null;
  /** Household measures to pick from ("1 porsi", "1 potong"). */
  servings: Serving[];
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
// The catalogue only changes on a re-seed, so a longer TTL and roomier cap keep
// far more keystrokes off Postgres without risking stale results in practice.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 600;
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

// ─── pg_trgm availability probe (guarded, cached) ───────────────────────────
// The fuzzy tier calls word_similarity(), which only exists when the pg_trgm
// extension is installed. Historically an unguarded similarity() call 500'd
// where it wasn't enabled, so probe once and remember the answer; on any error
// we assume unavailable and fall back to pure ILIKE.
const FUZZY_THRESHOLD = 0.4;
let trgmAvailable: boolean | null = null;

async function pgTrgmAvailable(): Promise<boolean> {
  if (trgmAvailable !== null) return trgmAvailable;
  try {
    const rows = await db.$queryRaw<{ ok: boolean }[]>(
      Prisma.sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS ok`
    );
    trgmAvailable = rows[0]?.ok === true;
  } catch {
    trgmAvailable = false;
  }
  return trgmAvailable;
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

    // Expand the query: whole-query phrase aliases (`terms`), per-word EN↔ID
    // synonyms + typo fixes (`wordGroups`), and their flattened union for broad
    // recall (`allTerms`).
    const { terms, wordGroups, allTerms } = hasQuery
      ? expandQuery(q)
      : { terms: [] as string[], wordGroups: [] as string[][], allTerms: [] as string[] };

    // Fuzzy matching is only worth it for queries long enough to have a stable
    // trigram signature, and only when the extension is actually present.
    const fuzzyOn = hasQuery && q.length >= 3 && (await pgTrgmAvailable());

    const like = (col: Prisma.Sql, pat: string) =>
      Prisma.sql`${col} ILIKE ${pat}`;
    const nameCol = Prisma.sql`f."nameNormalized"`;
    const textCol = Prisma.sql`f."searchText"`;
    // English name, lowercased for matching (null → '').
    const enCol = Prisma.sql`lower(COALESCE(f."nameEn", ''))`;
    const orOver = (frags: Prisma.Sql[]) =>
      frags.length ? Prisma.join(frags, " OR ") : Prisma.sql`false`;

    // Best trigram similarity of the whole query against either name or the
    // search index. word_similarity finds the closest contiguous extent, so a
    // typo'd multi-word query still scores against the intended phrase.
    const simExpr = Prisma.sql`GREATEST(
      word_similarity(${q}, ${nameCol}),
      word_similarity(${q}, ${enCol}),
      word_similarity(${q}, ${textCol})
    )`;

    // WHERE: any expanded term appears in the Indonesian name, the English name,
    // or the search index (so a query in either language finds the row) — OR the
    // row is a close fuzzy match (typo tolerance).
    const clauses: Prisma.Sql[] = [];
    if (hasQuery) {
      const recall: Prisma.Sql[] = allTerms.flatMap((t) => [
        like(nameCol, `%${t}%`),
        like(enCol, `%${t}%`),
        like(textCol, `%${t}%`),
      ]);
      if (fuzzyOn) {
        recall.push(
          Prisma.sql`word_similarity(${q}, ${nameCol}) >= ${FUZZY_THRESHOLD}`,
          Prisma.sql`word_similarity(${q}, ${textCol}) >= ${FUZZY_THRESHOLD}`
        );
      }
      clauses.push(Prisma.sql`(${orOver(recall)})`);
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

    // Concept coverage: one bonus per query word if ANY of its synonyms appears
    // in either name. Rewards rows that cover every part of a multi-word,
    // possibly translated query (e.g. "beef minced" → both "sapi"/"daging" AND
    // "giling" present), floating them above rows matching only one part.
    const groupBonus = wordGroups.length
      ? Prisma.join(
          wordGroups.map((grp) => {
            const anyMatch = orOver(
              grp.flatMap((s) => [like(nameCol, `%${s}%`), like(enCol, `%${s}%`)])
            );
            return Prisma.sql`(CASE WHEN (${anyMatch}) THEN 45 ELSE 0 END)`;
          }),
          " + "
        )
      : Prisma.sql`0`;

    // Fuzzy score contribution (0 when the extension is unavailable).
    const fuzzyScore = fuzzyOn
      ? Prisma.sql`(${simExpr} * 300)`
      : Prisma.sql`0`;

    // Both names are scored at parallel tiers (English a hair below Indonesian),
    // so typing either language surfaces the row near the top. Exact / prefix /
    // word-boundary tiers use the precise whole-query phrase forms; the broad
    // substring tiers use the full synonym-expanded term set.
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
          + (CASE WHEN (${orOver(allTerms.map((t) => like(nameCol, `%${t}%`)))}) THEN 120 ELSE 0 END)
          + (CASE WHEN (${orOver(allTerms.map((t) => like(enCol, `%${t}%`)))}) THEN 110 ELSE 0 END)
          + (CASE WHEN (${orOver(allTerms.map((t) => like(textCol, `%${t}%`)))}) THEN 60 ELSE 0 END)
          + (${groupBonus})
          + (${fuzzyScore})
          + (CASE WHEN f.state = 'Olahan' THEN 30 ELSE 0 END)
          + LEAST(COALESCE(f.popularity, 0), 200)
          - (length(f.name)::float * 0.4)
        )`
      : // Browse mode (no query): rank purely by popularity.
        Prisma.sql`(LEAST(COALESCE(f.popularity, 0), 200) - length(f.name)::float * 0.4)`;

    const rows = await db.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT
        f.id, f."sourceCode", f.name, f."nameEn", f.state, f."foodGroup", f.cuisine,
        f."portionGCooked",
        f.energy_kcal, f.protein_g, f.fat_g, f.carb_g,
        ${scoreExpr} AS score
      FROM "Food" f
      WHERE ${where}
      ORDER BY score DESC, length(f.name) ASC, f.name ASC
      LIMIT ${limit};
    `);

    // Household measures for this result page, in one round trip.
    const servingsByFood = new Map<string, Serving[]>();
    if (rows.length > 0) {
      const sv = await db.foodServing.findMany({
        where: { foodId: { in: rows.map((r) => r.id) } },
        select: { foodId: true, label: true, grams: true },
      });
      for (const s of sv) {
        const list = servingsByFood.get(s.foodId) ?? [];
        list.push({ label: s.label, grams: Number(s.grams.toString()) });
        servingsByFood.set(s.foodId, list);
      }
    }

    const foods: SearchFood[] = rows.map((r) => ({
      id: r.id,
      sourceCode: r.sourceCode,
      name: r.name,
      nameEn: r.nameEn,
      state: r.state,
      foodGroup: r.foodGroup,
      cuisine: r.cuisine,
      portionG: num(r.portionGCooked),
      servings: servingsByFood.get(r.id) ?? [],
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
