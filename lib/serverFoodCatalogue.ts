// Server-only bundled + DB hybrid food catalogue loader & search engine.
//
// Reads all 16 CSV packs in `data/` via scripts/foodCsv.ts + scripts/foodRanking.ts,
// builds household servings from SERVING_CONVENTIONS + portion_g_cooked, caches
// the parsed catalogue & BM25 index in process memory, and merges safely with
// any extra DB-contributed rows (e.g., USER: entries from /contribute or /import).
//
// Pure Node/domain module (zero "use client", zero direct Prisma import) so it
// can be tested directly under `node --experimental-strip-types --test` without
// a database connection and safely imported by Next.js Node Route Handlers.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFoodCsv, type FoodRow } from "../scripts/foodCsv.ts";
import { computePopularity, extractNameEn } from "../scripts/foodRanking.ts";
import { FOOD_ALIASES, expandQuery } from "./foodAliases.ts";
import { parseFoodQuery } from "./foodQuery.ts";
import {
  normalize,
  prepare,
  searchPrepared,
  type Prepared,
  type SearchableFood,
} from "./foodSearch.ts";

export interface ServingMeasure {
  label: string;
  grams: number;
}

export interface ServerFoodEntry {
  id: string;
  sourceCode: string;
  name: string;
  nameEn: string | null;
  aliases: string | null;
  state: string | null;
  foodGroup: string | null;
  cuisine: string | null;
  portionG: number | null;
  servings: ServingMeasure[];
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  sugar_g: number | null;
  popularity: number;
}

export interface DbOverlayFood {
  id?: string;
  sourceCode: string;
  name: string;
  nameEn: string | null;
  aliases: string | null;
  state: string | null;
  foodGroup: string | null;
  cuisine: string | null;
  portionG: number | null;
  servings?: ServingMeasure[];
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  sugar_g: number | null;
  popularity: number | null;
}

export interface CatalogueFoodPayload {
  sourceCode: string;
  name: string;
  nameEn: string | null;
  aliases: string | null;
  state: string | null;
  portionG: number | null;
  foodGroup: string | null;
  cuisine: string | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  sugar_g: number | null;
  popularity: number | null;
}

export interface SearchFoodPayload {
  id: string;
  sourceCode: string;
  name: string;
  nameEn: string | null;
  state: string | null;
  foodGroup: string | null;
  cuisine: string | null;
  portionG: number | null;
  servings: ServingMeasure[];
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  sugar_g: number | null;
  score: number;
}

export const STEP_GROUPS: Record<string, string[]> = {
  protein: [
    "Daging",
    "Ikan dsb",
    "Telur",
    "Kacang",
    "Custom/Estimasi",
    "Masakan Nusantara",
    "Lauk Pauk",
    "Makanan Utama",
  ],
  carb: ["Serealia", "Umbi", "Buah", "Gula", "Makanan Utama", "Roti & Pastry"],
  vegetable: ["Sayur", "Sayur & Sup", "Buah"],
  extra: ["Lemak", "Bumbu", "Kue/Dessert", "Kue & Dessert", "Jajanan & Gorengan", "Sambal"],
  drink: ["Minuman", "Susu"],
};

const SERVING_CONVENTIONS: { match: string; label: string; grams: number }[] = [
  { match: "sate", label: "1 tusuk", grams: 15 },
  { match: "nasi", label: "1 porsi", grams: 150 },
  { match: "gado", label: "1 porsi", grams: 250 },
  { match: "telur", label: "1 butir", grams: 55 },
];

type SeedSource = "TKPI" | "CUSTOM" | "USDA";

interface CsvTask {
  file: string;
  source: SeedSource;
  prefix: string;
  optional?: boolean;
}

