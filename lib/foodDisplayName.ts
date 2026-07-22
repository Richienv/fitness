// Human-friendly display names for catalogue foods.
//
// The TKPI source names are "inverted": the main ingredient comes first, then
// the part/preparation, comma-separated — e.g. "Sapi, abon, asli" really means
// "Abon sapi asli", and "Sop daging sapi, masakan" carries a redundant
// ", masakan". They also sometimes carry an English gloss in parentheses
// ("Daging sapi giling (minced beef)"). That reads badly and gets truncated in
// the list, so we reformat for DISPLAY only — search still runs on the original
// name + searchText server-side, so matching is unaffected.

// Trailing segments that add nothing for a logging user — dropped for display.
const DROP_TRAILING = new Set(["mentah", "masakan", "segar", "olahan"]);

/**
 * Turn a raw catalogue name into something a normal person reads at a glance.
 * Conservative: proper-noun names (no comma — café/brand/library items) are
 * returned untouched apart from stripping a parenthetical gloss.
 */
export function prettyFoodName(raw: string): string {
  if (!raw) return raw;
  // Drop noise: "(english gloss)", TKPI variety tags ("var. siwalik",
  // "var pelita"), and quality grades ("kw 2", "kw. 3") — none of it helps a
  // logging user.
  let s = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bvar\.?\s+[^\s,]+/gi, " ")
    .replace(/\bkw\.?\s*\d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // No comma → not an inverted TKPI name. Leave its capitalisation alone so
  // brand names (Teazzi, Starbucks, Shilin…) survive intact.
  if (!s.includes(",")) return s;

  let segs = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  // Peel off redundant trailing qualifiers.
  while (segs.length > 1 && DROP_TRAILING.has(segs[segs.length - 1].toLowerCase())) {
    segs.pop();
  }

  // A single segment after cleanup keeps its original case ("Sop daging sapi").
  if (segs.length === 1) return segs[0];

  // Inverted form: "Head, part, prep" → "part Head prep". Only reorder when the
  // head is a single word (an animal/plant noun), so real phrases aren't mangled
  // ("Beras giling, mentah" already collapsed to one segment above).
  const parts = !segs[0].includes(" ")
    ? [segs[1], segs[0], ...segs.slice(2)]
    : segs;

  const out = parts.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}
