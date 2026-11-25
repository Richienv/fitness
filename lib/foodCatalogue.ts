"use client";

// The shared food catalogue, cached on device.
//
// Why this exists: the builder used to fetch ~1800 rows on every open and
// block the whole list behind a spinner while it did. Worse, the effect that
// fetched it listed its own loading flag in its dependency array, so React
// tore the request down via cleanup before it could resolve — the flag stayed
// true, the list stayed null, and "MEMUAT LIBRARY…" spun forever.
//
// Both problems go away by moving the fetch out of the component: one
// in-flight request shared by every caller, a localStorage cache so reopening
// is instant, and a result that is either data or a stated error — never a
// silent nothing.

import { scopedKey } from "./userScope.ts";

export type CatalogueFood = {
  sourceCode: string;
  name: string;
  nameEn: string | null;
  /** Space-separated alternative names. Search-only; never shown. */
  aliases: string | null;
  /** Raw/cooked source state when known ("Mentah", "Olahan", "Tunggal"). */
  state?: string | null;
  /** Conventional serving in grams, when the source declares one. */
  portionG: number | null;
  foodGroup: string | null;
  cuisine: string | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  sugar_g: number | null;
  /** Seed-time popularity 0–200; the ranker's and the picker's static prior. */
  popularity?: number | null;
};

// v4: bundled CSV + DB hybrid catalogue (all 16 packs = 4,871+ foods + state).
export const CACHE_KEY = "richie.foodCatalogue.v4";
export const SCHEMA_VERSION = 4;
export const MIN_CATALOGUE_COUNT = 4800;
const LEGACY_CACHE_KEYS = [
  "richie.foodCatalogue.v1",
  "richie.foodCatalogue.v2",
  "richie.foodCatalogue.v3",
];

/** A day. The catalogue only changes on re-seed or JSON import, and a stale
 *  row is far less bad than a spinner. */
const TTL_MS = 24 * 60 * 60 * 1000;

type Cached = { v?: number; at: number; foods: CatalogueFood[] };

export function normalizeCatalogueFoods(raw: unknown): CatalogueFood[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is CatalogueFood => {
      if (
        !f ||
        typeof f !== "object" ||
        typeof f.sourceCode !== "string" ||
        !f.sourceCode ||
        typeof f.name !== "string" ||
        !f.name.trim()
      )
        return false;
      return [f.energy_kcal, f.protein_g, f.fat_g, f.carb_g, f.sugar_g].every(
        (v) => v == null || (Number.isFinite(v) && v >= 0),
      );
    })
    .map((f) => ({
      ...f,
      popularity:
        Number.isFinite(f.popularity) && f.popularity! >= 0
          ? f.popularity
          : null,
      portionG:
        Number.isFinite(f.portionG) && f.portionG! > 0 ? f.portionG : null,
      aliases: typeof f.aliases === "string" ? f.aliases : null,
      state: typeof f.state === "string" ? f.state : null,
      nameEn: typeof f.nameEn === "string" ? f.nameEn : null,
      foodGroup: typeof f.foodGroup === "string" ? f.foodGroup : null,
      cuisine: typeof f.cuisine === "string" ? f.cuisine : null,
    }));
}

export function isCatalogueEntryStale(
  entry: { v?: number; at: number; count: number },
  now = Date.now(),
): boolean {
  if (!Number.isFinite(entry.at) || entry.at <= 0) return true;
  if (entry.v !== SCHEMA_VERSION) return true;
  if (entry.count < MIN_CATALOGUE_COUNT) return true;
  return now - entry.at > TTL_MS;
}

function readCacheEntry(): { foods: CatalogueFood[]; stale: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(CACHE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed || !Number.isFinite(parsed.at) || parsed.at <= 0) return null;
    const foods = normalizeCatalogueFoods(parsed.foods);
    if (!foods.length) return null;
    return {
      foods,
      stale: isCatalogueEntryStale({
        v: parsed.v,
        at: parsed.at,
        count: foods.length,
      }),
    };
  } catch {
    return null;
  }
}

