// Tiles and faceted navigation: what the picker's screens are made of.
//
// TILES. A family is "all rows whose base is ayam". A TILE is what you tap, and
// it is deliberately NOT always one family: nobody thinks "udang" and "cumi" and
// "ikan" are three separate places to look. "Ikan & Seafood" merges them, and
// the base itself becomes the first choice (axis "jenis"). The grouping is
// curated because the data cannot know it — the audit measured 1,213 distinct
// first words, 693 of them singletons, and the 12 biggest raw bases cover only a
// quarter of rows. Curated tiles are the fast path; search and "semua" remain
// the way to everything else.
//
// FACETED NAVIGATION. The sheet shows every question at once as rows of chips
// rather than asking them one screen at a time, because the macros update live
// as you change them and one screen saves a tap. The rule that keeps that
// honest: each row's options are computed from the picks on the OTHER rows. So
// an option is only ever shown if choosing it leaves at least one real food —
// there is no way to select an empty combination, and no "ayam bakar dada"
// button when that row does not exist.

import type { FacetAxis } from "./foodFacets.ts";
import {
  NONE,
  dominatedAt,
  orderFor,
  type Family,
  type FamilyIndex,
  type Leaf,
  type Option,
  type Picks,
} from "./foodFamilies.ts";
import type { SearchableFood } from "./foodSearch.ts";

export type TileDef = {
  id: string;
  label: string;
  emoji: string;
  /** Bases merged into this tile, as produced by parseFood (Indonesian, normalised). */
  bases: string[];
  /** Question order where the default is wrong for this food. */
  axes?: FacetAxis[];
};

/** The tiles a new user sees, in the order a new user sees them. Order is the
 *  cold-start prior; once there is history, habit reorders them. */
export const TILE_DEFS: TileDef[] = [
  // ayam, nasi and telur are deliberately ONE base each. Merging bebek into ayam
  // put a "Jenis: Ayam | Bebek" row on the food people log most — an extra
  // decision for the 90% case in exchange for the 3%. Merge only things that
  // are genuinely different kinds (ikan / udang / cumi), never to save a tile.
  // Nasi asks "nasi apa?" (kuning, uduk, liwet) before "dimasak apa?": the named
  // varieties are how people say it, and goreng is one answer among them.
  {
    id: "nasi", label: "Nasi", emoji: "🍚", bases: ["nasi"],
    axes: ["jenis", "ragam", "prep", "isi", "cut", "style", "flavour", "where", "state"],
  },
  { id: "ayam", label: "Ayam", emoji: "🍗", bases: ["ayam"] },
  { id: "telur", label: "Telur", emoji: "🥚", bases: ["telur"] },
  { id: "ikan", label: "Ikan & Seafood", emoji: "🐟", bases: ["ikan", "udang", "cumi", "kepiting", "kerang", "lele", "salmon", "tuna", "teri", "tongkol", "bandeng"] },
  { id: "mie", label: "Mie & Bihun", emoji: "🍜", bases: ["mie", "bihun", "kwetiau", "indomie", "bakmi", "kwetau"] },
  { id: "tahu", label: "Tahu & Tempe", emoji: "🫘", bases: ["tahu", "tempe"] },
  { id: "sayur", label: "Sayur", emoji: "🥬", bases: ["sayur", "tumis", "capcay", "urap", "gado", "pecel", "lalapan", "kangkung", "bayam", "lodeh", "salad"] },
  { id: "sate", label: "Sate", emoji: "🍢", bases: ["sate", "satay"] },
  { id: "soto", label: "Soto & Sup", emoji: "🍲", bases: ["soto", "sop", "sup", "rawon", "bakso", "gulai", "kari", "opor", "pempek", "siomay", "batagor"] },
  { id: "bubur", label: "Bubur & Lontong", emoji: "🥣", bases: ["bubur", "lontong", "ketupat"] },
  { id: "daging", label: "Daging", emoji: "🥩", bases: ["sapi", "kambing", "babi", "bebek", "daging", "rendang", "semur", "steak", "iga"] },
  { id: "roti", label: "Roti & Kue", emoji: "🍞", bases: ["roti", "kue", "bolu", "martabak", "risoles", "donat", "pastel", "brownies", "cake"] },
  { id: "buah", label: "Buah", emoji: "🍌", bases: ["pisang", "apel", "mangga", "jeruk", "melon", "semangka", "pepaya", "anggur", "alpukat", "jambu", "nanas", "salak", "durian", "buah"] },
  { id: "minum", label: "Kopi, Teh & Susu", emoji: "☕", bases: ["kopi", "teh", "susu", "es", "jus", "minuman", "latte"] },
  { id: "camilan", label: "Camilan", emoji: "🥜", bases: ["keripik", "kerupuk", "nugget", "kacang", "kentang", "singkong", "ubi"] },
];

