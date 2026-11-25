// Pure helpers for deduplicating and formatting "Pilihan cepat" quick-pick chips.
// No browser APIs, no "use client" — safe for both client UI and Node tests.

import { parseFood } from "./foodFacets.ts";
import { normalize } from "./foodSearch.ts";

const GENERIC_EGG_MODIFIERS = new Set([
  "telur",
  "telor",
  "egg",
  "eggs",
  "ayam",
  "chicken",
  "whole",
  "utuh",
  "negeri",
  "kampung",
  "ras",
  "biasa",
  "plain",
  "polos",
  "segar",
  "fresh",
  "matang",
  "mentah",
  "raw",
  "estimasi",
]);

const DISTINCT_EGG_TERMS = new Set([
  "putih",
  "kuning",
  "bebek",
  "puyuh",
  "asin",
  "pitan",
  "ceplok",
  "dadar",
  "rebus",
  "orak",
  "arik",
  "balado",
  "pindang",
  "teh",
  "kukus",
  "barendo",
  "gulung",
  "rendang",
]);

const FILLER_TERMS = new Set([
  "daging",
  "utuh",
  "whole",
  "biasa",
  "plain",
  "polos",
  "segar",
  "fresh",
  "matang",
  "mentah",
  "raw",
  "estimasi",
  "original",
  "fillet",
  "filet",
]);

/** Clean a quick-pick chip title without ugly slash-gloss bloat (e.g. "Teh susu / milk tea" → "Teh susu"). */
export function quickPickDisplayName(rawName: string): string {
  const s = (rawName ?? "").trim();
  if (!s) return s;
  // Strip trailing lowercase English gloss after " / " (e.g. "Teh susu / milk tea")
  const slashMatch = s.match(/^(.+?)\s+\/\s+([a-z][a-z\s-]+)$/);
  if (slashMatch && slashMatch[1].trim().length >= 3) {
    return slashMatch[1].trim();
  }
  return s;
}

/**
 * Compute a normalized family/root key so near-identical staples
 * (e.g. "Telur" and "Telur ayam", "Babi" and "Daging Babi") collapse into one
 * quick-pick chip while distinct cuts/preparations stay separate.
 */
export function quickPickRootKey(rawName: string): string {
  const withoutParen = (rawName ?? "")
    .replace(/\([^)]*\)/g, " ")
    .split("/")[0]
    ?.trim() ?? "";
  const cleaned = normalize(withoutParen);
  if (!cleaned) return "";

  const words = cleaned.split(/\s+/).filter(Boolean);
  const parsed = parseFood(withoutParen);

  if (parsed.base === "telur") {
    const special = words.filter((w) => DISTINCT_EGG_TERMS.has(w));
    const distinctFacets = [
      ...parsed.facets.prep,
      ...parsed.facets.flavour,
      ...parsed.facets.ragam.filter((r) => !GENERIC_EGG_MODIFIERS.has(r)),
    ];
    if (special.length === 0 && distinctFacets.length === 0) {
      return "telur";
    }
    return [...new Set(["telur", ...distinctFacets, ...special])].sort().join("|");
  }

  const nonFillerWords = words.filter((w) => !FILLER_TERMS.has(w));
  const hasDistinctQualifiers =
    parsed.facets.prep.length > 0 ||
    parsed.facets.cut.filter((c) => c !== "fillet").length > 0 ||
    parsed.facets.flavour.length > 0 ||
    parsed.facets.ragam.length > 0;
  const effectiveBase = parsed.base && !FILLER_TERMS.has(parsed.base) ? parsed.base : "";

  if (!hasDistinctQualifiers && nonFillerWords.length <= 1) {
    return effectiveBase || nonFillerWords[0] || parsed.base || cleaned;
  }

  const keyTokens = [
    effectiveBase,
    ...parsed.facets.prep,
    ...parsed.facets.cut.filter((c) => c !== "fillet" && !FILLER_TERMS.has(c)),
    ...parsed.facets.flavour,
    ...parsed.facets.isi.filter(
      (x) => !FILLER_TERMS.has(x) && !(parsed.base === "telur" && x === "ayam"),
    ),
    ...parsed.facets.ragam.filter((r) => !FILLER_TERMS.has(r)),
    ...parsed.terms.filter((t) => !FILLER_TERMS.has(t)),
  ].filter(Boolean);

  if (keyTokens.length > 0) {
    return [...new Set(keyTokens)].join("|");
  }
  return nonFillerWords.join(" ") || cleaned;
}

/**
 * Deduplicate quick-pick candidate items by id AND normalized family/root key,
 * preserving priority order, then capping to `limit`.
 */
export function dedupeQuickPickItems<T extends { id: string; name: string }>(
  items: readonly T[],
  limit = 6,
): T[] {
  const seenIds = new Set<string>();
  const seenRoots = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    if (!item || !item.id || !item.name?.trim()) continue;
    if (seenIds.has(item.id)) continue;
    const root = quickPickRootKey(item.name);
    if (root && seenRoots.has(root)) continue;
    seenIds.add(item.id);
    if (root) seenRoots.add(root);
    out.push(item);
    if (out.length >= limit) break;
  }

  return out;
}