export function readCachedCatalogue(): CatalogueFood[] | null {
  // Stale-while-revalidate: never throw away a usable offline catalogue just
  // because 24h passed. Callers get instant data; loadCatalogue() refreshes in
  // the background when stale.
  return readCacheEntry()?.foods ?? null;
}

function writeCache(foods: CatalogueFood[]): void {
  if (typeof window === "undefined" || foods.length === 0) return;
  try {
    for (const oldKey of LEGACY_CACHE_KEYS) {
      window.localStorage.removeItem(scopedKey(oldKey));
      window.localStorage.removeItem(oldKey);
    }
    window.localStorage.setItem(
      scopedKey(CACHE_KEY),
      JSON.stringify({
        v: SCHEMA_VERSION,
        at: Date.now(),
        foods,
      } satisfies Cached),
    );
  } catch {
    // Over quota. Losing the cache costs a refetch; it must never cost the
    // catalogue itself, so this is swallowed deliberately.
  }
}

export function clearCatalogueCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(CACHE_KEY));
    for (const oldKey of LEGACY_CACHE_KEYS) {
      window.localStorage.removeItem(scopedKey(oldKey));
    }
  } catch {
    /* ignore */
  }
}

export type CatalogueResult =
  | { ok: true; foods: CatalogueFood[]; fromCache: boolean }
  | { ok: false; message: string };

// One shared request. Several components mounting at once must not each fetch
// 4800+ rows.
let inFlight: Promise<CatalogueResult> | null = null;

async function fetchCatalogue(): Promise<CatalogueResult> {
  try {
    const res = await fetch("/api/foods/all");
    if (!res.ok) {
      // The server's message can be a database stack trace; it stays in the
      // console, and the person gets words they can act on.
      const body = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (body?.message)
        console.warn("Katalog gagal dimuat:", res.status, body.message);
      return {
        ok: false,
        message:
          res.status === 401
            ? "Sesi habis. Masuk lagi untuk memuat katalog makanan."
            : "Katalog lengkap belum bisa dimuat. Makanan dasar tetap bisa dicari.",
      };
    }
    const data = (await res.json()) as { data?: { foods?: CatalogueFood[] } };
    const foods = normalizeCatalogueFoods(data?.data?.foods);
    if (foods.length === 0) {
      return {
        ok: false,
        message: "Katalog makanan kosong. Coba lagi nanti.",
      };
    }
    writeCache(foods);
    return { ok: true, foods, fromCache: false };
  } catch {
    return {
      ok: false,
      message:
        "Katalog belum bisa dimuat. Periksa koneksi; makanan dasar tetap bisa dicari.",
    };
  }
}

/**
 * The catalogue, from cache when possible.
 *
 * `force` skips the cache — used by the retry button, so "coba lagi" actually
 * tries again rather than handing back the same stale miss.
 * `onRefresh` is invoked if a stale cache entry triggers a silent background update.
 */
export function loadCatalogue(
  force = false,
  onRefresh?: (foods: CatalogueFood[]) => void,
): Promise<CatalogueResult> {
  if (!force) {
    const entry = readCacheEntry();
    if (entry) {
      // Serve immediately from cache; silently revalidate in background when stale or under-count.
      if (
        entry.stale &&
        !inFlight &&
        (typeof navigator === "undefined" || navigator.onLine !== false)
      ) {
        inFlight = fetchCatalogue()
          .then((res) => {
            if (res.ok && onRefresh) onRefresh(res.foods);
            return res;
          })
          .finally(() => {
            inFlight = null;
          });
      }
      return Promise.resolve({ ok: true, foods: entry.foods, fromCache: true });
    }
  }
  if (inFlight) return inFlight;
  inFlight = fetchCatalogue().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Pre-warm the food catalogue into localStorage during idle time on app start
 *  so opening "Catat makan" is instant even if the network later drops. */
export function warmFoodCatalogue(): void {
  if (typeof window === "undefined") return;
  const entry = readCacheEntry();
  if (entry && !entry.stale) return;
  void loadCatalogue(false);
}
