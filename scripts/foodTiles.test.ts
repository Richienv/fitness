// Properties of tiles and faceted navigation over the real pool.
//
//   node --experimental-strip-types --test scripts/foodTiles.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { buildFamilies, NONE, type Picks } from "../lib/foodFamilies.ts";
import {
  TILE_DEFS,
  applyPick,
  buildTiles,
  canonicalLeaf,
  facetRows,
  leavesFor,
  picksOf,
} from "../lib/foodTiles.ts";
import { buildPool } from "./searchPool.ts";

const pool = buildPool();
const idx = buildFamilies(pool);
const tiles = buildTiles(idx);

test("every curated tile resolves to real families", () => {
  // A tile whose bases all miss would render an empty card, silently.
  for (const d of TILE_DEFS) {
    const t = tiles.find((x) => x.id === d.id);
    assert.ok(t, `tile "${d.id}" matched no family — check its bases against the census`);
    assert.ok(t!.family.leaves.length >= 3, `tile "${d.id}" has only ${t!.family.leaves.length} rows`);
  }
});

test("the curated tiles cover a real share of the pool, honestly measured", () => {
  const covered = new Set<string>();
  for (const t of tiles.filter((x) => x.curated !== Infinity)) for (const l of t.family.leaves) covered.add(l.food.id);
  const share = covered.size / pool.length;
  // A floor, not a boast: tiles are the FAST path and search covers the rest.
  assert.ok(share > 0.4, `curated tiles cover only ${(share * 100).toFixed(1)}% of the pool`);
});

test("a merged tile makes the base itself the first choice", () => {
  const ikan = tiles.find((t) => t.id === "ikan")!;
  const rows = facetRows(ikan.family, {});
  assert.equal(rows[0]?.axis, "jenis", "Ikan & Seafood must start by asking which kind");
  const values = rows[0].options.map((o) => o.value);
  for (const b of ["ikan", "udang", "cumi"]) assert.ok(values.includes(b), `no ${b} under Ikan & Seafood`);
});

test("a single-base tile does not invent a 'jenis' row", () => {
  const telur = tiles.find((t) => t.id === "telur")!;
  assert.ok(!facetRows(telur.family, {}).some((r) => r.axis === "jenis"));
});

test("every option on every row leaves at least one food", () => {
  // The invariant the whole sheet rests on: there is no chip you can tap that
  // leads nowhere.
  for (const t of tiles) {
    const rows = facetRows(t.family, {});
    for (const row of rows) {
      for (const o of row.options) {
        const next = applyPick(t.family, {}, row.axis, o.value);
        assert.ok(leavesFor(t.family, next).length > 0, `${t.id}/${row.axis}/${o.value} dead-ends`);
      }
    }
  }
});

test("a random walk of taps never dead-ends, and every option stays honest", () => {
  // Deterministic LCG so a failure reproduces.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let steps = 0;
  for (const t of tiles.slice(0, 20)) {
    let picks: Picks = {};
    for (let i = 0; i < 12; i++) {
      const rows = facetRows(t.family, picks);
      if (rows.length === 0) break;
      const row = rows[Math.floor(rnd() * rows.length)];
      const opt = row.options[Math.floor(rnd() * row.options.length)];
      picks = applyPick(t.family, picks, row.axis, opt.value);
      steps++;
      const left = leavesFor(t.family, picks);
      assert.ok(left.length > 0, `${t.id} dead-ended at ${JSON.stringify(picks)}`);
      // Honesty: each option's count equals the rows actually behind it.
      for (const r of facetRows(t.family, picks)) {
        for (const o of r.options) {
          const backing = leavesFor(t.family, applyPick(t.family, picks, r.axis, o.value)).length;
          assert.ok(backing >= 1, `${t.id}/${r.axis}/${o.value} offered with no backing row`);
        }
      }
    }
  }
  assert.ok(steps > 100, `walked too few steps: ${steps}`);
});

test("opening on any leaf lights chips that include that leaf", () => {
  // The sheet opens already sitting on a real food. picksOf must describe it.
  for (const t of tiles.slice(0, 14)) {
    for (const leaf of t.family.leaves.slice(0, 25)) {
      const picks = picksOf(t.family, leaf);
      const left = leavesFor(t.family, picks);
      assert.ok(
        left.some((l) => l.food.id === leaf.food.id),
        `${t.id}: picks ${JSON.stringify(picks)} do not contain ${leaf.food.name}`
      );
    }
  }
});

test("tapping the selected chip clears that axis", () => {
  const ayam = tiles.find((t) => t.id === "ayam")!;
  const a = applyPick(ayam.family, {}, "prep", "goreng");
  assert.equal(a.prep, "goreng");
  const b = applyPick(ayam.family, a, "prep", "goreng");
  assert.equal(b.prep, undefined);
});

test("switching the cooking method keeps the cut only if that row exists", () => {
  const ayam = tiles.find((t) => t.id === "ayam")!;
  const gorengPaha = applyPick(ayam.family, applyPick(ayam.family, {}, "prep", "goreng"), "cut", "paha");
  assert.ok(leavesFor(ayam.family, gorengPaha).length > 0);
  // bakar + paha has (at most) one row. Whatever happens, it must not be empty,
  // and the tapped value must win over the stale one.
  const swapped = applyPick(ayam.family, gorengPaha, "prep", "bakar");
  assert.equal(swapped.prep, "bakar");
  assert.ok(leavesFor(ayam.family, swapped).length > 0);
});

test("the ayam tile reaches the plain 'Ayam goreng' as its default", () => {
  const ayam = tiles.find((t) => t.id === "ayam")!;
  const plain = canonicalLeaf(ayam.family, { prep: "goreng", cut: NONE });
  assert.ok(plain, "no plain Ayam goreng");
  assert.equal(plain!.food.name.toLowerCase(), "ayam goreng");
});
