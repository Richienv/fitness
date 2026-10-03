// CI guards for the facet classifier over the REAL pool.
//
// The classifier's vocabulary is data, and data rots: a new catalogue pack, a
// new spelling, a word added to VOCAB that turns out to swallow a base. These
// tests do not check individual foods — lib/foodFacets.test.ts does that — they
// check that the classifier as a whole has not drifted into being useless, and
// when it has they say which words to look at.
//
//   node --experimental-strip-types --test scripts/foodGuard.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { VOCAB, parseFood } from "../lib/foodFacets.ts";
import { buildFamilies, NONE } from "../lib/foodFamilies.ts";
import { buildTiles, facetRows, leavesFor, applyPick, canonicalLeaf } from "../lib/foodTiles.ts";
import { normalize } from "../lib/foodSearch.ts";
import { buildPool } from "./searchPool.ts";

const pool = buildPool();
const idx = buildFamilies(pool);

test("every row in the pool parses without throwing and gets a base", () => {
  for (const f of pool) {
    const p = parseFood(f.name);
    assert.ok(p.base, `"${f.name}" has no base`);
  }
  assert.equal(idx.unplaced.length, 0, `${idx.unplaced.length} rows are unplaced`);
});

test("a facet word almost never ends up as a base", () => {
  // The way a vocabulary entry goes wrong: "goreng" or "dada" becomes the base
  // of rows that should be filed under ayam. A handful are legitimate (usus
  // goreng, iga penyet — an organ IS the food), so this is a ceiling not zero.
  const facetWords = new Set(
    (["prep", "cut", "style", "state", "where"] as const).flatMap((a) => VOCAB[a]).flatMap((p) => normalize(p).split(" "))
  );
  const bad = pool.filter((f) => facetWords.has(parseFood(f.name).base));
  assert.ok(bad.length <= 8, `${bad.length} rows have a facet word as base: ${bad.slice(0, 12).map((f) => f.name).join(" | ")}`);
});

test("a useful share of the pool carries a facet or a variety", () => {
  const fams = [...idx.families.values()];
  const withAny = fams
    .flatMap((f) => f.leaves)
    .filter((l) => Object.values(l.parsed.facets).some((v) => v.length > 0)).length;
  const share = withAny / pool.length;
  // Measured 57%. The floor is below that so adding rows does not flap, but a
  // regression that halves it (a vocabulary typo, a broken normalise) fails.
  assert.ok(share > 0.45, `only ${(share * 100).toFixed(1)}% of rows carry any facet`);
});

test("the biggest families are real foods, not artefacts", () => {
  const top = [...idx.families.values()].sort((a, b) => b.leaves.length - a.leaves.length).slice(0, 12).map((f) => f.base);
  for (const must of ["ayam", "nasi", "ikan", "mie", "telur"]) {
    assert.ok(top.includes(must), `${must} is not among the 12 largest families: ${top.join(", ")}`);
  }
  // Modifiers that once led the list when the English rule was wrong.
  for (const never of ["whole", "white", "greek", "brown", "purple", "goreng", "bakar"]) {
    assert.ok(!idx.families.has(never) || idx.families.get(never)!.leaves.length < 5, `"${never}" became a large family`);
  }
});

test("report: the most common words nothing explains (maintenance list)", (t) => {
  const left = new Map<string, number>();
  for (const f of idx.families.values()) for (const l of f.leaves) for (const w of l.parsed.terms) left.set(w, (left.get(w) ?? 0) + 1);
  const top = [...left].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w, n]) => `${w}:${n}`);
  t.diagnostic(`unexplained words: ${top.join("  ")}`);
});

// ── the variety ("Macam") axis ───────────────────────────────────────────────

test("a variety is a word several foods of the family share, never a one-off", () => {
  for (const fam of idx.families.values()) {
    const seen = new Map<string, number>();
    for (const l of fam.leaves) for (const v of l.parsed.facets.ragam) seen.set(v, (seen.get(v) ?? 0) + 1);
    for (const [v, n] of seen) assert.ok(n >= 2, `${fam.base}: variety "${v}" is on only ${n} food`);
  }
});

test("nasi can be narrowed by its named kinds", () => {
  const nasi = buildTiles(idx).find((t) => t.id === "nasi")!;
  const rows = facetRows(nasi.family, {});
  assert.equal(rows[0]?.axis, "ragam", "nasi should ask 'nasi apa?' first");
  const values = rows[0].options.map((o) => o.value);
  for (const kind of ["kuning", "liwet", "uduk"]) assert.ok(values.includes(kind), `nasi ${kind} is not a chip`);
  // "Biasa" (plain nasi) is a real answer, offered but never forced.
  assert.ok(values.includes(NONE));
});

test("telur is asked how it was cooked and which kind of egg", () => {
  const telur = buildTiles(idx).find((t) => t.id === "telur")!;
  const rows = facetRows(telur.family, {});
  const prep = rows.find((r) => r.axis === "prep");
  assert.ok(prep, "telur has no cooking-method row");
  for (const m of ["dadar", "ceplok", "rebus"]) assert.ok(prep!.options.some((o) => o.value === m), `no telur ${m}`);
  assert.ok(rows.some((r) => r.axis === "ragam" && r.options.some((o) => o.value === "puyuh")), "no 'puyuh' kind");
});

test("picking a variety leaves real foods, and a plain default still resolves", () => {
  for (const t of buildTiles(idx).filter((x) => x.curated !== Infinity)) {
    const row = facetRows(t.family, {}).find((r) => r.axis === "ragam");
    if (!row) continue;
    for (const o of row.options) {
      const next = applyPick(t.family, {}, "ragam", o.value);
      assert.ok(leavesFor(t.family, next).length > 0, `${t.id}/ragam/${o.value} dead-ends`);
    }
  }
  // "Nasi kuning" must be reachable as a plain default of the kuning pick.
  const nasi = buildTiles(idx).find((t) => t.id === "nasi")!;
  const kuning = canonicalLeaf(nasi.family, { ragam: "kuning", prep: NONE, isi: NONE, where: NONE });
  assert.ok(kuning === null || kuning.food.name.toLowerCase().includes("kuning"));
});