const TASKS: CsvTask[] = [
  { file: "tkpi_2019_full.csv", source: "TKPI", prefix: "TKPI:" },
  { file: "custom_foods.csv", source: "CUSTOM", prefix: "CUSTOM:" },
  { file: "desserts.csv", source: "CUSTOM", prefix: "DESSERT:" },
  { file: "r2fit_library.csv", source: "CUSTOM", prefix: "R2LIB:" },
  { file: "drinks.csv", source: "CUSTOM", prefix: "DRINK:" },
  { file: "cafe_foods.csv", source: "CUSTOM", prefix: "CAFE:" },
  { file: "fruits.csv", source: "CUSTOM", prefix: "FRUIT:" },
  { file: "masakan_pack.csv", source: "CUSTOM", prefix: "MASAK:" },
  { file: "pack_nusantara.csv", source: "CUSTOM", prefix: "NUS:" },
  { file: "pack_jajanan_bahan.csv", source: "CUSTOM", prefix: "JJN:" },
  { file: "pack_staples.csv", source: "CUSTOM", prefix: "STAPLE:" },
  { file: "pack_warung.csv", source: "CUSTOM", prefix: "WARUNG:" },
  { file: "pack_jawa.csv", source: "CUSTOM", prefix: "JAWA:" },
  { file: "pack_everyday.csv", source: "CUSTOM", prefix: "DAY:" },
  { file: "deep_everyday_pack.csv", source: "CUSTOM", prefix: "DFR:" },
  { file: "pack_idn_v1_1.csv", source: "CUSTOM", prefix: "IDN:" },
  { file: "usda_foods.csv", source: "USDA", prefix: "USDA:", optional: true },
];

function buildServings(row: FoodRow): ServingMeasure[] {
  const servings: ServingMeasure[] = [];
  if (row.portionGCooked != null && row.portionGCooked > 0) {
    servings.push({ label: "1 porsi", grams: row.portionGCooked });
  }
  for (const conv of SERVING_CONVENTIONS) {
    if (row.nameNormalized.includes(conv.match)) {
      if (!servings.some((s) => s.label === conv.label)) {
        servings.push({ label: conv.label, grams: conv.grams });
      }
    }
  }
  return servings;
}

type SearchDoc = SearchableFood & { entry: ServerFoodEntry };

let cachedDataDir: string | null = null;
let cachedBundled: ServerFoodEntry[] | null = null;
let cachedPrepared: Prepared<SearchDoc> | null = null;

function toSearchDoc(entry: ServerFoodEntry): SearchDoc {
  return {
    id: entry.sourceCode,
    name: entry.name,
    englishName: entry.nameEn ?? undefined,
    aliases: entry.aliases ?? undefined,
    foodGroup: entry.foodGroup ?? undefined,
    cuisine: entry.cuisine ?? undefined,
    popularity: entry.popularity,
    entry,
  };
}

/**
 * Load all bundled CSV packs from `dataDir` (defaults to `<cwd>/data`), cached
 * in process memory for the lifetime of the server worker.
 */
export function loadBundledFoodCatalogue(
  dataDir = join(process.cwd(), "data"),
): ServerFoodEntry[] {
  if (cachedBundled && cachedDataDir === dataDir) {
    return cachedBundled;
  }

  const byCode = new Map<string, ServerFoodEntry>();
  const handledFiles = new Set<string>();

  const ingestFile = (file: string, source: SeedSource, prefix: string) => {
    handledFiles.add(file);
    const fullPath = join(dataDir, file);
    if (!existsSync(fullPath)) return;
    const rows = parseFoodCsv(readFileSync(fullPath, "utf8"));
    for (const row of rows) {
      if (row.nutrients.energy_kcal == null) continue;
      const sourceCode = `${prefix}${row.code}`;
      const entry: ServerFoodEntry = {
        id: sourceCode,
        sourceCode,
        name: row.name,
        nameEn: extractNameEn(row),
        aliases: row.aliases,
        state: row.state,
        foodGroup: row.foodGroup,
        cuisine: row.cuisine,
        portionG: row.portionGCooked,
        servings: buildServings(row),
        energy_kcal: row.nutrients.energy_kcal,
        protein_g: row.nutrients.protein_g,
        fat_g: row.nutrients.fat_g,
        carb_g: row.nutrients.carb_g,
        sugar_g: row.nutrients.sugar_g,
        popularity: computePopularity(row, source),
      };
      byCode.set(sourceCode, entry);
    }
  };

  for (const task of TASKS) {
    const fullPath = join(dataDir, task.file);
    if (!existsSync(fullPath)) {
      if (task.optional) continue;
      continue;
    }
    ingestFile(task.file, task.source, task.prefix);
  }

  // Pick up any additional CSV pack added to data/ without waiting for TASKS edits.
  if (existsSync(dataDir)) {
    for (const file of readdirSync(dataDir).filter((f) => f.endsWith(".csv")).sort()) {
      if (handledFiles.has(file)) continue;
      const prefix = `${file.replace(/\.csv$/i, "").toUpperCase().slice(0, 12)}:`;
      ingestFile(file, "CUSTOM", prefix);
    }
  }

  const entries = sortCatalogueEntries([...byCode.values()]);
  cachedDataDir = dataDir;
  cachedBundled = entries;
  cachedPrepared = prepare(entries.map(toSearchDoc));
  return entries;
}

