// Rebuilds, offline, the exact food pool the app searches on a phone.
//
// This exists so ranking can be MEASURED instead of argued about. The client
// searches `INGREDIENTS + custom + groups + catalogue` (see the searchPool memo
// in app/meal/FoodBuilder.tsx); anything that reconstructs less than that gives
// answers that look right and are wrong. My first throwaway probe omitted
// INGREDIENTS and "concluded" that Whole egg was missing from the catalogue —
// it isn't, it just ranks badly, which is a completely different bug.
//
// Custom and group foods are per-user and empty for a fresh install, so the
// offline pool is INGREDIENTS + the seeded catalogue. That is what a new user
// searches on day one, which is the case worth being correct about.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseFoodCsv, type FoodRow } from "./foodCsv.ts";
import { computePopularity, extractNameEn } from "./foodRanking.ts";
import { INGREDIENTS, STAPLE_POPULARITY } from "../lib/ingredients.ts";
import type { SearchableFood } from "../lib/foodSearch.ts";

/**
 * Which seed source each CSV belongs to, because computePopularity() weights
 * TKPI/CUSTOM/USDA differently and getting this wrong would silently change
 * every score.
 *
 * Duplicated from the SOURCES table in scripts/seed-foods.ts, which cannot be
 * imported: that module calls main() at import time and would try to reach a
 * database. searchPool.test.ts asserts this map covers every CSV in data/, so
 * adding a pack without updating it fails the tests rather than skewing them.
 */
const CSV_SOURCE: Record<string, string> = {
  "tkpi_2019_full.csv": "TKPI",
  "usda_foods.csv": "USDA",
};
const DEFAULT_SOURCE = "CUSTOM";

/** A pool entry, plus enough extra to judge whether a result is a good answer. */
export type PoolFood = SearchableFood & {
  /** Where it came from — "ingredient" rows are the curated staples. */
  source: "ingredient" | "catalogue";
  /** Natural serving ("1 egg"), when the row has one. Loggers want these. */
  unit?: string;
  favorite?: boolean;
};

const DATA = join(process.cwd(), "data");

export function catalogueFiles(): string[] {
  return readdirSync(DATA).filter((n) => n.endsWith(".csv")).sort();
}

export function sourceFor(file: string): string {
  return CSV_SOURCE[file] ?? DEFAULT_SOURCE;
}

/** The pool a freshly-installed app searches. */
export function buildPool(): PoolFood[] {
  const pool: PoolFood[] = INGREDIENTS.map((i) => ({
    id: i.id,
    name: i.name,
    aliases: i.aliases,
    foodGroup: i.group,
    popularity: STAPLE_POPULARITY,
    source: "ingredient" as const,
    unit: i.unit,
    favorite: i.favorite,
  }));

  const seen = new Set(pool.map((p) => p.id));
  for (const file of catalogueFiles()) {
    const src = sourceFor(file);
    let rows: FoodRow[];
    try {
      rows = parseFoodCsv(readFileSync(join(DATA, file), "utf8"));
    } catch {
      continue;
    }
    for (const r of rows) {
      if (seen.has(r.code)) continue;
      seen.add(r.code);
      pool.push({
        id: r.code,
        name: r.name,
        englishName: extractNameEn(r) ?? undefined,
        aliases: r.aliases ?? undefined,
        foodGroup: r.foodGroup ?? undefined,
        cuisine: r.cuisine ?? undefined,
        popularity: computePopularity(r, src),
        source: "catalogue",
        unit: r.portionGCooked ? `${r.portionGCooked} g` : undefined,
      });
    }
  }
  return pool;
}
