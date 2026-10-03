// Properties of the family tree over the REAL 4,575-food pool.
//
//   node --experimental-strip-types --test scripts/foodFamilies.test.ts
//
// These are properties, not examples, because the thing that can go wrong is not
// one name parsing badly — it is a food becoming UNREACHABLE, or the picker
// asking a question with nothing to choose. Both are invisible in a spot-check
// and obvious to a user ("where did my food go?").

import test from "node:test";
import assert from "node:assert/strict";
import { buildFamilies, refine, NONE, type Family, type Picks } from "../lib/foodFamilies.ts";
import { makePredictor, orderedStep } from "../lib/foodPredict.ts";
import type { FacetAxis } from "../lib/foodFacets.ts";
import { buildPool, type PoolFood } from "./searchPool.ts";

const pool = buildPool();
const idx = buildFamilies(pool);
const fams = [...idx.families.values()];

/** Every path of picks through one family, depth-limited, calling `visit` at each node. */
function walk<T extends PoolFood>(fam: Family<T>, visit: (picks: Picks, st: ReturnType<typeof refine<T>>) => void, depth = 0, picks: Picks = {}) {
  const st = refine(fam, picks);
  visit(picks, st);
  if (!st.axis || depth >= 4) return;
  for (const o of st.options) walk(fam, visit, depth + 1, { ...picks, [st.axis]: o.value });
}

test("every food in the pool belongs somewhere", () => {
  const seen = new Set<string>();
  for (const f of fams) for (const l of f.leaves) seen.add(l.food.id);
  for (const l of idx.unplaced) seen.add(l.food.id);
  // Duplicates are collapsed on purpose; account for them, don't hide them.
  let dropped = 0;
  for (const f of fams) for (const d of f.duplicates.values()) dropped += d.length;
  assert.equal(seen.size + dropped, pool.length, "foods vanished between the pool and the families");
});

test("nearly everything is placed in a family", () => {
  const placed = pool.length - idx.unplaced.length;
  assert.ok(placed / pool.length > 0.99, `only ${placed}/${pool.length} placed`);
});

test("an axis is never asked unless it can split the remaining rows", () => {
  // The skip rule. "Which cut?" when every row says dada is a tap that decides
  // nothing, and a screen of one chip is worse than no screen.
  let nodes = 0;
  for (const fam of fams) {
    walk(fam, (picks, st) => {
      nodes++;
      if (!st.axis) return;
      assert.ok(
        st.options.length >= 2,
        `${fam.base} ${JSON.stringify(picks)} asks ${st.axis} with ${st.options.length} option(s)`
      );
    });
  }
  assert.ok(nodes > 1000, `walked suspiciously few nodes: ${nodes}`);
});

test("every row is reachable from every question that could exclude it", () => {
  // If a question's options do not cover all remaining rows, some foods become
  // unreachable through that screen. "Lainnya" exists to prevent exactly that.
  for (const fam of fams) {
    walk(fam, (picks, st) => {
      if (!st.axis) return;
      const axis: FacetAxis = st.axis;
      for (const leaf of st.leaves) {
        const have = leaf.parsed.facets[axis];
        const reachable = st.options.some((o) =>
          o.value === NONE ? have.length === 0 : have.includes(o.value)
        );
        assert.ok(reachable, `${leaf.food.name} is unreachable from ${fam.base}/${axis} after ${JSON.stringify(picks)}`);
      }
    });
  }
});

test("following any option never dead-ends in zero rows", () => {
  for (const fam of fams) {
    walk(fam, (picks, st) => {
      assert.ok(st.leaves.length > 0, `${fam.base} ${JSON.stringify(picks)} has no rows`);
    });
  }
});

test("the ayam family is walkable the way a person would: ayam → goreng → paha", () => {
  const ayam = idx.families.get("ayam");
  assert.ok(ayam, "no ayam family");
  const s0 = refine(ayam, {});
  assert.equal(s0.axis, "prep", "cooking method is the first question for a non-dish");
  assert.ok(s0.options.some((o) => o.value === "goreng"));
  assert.ok(s0.options.some((o) => o.value === "bakar"));

  const s1 = refine(ayam, { prep: "goreng" });
  assert.equal(s1.axis, "cut", "after the method, the part");
  for (const part of ["paha", "dada", "sayap"]) {
    assert.ok(s1.options.some((o) => o.value === part), `no ${part} option under goreng`);
  }

  const s2 = refine(ayam, { prep: "goreng", cut: "paha" });
  assert.ok(s2.leaves.length >= 2 && s2.leaves.every((l) => l.parsed.facets.cut.includes("paha")));
});