function sortCatalogueEntries(entries: ServerFoodEntry[]): ServerFoodEntry[] {
  return entries.sort(
    (a, b) =>
      Math.min(b.popularity ?? 0, 200) - Math.min(a.popularity ?? 0, 200) ||
      a.name.localeCompare(b.name, "id"),
  );
}

/**
 * Merge bundled CSV entries with DB rows.
 * Bundled CSV rows are authoritative for any shared `sourceCode` (preventing a
 * stale Postgres table from ever hiding newly added/updated CSV foods), while
 * DB-only entries (such as `USER:` community foods) are merged in cleanly.
 */
export function mergeFoodCatalogue(
  bundled: readonly ServerFoodEntry[],
  dbRows: readonly DbOverlayFood[],
): { entries: ServerFoodEntry[]; hasDbExtras: boolean } {
  const byCode = new Map<string, ServerFoodEntry>();
  for (const b of bundled) {
    byCode.set(b.sourceCode, b);
  }

  let hasDbExtras = false;
  for (const r of dbRows) {
    if (!r || !r.sourceCode || r.energy_kcal == null) continue;
    const existing = byCode.get(r.sourceCode);
    if (existing) {
      // Keep bundled canonical macros/aliases/popularity; inherit DB id/servings only if needed.
      if (r.id || (existing.servings.length === 0 && r.servings?.length)) {
        byCode.set(r.sourceCode, {
          ...existing,
          id: r.id || existing.id,
          servings: existing.servings.length > 0 ? existing.servings : (r.servings ?? []),
        });
      }
      continue;
    }

    hasDbExtras = true;
    byCode.set(r.sourceCode, {
      id: r.id || r.sourceCode,
      sourceCode: r.sourceCode,
      name: r.name,
      nameEn: r.nameEn,
      aliases: r.aliases,
      state: r.state,
      foodGroup: r.foodGroup,
      cuisine: r.cuisine,
      portionG: r.portionG,
      servings: r.servings ?? [],
      energy_kcal: r.energy_kcal,
      protein_g: r.protein_g,
      fat_g: r.fat_g,
      carb_g: r.carb_g,
      sugar_g: r.sugar_g,
      popularity: r.popularity ?? 6,
    });
  }

  if (!hasDbExtras) {
    return { entries: [...byCode.values()], hasDbExtras: false };
  }
  return { entries: sortCatalogueEntries([...byCode.values()]), hasDbExtras: true };
}

export async function getHybridFoodCatalogue(opts?: {
  dataDir?: string;
  loadDb?: () => Promise<DbOverlayFood[]>;
}): Promise<CatalogueFoodPayload[]> {
  const bundled = loadBundledFoodCatalogue(opts?.dataDir);
  let dbRows: DbOverlayFood[] = [];
  if (opts?.loadDb) {
    try {
      dbRows = await opts.loadDb();
    } catch {
      dbRows = [];
    }
  }
  const { entries } = mergeFoodCatalogue(bundled, dbRows);
  return entries.map((r) => ({
    sourceCode: r.sourceCode,
    name: r.name,
    nameEn: r.nameEn,
    aliases: r.aliases,
    state: r.state,
    portionG: r.portionG,
    foodGroup: r.foodGroup,
    cuisine: r.cuisine,
    energy_kcal: r.energy_kcal,
    protein_g: r.protein_g,
    fat_g: r.fat_g,
    carb_g: r.carb_g,
    sugar_g: r.sugar_g,
    popularity: r.popularity,
  }));
}

function toSearchPayload(entry: ServerFoodEntry, score: number): SearchFoodPayload {
  return {
    id: entry.id,
    sourceCode: entry.sourceCode,
    name: entry.name,
    nameEn: entry.nameEn,
    state: entry.state,
    foodGroup: entry.foodGroup,
    cuisine: entry.cuisine,
    portionG: entry.portionG,
    servings: entry.servings,
    energy_kcal: entry.energy_kcal,
    protein_g: entry.protein_g,
    fat_g: entry.fat_g,
    carb_g: entry.carb_g,
    sugar_g: entry.sugar_g,
    score: Math.round(score),
  };
}

