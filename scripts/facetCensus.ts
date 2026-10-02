// What does the facet classifier understand, and what has it not placed yet?
//
//   npx tsx scripts/facetCensus.ts              coverage + top unplaced words
//   npx tsx scripts/facetCensus.ts ayam         the family tree for one base
//
// The vocabulary in lib/foodFacets.ts is data, and this is how it grows: the
// "unplaced" list ranks leftover words by how many foods they touch, so the
// next word worth adding is always at the top, and the effect of adding it is
// visible in the coverage number straight away.

import { buildPool } from "./searchPool.ts";
import { buildFamilies, refine, NONE, type Picks } from "../lib/foodFamilies.ts";
import { AXIS_ORDER, AXIS_LABEL } from "../lib/foodFacets.ts";

const pool = buildPool();
const idx = buildFamilies(pool);
const fams = [...idx.families.values()];

const placed = pool.length - idx.unplaced.length;
const inBig = fams.filter((f) => f.leaves.length >= 3).reduce((n, f) => n + f.leaves.length, 0);
const single = fams.filter((f) => f.leaves.length === 1).length;
const withFacet = fams.flatMap((f) => f.leaves).filter((l) => AXIS_ORDER.some((a) => l.parsed.facets[a].length)).length;
const dupes = fams.reduce((n, f) => n + [...f.duplicates.values()].reduce((m, d) => m + d.length, 0), 0);

console.log(`pool                      ${pool.length}`);
console.log(`placed in a family        ${placed}  (${((100 * placed) / pool.length).toFixed(1)}%)`);
console.log(`families                  ${fams.length}   (singletons ${single})`);
console.log(`rows in a family of >= 3  ${inBig}  (${((100 * inBig) / pool.length).toFixed(1)}%)`);
console.log(`rows with >= 1 facet      ${withFacet}  (${((100 * withFacet) / pool.length).toFixed(1)}%)`);
console.log(`exact-name duplicates     ${dupes} collapsed`);

const arg = process.argv[2];
if (!arg) {
  const left = new Map<string, number>();
  for (const f of fams) for (const l of f.leaves) for (const w of l.parsed.rest) left.set(w, (left.get(w) ?? 0) + 1);
  console.log("\nTOP FAMILIES:");
  console.log(
    fams
      .sort((a, b) => b.leaves.length - a.leaves.length)
      .slice(0, 30)
      .map((f) => `${f.base}:${f.leaves.length}`)
      .join("  ")
  );
  console.log("\nTOP UNPLACED WORDS (candidates for VOCAB):");
  console.log([...left].sort((a, b) => b[1] - a[1]).slice(0, 70).map(([w, n]) => `${w}:${n}`).join("  "));
} else {
  const fam = idx.families.get(arg);
  if (!fam) {
    console.log(`no family "${arg}"`);
    process.exit(1);
  }
  const walk = (picks: Picks, depth: number) => {
    const st = refine(fam, picks);
    const pad = "  ".repeat(depth);
    if (!st.axis || depth > 3) {
      console.log(`${pad}→ ${st.leaves.length} row(s)${st.canonical ? `  [default: ${st.canonical.food.name}]` : ""}`);
      for (const l of st.leaves.slice(0, 6)) console.log(`${pad}    · ${l.food.name}`);
      if (st.leaves.length > 6) console.log(`${pad}    … +${st.leaves.length - 6}`);
      return;
    }
    console.log(`${pad}${AXIS_LABEL[st.axis]}?  ${st.options.map((o) => `${o.label}(${o.count})`).join("  ")}`);
    for (const o of st.options.slice(0, 3)) {
      console.log(`${pad}  ▸ ${o.label}`);
      walk({ ...picks, [st.axis]: o.value }, depth + 2);
    }
  };
  console.log(`\nFAMILY "${arg}" — ${fam.leaves.length} rows${fam.isDish ? "  (dish: next axis is what's IN it)" : ""}`);
  walk({}, 0);
  void NONE;
}