test("the plain default is exactly the picks and nothing extra", () => {
  const ayam = idx.families.get("ayam")!;
  const goreng = refine(ayam, { prep: "goreng" });
  assert.ok(goreng.canonical, "no plain 'Ayam goreng' default");
  assert.equal(goreng.canonical!.food.name.toLowerCase(), "ayam goreng");
  // …and it must not be a branded or regional variant.
  assert.deepEqual(goreng.canonical!.parsed.rest, []);
});

test("a family never offers a combination that has no row", () => {
  // The credibility rule, as a test: no invented foods. Every option present at
  // any step must be backed by at least one real leaf carrying that value.
  for (const fam of fams) {
    walk(fam, (_picks, st) => {
      if (!st.axis) return;
      for (const o of st.options) {
        const backed = st.leaves.filter((l) =>
          o.value === NONE ? l.parsed.facets[st.axis!].length === 0 : l.parsed.facets[st.axis!].includes(o.value)
        ).length;
        assert.equal(backed, o.count, `${fam.base}/${st.axis}/${o.value}: count ${o.count} but ${backed} backing rows`);
        assert.ok(backed >= 1);
      }
    });
  }
});

test("exact-name duplicates collapse, and the curated row wins", () => {
  let dupes = 0;
  for (const f of fams) dupes += [...f.duplicates.values()].reduce((n, d) => n + d.length, 0);
  assert.ok(dupes > 0, "expected the catalogue's known duplicates to be collapsed");
  // Two rows of the same name must not both survive as separate leaves.
  for (const f of fams) {
    const keys = f.leaves.map((l) => l.key);
    assert.equal(new Set(keys).size, keys.length, `${f.base} still has duplicate leaves`);
  }
});

// ── predictor ──────────────────────────────────────────────────────────────

const noHistory = () => 0;

test("cold start: with no history the prior orders families, staples first", () => {
  const p = makePredictor({ affinity: noHistory });
  const top = fams
    .map((f) => ({ f, s: p.familyScore(f as never) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.f.base);
  // Not an exact list — a floor on sanity: the everyday staples must be near the top.
  for (const must of ["nasi", "ayam", "telur"]) assert.ok(top.includes(must), `${must} missing from ${top.join(",")}`);
});

test("habit takes over from the prior as evidence accumulates, with no switch", () => {
  const ayam = idx.families.get("ayam")!;
  const bakar = ayam.leaves.filter((l) => l.parsed.facets.prep.includes("bakar"));
  assert.ok(bakar.length > 0);
  const eatsBakar = (id: string) => (bakar.some((l) => l.food.id === id) ? 0.8 : 0);

  const cold = makePredictor({ affinity: noHistory });
  const warm = makePredictor({ affinity: eatsBakar });

  const first = (pr: typeof cold) => orderedStep(ayam, {}, pr).options[0].value;
  assert.equal(first(cold), "goreng", "prior alone: goreng is by far the biggest bucket");
  assert.equal(first(warm), "bakar", "a user who eats bakar should see bakar first");
});

test("'Lainnya' never wins on bucket size alone", () => {
  const p = makePredictor({ affinity: noHistory });
  for (const fam of fams.filter((f) => f.leaves.length >= 20)) {
    const st = orderedStep(fam, {}, p);
    if (!st.axis || st.options.length < 3) continue;
    assert.notEqual(st.options[0].value, NONE, `${fam.base}: the catch-all is the first option`);
  }
});

test("prediction only orders: it never changes which rows exist", () => {
  const ayam = idx.families.get("ayam")!;
  const raw = refine(ayam, { prep: "goreng" });
  const ordered = orderedStep(ayam, { prep: "goreng" }, makePredictor({ affinity: (id) => (id.length % 2) * 0.5 }));
  assert.deepEqual(
    new Set(ordered.leaves.map((l) => l.food.id)),
    new Set(raw.leaves.map((l) => l.food.id))
  );
  assert.deepEqual(new Set(ordered.options.map((o) => o.value)), new Set(raw.options.map((o) => o.value)));
});
