// Behavioural tests for the in-memory food search engine — the typo-tolerant,
// bilingual, TikTok-grade upgrade (docs/enhanced-search-prompt.md). No DB.
//
//   node --experimental-strip-types --test lib/foodSearchEngine.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FoodSearchIndex,
  boundedEditDistance,
  normalizeQuery,
  tokenSynonyms,
  tokenize,
  type FoodDoc,
} from "./foodSearchEngine.ts";

function doc(partial: Partial<FoodDoc> & { name: string }): FoodDoc {
  return {
    id: partial.name,
    sourceCode: `T:${partial.name}`,
    nameEn: null,
    state: null,
    foodGroup: null,
    energy_kcal: 100,
    protein_g: 10,
    fat_g: 5,
    carb_g: 5,
    searchText: "",
    popularity: 0,
    ...partial,
  };
}

const CATALOGUE: FoodDoc[] = [
  doc({
    name: "Daging sapi cincang",
    nameEn: "Minced beef",
    foodGroup: "Daging",
    popularity: 60,
  }),
  doc({
    name: "Daging sapi has dalam",
    nameEn: "Beef tenderloin",
    foodGroup: "Daging",
    popularity: 50,
  }),
  doc({ name: "Ayam goreng", nameEn: "Fried chicken", foodGroup: "Daging", popularity: 70 }),
  doc({ name: "Nasi goreng", nameEn: "Fried rice", foodGroup: "Serealia", popularity: 80 }),
  doc({ name: "Nasi putih", nameEn: "White rice", foodGroup: "Serealia", popularity: 90 }),
  doc({ name: "Tempe goreng", foodGroup: "Kacang", popularity: 40 }),
  doc({ name: "Bayam rebus", nameEn: "Boiled spinach", foodGroup: "Sayur", popularity: 30 }),
  doc({ name: "Siomay ikan", foodGroup: "Ikan dsb", searchText: "siomay ikan somay siomai" }),
];

const index = new FoodSearchIndex(CATALOGUE);

// ─── Primitives ──────────────────────────────────────────────────────────────

test("normalizeQuery lowercases and strips diacritics", () => {
  assert.equal(normalizeQuery("  Sáté Ayam "), "sate ayam");
});

test("tokenize splits on punctuation and drops 1-letter fragments", () => {
  assert.deepEqual(tokenize("gado-gado, 1 porsi"), ["gado", "gado", "porsi"]);
});

test("boundedEditDistance counts a transposition as one edit", () => {
  assert.equal(boundedEditDistance("dagnig", "daging", 2), 1);
  assert.equal(boundedEditDistance("dagin", "daging", 2), 1);
  assert.equal(boundedEditDistance("ayam", "udang", 2), 3); // capped at max+1
});

test("token synonyms are bidirectional (EN↔ID)", () => {
  assert.ok(tokenSynonyms("beef").includes("sapi"));
  assert.ok(tokenSynonyms("sapi").includes("beef"));
  assert.ok(tokenSynonyms("minced").includes("cincang"));
  assert.ok(tokenSynonyms("cincang").includes("minced"));
});

// ─── The user's exact scenarios ──────────────────────────────────────────────

test('typo: "dagin cincang" still finds "Daging sapi cincang"', () => {
  const hits = index.search("dagin cincang");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].name, "Daging sapi cincang");
});

test('bilingual: "beef minced" finds "Daging sapi cincang" (order-free)', () => {
  for (const q of ["beef minced", "minced beef", "sapi cincang"]) {
    const hits = index.search(q);
    assert.ok(hits.length > 0, `no hits for "${q}"`);
    assert.equal(hits[0].name, "Daging sapi cincang", `wrong top hit for "${q}"`);
  }
});

test('typo + translation compose: "beff minced" still lands the row', () => {
  const hits = index.search("beff minced");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].name, "Daging sapi cincang");
});

// ─── Ranking behaviours ──────────────────────────────────────────────────────

test("exact name match outranks everything", () => {
  const hits = index.search("nasi goreng");
  assert.equal(hits[0].name, "Nasi goreng");
});

test("prefix works without correction", () => {
  const hits = index.search("cinc");
  assert.ok(hits.some((h) => h.name === "Daging sapi cincang"));
});

test("popularity breaks near-ties", () => {
  const hits = index.search("nasi");
  assert.equal(hits[0].name, "Nasi putih"); // popularity 90 > 80
});

test("clean-typed words outrank fuzzy-corrected ones", () => {
  const clean = index.search("daging cincang")[0];
  const typo = index.search("dagin cincang")[0];
  assert.equal(clean.name, typo.name);
  assert.ok(clean.score > typo.score);
});

test("searchText recall bag is matched (somay → Siomay ikan)", () => {
  const hits = index.search("somay");
  assert.ok(hits.some((h) => h.name === "Siomay ikan"));
});

test("relaxation: partial coverage still returns rather than an empty list", () => {
  // "bayam zzzzqqq" — second word matches nothing anywhere.
  const hits = index.search("bayam zzzzqqq");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].name, "Bayam rebus");
});

test("gibberish that matches nothing returns empty, not noise", () => {
  assert.deepEqual(index.search("xqzwvj"), []);
});

// ─── Group filtering / browse ────────────────────────────────────────────────

test("group filter restricts search results", () => {
  const hits = index.search("goreng", { groups: ["Serealia"] });
  assert.ok(hits.length > 0);
  assert.ok(hits.every((h) => h.foodGroup === "Serealia"));
});

test("browse ranks by popularity prior", () => {
  const rows = index.browse(["Serealia"], 10);
  assert.equal(rows[0].name, "Nasi putih");
  assert.equal(rows.length, 2);
});