export type Tile<T> = {
  id: string;
  label: string;
  emoji: string;
  /** The merged family the sheet navigates. `jenis` carries the base. */
  family: Family<T>;
  /** Position in TILE_DEFS, or Infinity for an automatic tile. */
  curated: number;
};

/** Merge several families into one, tagging each leaf with its base as `jenis`. */
function merge<T>(id: string, label: string, parts: Family<T>[], axisOrder?: FacetAxis[]): Family<T> {
  const multi = parts.length > 1;
  const leaves: Leaf<T>[] = [];
  const duplicates = new Map<string, T[]>();
  for (const f of parts) {
    for (const l of f.leaves) {
      leaves.push(
        multi ? { ...l, parsed: { ...l.parsed, facets: { ...l.parsed.facets, jenis: [f.base] } } } : l
      );
    }
    for (const [k, v] of f.duplicates) duplicates.set(`${f.base}:${k}`, v);
  }
  return {
    base: id,
    label,
    leaves,
    duplicates,
    isDish: parts.some((f) => f.isDish),
    axisOrder,
  };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Curated tiles first, then every remaining family big enough to be worth one. */
export function buildTiles<T extends SearchableFood>(
  index: FamilyIndex<T>,
  defs: TileDef[] = TILE_DEFS,
  minAuto = 8
): Tile<T>[] {
  const claimed = new Set<string>();
  const out: Tile<T>[] = [];
  defs.forEach((d, i) => {
    const parts = d.bases.map((b) => index.families.get(b)).filter((f): f is Family<T> => !!f);
    if (parts.length === 0) return;
    for (const f of parts) claimed.add(f.base);
    out.push({ id: d.id, label: d.label, emoji: d.emoji, family: merge(d.id, d.label, parts, d.axes), curated: i });
  });
  for (const f of index.families.values()) {
    if (claimed.has(f.base) || f.leaves.length < minAuto) continue;
    out.push({ id: `auto:${f.base}`, label: cap(f.base), emoji: "🍽️", family: f, curated: Infinity });
  }
  return out;
}

// ───────────────────────── faceted navigation ─────────────────────────

const matchesPick = <T,>(l: Leaf<T>, axis: FacetAxis, want: string): boolean => {
  const have = l.parsed.facets[axis];
  return want === NONE ? have.length === 0 : have.includes(want);
};

const matchesAll = <T,>(l: Leaf<T>, picks: Picks, except?: FacetAxis): boolean => {
  for (const a of Object.keys(picks) as FacetAxis[]) {
    if (a === except) continue;
    const want = picks[a];
    if (want && !matchesPick(l, a, want)) return false;
  }
  return true;
};

export const leavesFor = <T,>(family: Family<T>, picks: Picks): Leaf<T>[] =>
  family.leaves.filter((l) => matchesAll(l, picks));

export type FacetRow = {
  axis: FacetAxis;
  /** Options given every OTHER pick, so each one leaves at least one food. */
  options: Option[];
  selected: string | null;
};

/** Every row the sheet should show for the current picks. */
export function facetRows<T>(family: Family<T>, picks: Picks): FacetRow[] {
  const order = orderFor(family);
  const rows: FacetRow[] = [];
  for (const axis of order) {
    const pool = family.leaves.filter((l) => matchesAll(l, picks, axis));
    if (pool.length === 0) continue;
    const counts = new Map<string, number>();
    let uncovered = 0;
    for (const l of pool) {
      const vs = l.parsed.facets[axis];
      if (vs.length === 0) uncovered++;
      for (const v of vs) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const answers = counts.size + (uncovered > 0 ? 1 : 0);
    const selected = picks[axis] ?? null;
    if (answers < 2 && !selected) continue;
    if (!selected && uncovered / pool.length > dominatedAt(axis)) continue;
    const options: Option[] = [...counts]
      .map(([value, count]) => ({ value, label: cap(value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "id"));
    // "Umum" (no specific value) goes FIRST on refinement axes: it is the default,
    // so the lit chip sits at the left edge and the real options are visible
    // beside it instead of being scrolled out of view. On the main axes
    // (what / how cooked) the catch-all stays last, as "Lainnya".
    if (uncovered > 0 && counts.size > 0) {
      const main = axis === "prep" || axis === "jenis" || axis === "isi";
      // "Biasa" for a variety: most nasi is just nasi, and that is a real answer.
      const none: Option = { value: NONE, label: main ? "Lainnya" : axis === "ragam" ? "Biasa" : "Umum", count: uncovered };
      if (main) options.push(none);
      else options.unshift(none);
    }
    // A row that is SELECTED must always offer its selected chip, or there is no
    // way to tap it again to clear it — the picks stay stuck on a row with no
    // buttons. This happens when the pick is "none of these" and nothing else
    // in the remaining pool carries the facet.
    if (selected && !options.some((o) => o.value === selected)) {
      const backing = pool.filter((l) => matchesPick(l, axis, selected)).length;
      options.push({
        value: selected,
        label: selected === NONE ? (axis === "prep" || axis === "jenis" || axis === "isi" ? "Lainnya" : axis === "ragam" ? "Biasa" : "Umum") : cap(selected),
        count: backing,
      });
    }
    // A row with a single chip asks nothing. It happens when the only option left
    // IS the selected one ("Kondisi: Umum"); showing it is noise, not a choice.
    if (options.length < 2) continue;
    rows.push({ axis, options, selected });
  }
  return rows;
}

/**
 * The picks that describe one leaf: every axis on which it has exactly one
 * value, plus NONE where it has none but its siblings do. Used to open the
 * sheet already sitting on a real food, with its chips lit.
 */
export function picksOf<T>(family: Family<T>, leaf: Leaf<T>): Picks {
  const picks: Picks = {};
  const order = orderFor(family);
  for (const axis of order) {
    const have = leaf.parsed.facets[axis];
    if (have.length === 1) picks[axis] = have[0];
    else if (have.length === 0) {
      // Only if some sibling DOES carry the facet — otherwise the row is not shown.
      if (family.leaves.some((l) => l.parsed.facets[axis].length > 0)) picks[axis] = NONE;
    }
  }
  return picks;
}

/**
 * Apply one chip tap. The tapped axis takes the value; every OTHER pick that no
 * longer co-exists with it is dropped, nearest-in-order first, so a tap never
 * dead-ends and the user is never told "no such food" for something they could
 * reach. Tapping the selected chip clears that axis.
 */
export function applyPick<T>(family: Family<T>, picks: Picks, axis: FacetAxis, value: string): Picks {
  const next: Picks = { ...picks };
  if (next[axis] === value) delete next[axis];
  else next[axis] = value;
  if (leavesFor(family, next).length > 0) return next;
  // Conflict: keep the tapped pick, shed the others until something exists.
  const keep: Picks = { [axis]: value };
  const order = orderFor(family);
  for (const a of order) {
    if (a === axis || !next[a]) continue;
    const trial: Picks = { ...keep, [a]: next[a] };
    if (leavesFor(family, trial).length > 0) keep[a] = next[a];
  }
  return keep;
}

/** The plain version of a food: its facets are exactly the picks and nothing is
 *  left over. "Ayam goreng", not "Ayam Goreng Sabana". */
export function canonicalLeaf<T>(family: Family<T>, picks: Picks): Leaf<T> | null {
  const order = orderFor(family);
  return (
    leavesFor(family, picks).find((l) => {
      if (l.parsed.rest.some((w) => !l.parsed.facets.ragam.includes(w))) return false;
      for (const a of order) {
        // `jenis` only says WHICH base a merged tile's leaf came from.
        if (a === "jenis") continue;
        const have = l.parsed.facets[a];
        const want = picks[a];
        if (want === NONE) {
          if (have.length > 0) return false;
        } else if (want) {
          if (!(have.length === 1 && have[0] === want)) return false;
        } else if (have.length > 0) return false;
      }
      return true;
    }) ?? null
  );
}
