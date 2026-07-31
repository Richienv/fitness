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
  foodGroup: string | null;
  cuisine: string | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
};

const CACHE_KEY = "richie.foodCatalogue.v1";
/** A day. The catalogue only changes on re-seed or JSON import, and a stale
 *  row is far less bad than a spinner. */
const TTL_MS = 24 * 60 * 60 * 1000;

type Cached = { at: number; foods: CatalogueFood[] };

export function readCachedCatalogue(): CatalogueFood[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(CACHE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed || !Array.isArray(parsed.foods) || parsed.foods.length === 0) return null;
    if (Date.now() - parsed.at > TTL_MS) return null;
    return parsed.foods;
  } catch {
    return null;
  }
}

function writeCache(foods: CatalogueFood[]): void {
  if (typeof window === "undefined" || foods.length === 0) return;
  try {
    window.localStorage.setItem(
      scopedKey(CACHE_KEY),
      JSON.stringify({ at: Date.now(), foods } satisfies Cached)
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
  } catch {
    /* ignore */
  }
}

export type CatalogueResult =
  | { ok: true; foods: CatalogueFood[]; fromCache: boolean }
  | { ok: false; message: string };

// One shared request. Several components mounting at once must not each fetch
// 1800 rows.
let inFlight: Promise<CatalogueResult> | null = null;

async function fetchCatalogue(): Promise<CatalogueResult> {
  try {
    const res = await fetch("/api/foods/all");
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return {
        ok: false,
        message:
          res.status === 401
            ? "Sesi habis — masuk lagi buat lihat library."
            : body?.message || `Library gagal dimuat (${res.status}).`,
      };
    }
    const data = (await res.json()) as { data?: { foods?: CatalogueFood[] } };
    const foods = data?.data?.foods ?? [];
    if (foods.length === 0) {
      return { ok: false, message: "Library kosong — coba lagi nanti." };
    }
    writeCache(foods);
    return { ok: true, foods, fromCache: false };
  } catch {
    return { ok: false, message: "Nggak bisa muat library — cek koneksi." };
  }
}

/**
 * The catalogue, from cache when possible.
 *
 * `force` skips the cache — used by the retry button, so "coba lagi" actually
 * tries again rather than handing back the same stale miss.
 */
export function loadCatalogue(force = false): Promise<CatalogueResult> {
  if (!force) {
    const cached = readCachedCatalogue();
    if (cached) return Promise.resolve({ ok: true, foods: cached, fromCache: true });
  }
  if (inFlight) return inFlight;
  inFlight = fetchCatalogue().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
