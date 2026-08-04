import test from "node:test";
import assert from "node:assert/strict";
import { affixVariants, collapseReduplication, indonesianAliases, spellingVariants } from "./indonesian.ts";

test("passive di- is stripped: digoreng is goreng", () => {
  assert.ok(affixVariants("digoreng").includes("goreng"));
  assert.ok(affixVariants("dibakar").includes("bakar"));
});

test("the -nya clitic is stripped", () => {
  assert.ok(affixVariants("ayamnya").includes("ayam"));
});

test("short words are left alone — there is no affix to find", () => {
  assert.deepEqual(affixVariants("ayam"), []);
  assert.deepEqual(affixVariants("es"), []);
  assert.deepEqual(affixVariants("nasi"), []);
});

test("stripping never leaves a stub", () => {
  // "diet" starts with "di" but "et" is not a word — the 4-char floor stops it.
  assert.ok(!affixVariants("diet").includes("et"));
  for (const v of affixVariants("dimsum")) assert.ok(v.length >= 4, v);
});

test("-an is NOT stripped, because the suffix is often the dish", () => {
  // gorengan (fritters) is a different food from goreng (fried). Over-stemming
  // a two-word document destroys the only signal it has.
  assert.ok(!affixVariants("gorengan").includes("goreng"));
  assert.ok(!affixVariants("makanan").includes("makan"));
});

test("adjacent reduplication collapses to one term", () => {
  assert.deepEqual(collapseReduplication(["gado", "gado"]), ["gado"]);
  assert.deepEqual(collapseReduplication(["cumi", "cumi", "goreng"]), ["cumi", "goreng"]);
});

test("a non-repeated pair is untouched", () => {
  assert.deepEqual(collapseReduplication(["nasi", "goreng"]), ["nasi", "goreng"]);
  assert.deepEqual(collapseReduplication(["ayam", "bakar", "ayam"]), ["ayam", "bakar", "ayam"]);
});

test("spelling variants that edit distance cannot reach", () => {
  // 4-letter words get a typo budget of 1, and these differ by more or by length.
  // These live in spellingVariants, NOT the synonym table: they are one word
  // with two orthographies, so the ranker gives them a shared IDF and no
  // penalty. Routed through indonesianAliases they would be charged the
  // synonym discount and keep separate document frequencies, which is exactly
  // what made "telor" return Kerak Telor ahead of Telur.
  assert.ok(spellingVariants("cabe").includes("cabai"));
  assert.ok(spellingVariants("trasi").includes("terasi"));
  assert.ok(spellingVariants("toge").includes("tauge"));
  assert.ok(spellingVariants("telor").includes("telur"));
  assert.ok(spellingVariants("telur").includes("telor"));
});

test("spellings and synonyms stay in separate tables", () => {
  // A spelling variant must never leak into the synonym path, or it gets the
  // 0.8 penalty and its own IDF again.
  for (const w of ["telor", "telur", "cabe", "cabai", "mie", "mi", "baso", "bakso"]) {
    for (const v of spellingVariants(w)) {
      assert.ok(
        !indonesianAliases(w).includes(v),
        `${w} -> ${v} is a spelling variant but also appears as a synonym`
      );
    }
  }
  // Cross-language pairs are the opposite: synonyms, never spellings.
  assert.deepEqual(spellingVariants("chicken"), []);
  assert.ok(indonesianAliases("telur").includes("egg"));
});

test("English maps to Indonesian and back", () => {
  assert.ok(indonesianAliases("chicken").includes("ayam"));
  assert.ok(indonesianAliases("ayam").includes("chicken"));
  assert.ok(indonesianAliases("fried").includes("goreng"));
  assert.ok(indonesianAliases("rice").includes("nasi"));
});

test("affix stripping composes with the alias table", () => {
  // digoreng -> goreng -> fried, in one lookup.
  assert.ok(indonesianAliases("digoreng").includes("goreng"));
  assert.ok(indonesianAliases("digoreng").includes("fried"));
});

test("a token is never its own alias", () => {
  for (const t of ["ayam", "goreng", "digoreng", "cabe", "nasi"]) {
    assert.ok(!indonesianAliases(t).includes(t), t);
  }
});

test("an unknown word expands to nothing rather than guessing", () => {
  assert.deepEqual(indonesianAliases("zzzz"), []);
});
