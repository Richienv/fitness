// GET /api/foods/search?q=...&group=...
//
// Searches the SHARED food-composition catalogue (all sources — TKPI, custom,
// R2FIT library, USDA — NOT per-user). Session-gated like the app's other web
// routes.
//
// v2 "TikTok-grade" search (see docs/enhanced-search-prompt.md): the whole
// catalogue is loaded into process memory once per instance (TTL-refreshed)
// and every query is answered from RAM by lib/foodSearchEngine — typo-tolerant
// (bounded Damerau–Levenshtein), bilingual (EN↔ID token synonyms, so
// "beef minced" finds "daging sapi cincang" and vice versa), order-independent,
// with the same tiered ranking + popularity prior as before. Computed result
// lists are additionally cached in a short-TTL LRU so debounced keystrokes and
// repeat/browse queries never recompute. No pg_trgm dependency — pure
// TypeScript, works everywhere.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import {
  FoodSearchIndex,
  normalizeQuery,
  type FoodDoc,
  type ScoredFood,
} from "@/lib/foodSearchEngine";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-actor",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
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

// ─── In-process catalogue index (TTL-refreshed) ─────────────────────────────
// The catalogue is small (thousands of rows) and shared across users, so one
// findMany per instance per TTL replaces a SQL round-trip per keystroke. On
// refresh failure the stale index keeps serving — search never goes dark.
const INDEX_TTL_MS = 10 * 60 * 1000;
let indexCache: { at: number; index: FoodSearchIndex } | null = null;
let indexLoading: Promise<FoodSearchIndex> | null = null;

async function loadIndex(): Promise<FoodSearchIndex> {
  const rows = await db.food.findMany({
    select: {
      id: true,
      sourceCode: true,
      name: true,
      nameEn: true,
      state: true,
      foodGroup: true,
      energy_kcal: true,
      protein_g: true,
      fat_g: true,
      carb_g: true,
      searchText: true,
      popularity: true,
    },
  });
  const docs: FoodDoc[] = rows.map((r) => ({
    id: r.id,
    sourceCode: r.sourceCode,
    name: r.name,
    nameEn: r.nameEn,
    state: r.state,
    foodGroup: r.foodGroup,
    energy_kcal: r.energy_kcal == null ? null : Number(r.energy_kcal),
    protein_g: r.protein_g == null ? null : Number(r.protein_g),
    fat_g: r.fat_g == null ? null : Number(r.fat_g),
    carb_g: r.carb_g == null ? null : Number(r.carb_g),
    searchText: r.searchText,
    popularity: r.popularity,
  }));
  return new FoodSearchIndex(docs);
}

async function getIndex(): Promise<FoodSearchIndex> {
  const now = Date.now();
  if (indexCache && now - indexCache.at <= INDEX_TTL_MS) {
    return indexCache.index;
  }
  // Single-flight: concurrent keystrokes share one findMany.
  if (!indexLoading) {
    indexLoading = loadIndex()
      .then((index) => {
        indexCache = { at: Date.now(), index };
        return index;
      })
      .finally(() => {
        indexLoading = null;
      });
  }
  // Serve the stale index while a refresh is in flight; only a cold instance
  // actually waits.
  if (indexCache) {
    indexLoading.catch(() => {}); // stale-while-revalidate: swallow refresh errors
    return indexCache.index;
  }
  return indexLoading;
}

// ─── In-process result cache (TTL + LRU) ───────────────────────────────────
// Per-instance, best-effort. The catalogue is shared (not per-user), so a hit
// is safe to reuse across sessions. Keyed by normalized query + group + limit.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 400;
const cache = new Map<string, { at: number; foods: ScoredFood[] }>();

function cacheGet(key: string): ScoredFood[] | null {
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

function cacheSet(key: string, foods: ScoredFood[]): void {
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
    const q = normalizeQuery(raw);
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

    const index = await getIndex();
    const foods = hasQuery
      ? index.search(q, { groups, limit })
      : index.browse(groups!, limit);

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