export async function searchHybridFoods(opts: {
  query: string;
  groupKey?: string;
  limit?: number;
  dataDir?: string;
  loadDb?: () => Promise<DbOverlayFood[]>;
}): Promise<SearchFoodPayload[]> {
  const bundled = loadBundledFoodCatalogue(opts.dataDir);
  let dbRows: DbOverlayFood[] = [];
  if (opts.loadDb) {
    try {
      dbRows = await opts.loadDb();
    } catch {
      dbRows = [];
    }
  }

  const { entries, hasDbExtras } = mergeFoodCatalogue(bundled, dbRows);
  const groups = opts.groupKey ? STEP_GROUPS[opts.groupKey] : undefined;
  const rawQuery = (opts.query ?? "").trim();
  const parsed = parseFoodQuery(rawQuery);
  const normRaw = normalize(rawQuery);
  const hasQuery = normRaw.length >= 1;
  const limit = opts.limit ?? (groups && !hasQuery ? 80 : 30);

  if (!hasQuery && !groups) {
    return [];
  }

  // Browse by group (no query): rank by popularity, shorter names first.
  if (!hasQuery && groups) {
    const allowed = new Set(groups);
    return entries
      .filter((e) => e.foodGroup != null && allowed.has(e.foodGroup))
      .sort(
        (a, b) =>
          Math.min(b.popularity ?? 0, 200) - Math.min(a.popularity ?? 0, 200) ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name, "id"),
      )
      .slice(0, limit)
      .map((e) => toSearchPayload(e, Math.min(e.popularity ?? 0, 200)));
  }

  const useCachedBundledIndex =
    !hasDbExtras && !groups && cachedDataDir === (opts.dataDir ?? join(process.cwd(), "data")) && cachedPrepared != null;

  let prepared: Prepared<SearchDoc>;
  if (useCachedBundledIndex && cachedPrepared) {
    prepared = cachedPrepared;
  } else {
    const allowed = groups ? new Set(groups) : null;
    const filtered = allowed
      ? entries.filter((e) => e.foodGroup != null && allowed.has(e.foodGroup))
      : entries;
    prepared = prepare(filtered.map(toSearchDoc));
  }

  const searchTerm = parsed.text || rawQuery;
  const fetchLimit = Math.max(limit * 3, 60);
  const bestByCode = new Map<string, { entry: ServerFoodEntry; score: number; exact: boolean }>();

  const recordHits = (hits: ReturnType<typeof searchPrepared<SearchDoc>>, factor: number) => {
    for (const h of hits) {
      let adjusted = h.score * factor * 100;
      if (parsed.wantsRaw && (h.food.entry.state ?? "").toLowerCase() === "mentah") {
        adjusted *= 1.15;
      }
      const prev = bestByCode.get(h.food.entry.sourceCode);
      const isExact = Boolean(h.exact) && factor === 1;
      if (
        !prev ||
        Number(isExact) > Number(prev.exact) ||
        (isExact === prev.exact && adjusted > prev.score)
      ) {
        bestByCode.set(h.food.entry.sourceCode, {
          entry: h.food.entry,
          score: adjusted,
          exact: isExact,
        });
      }
    }
  };

  // Primary BM25 + Indonesian/English/CJK search
  recordHits(searchPrepared(prepared, searchTerm, { limit: fetchLimit }), 1);

  // Phrase-alias expansion via lib/foodAliases.ts (e.g. "charsiu" -> "char siu",
  // "bak kut teh" -> "bakut", "has dalam" -> "tenderloin")
  const aliasPhrases = new Set<string>();
  const fromRaw = FOOD_ALIASES[normRaw] ?? [];
  const fromParsed = FOOD_ALIASES[normalize(searchTerm)] ?? [];
  const expanded = expandQuery(normRaw);
  for (const p of [...fromRaw, ...fromParsed, ...expanded.terms]) {
    if (p && p !== normRaw && p !== normalize(searchTerm)) aliasPhrases.add(p);
  }
  for (const phrase of aliasPhrases) {
    recordHits(searchPrepared(prepared, phrase, { limit: limit * 2 }), 0.94);
  }

  const ranked = [...bestByCode.values()].sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.score - a.score ||
      a.entry.name.localeCompare(b.entry.name, "id"),
  );

  return ranked.slice(0, limit).map((r) => toSearchPayload(r.entry, r.score));
}

export function resetBundledFoodCatalogueCacheForTest(): void {
  cachedDataDir = null;
  cachedBundled = null;
  cachedPrepared = null;
}
