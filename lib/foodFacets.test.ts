import test from "node:test";
import assert from "node:assert/strict";
import { parseFood, nameKey } from "./foodFacets.ts";

// Golden parses. Each case is a real catalogue name, and the reason it is here
// is in the comment — most of them are a bug that actually happened.

test("a base with method, style and a two-word cut", () => {
  const p = parseFood("Ayam Goreng Crispy Paha Atas");
  assert.equal(p.base, "ayam");
  assert.deepEqual(p.facets.prep, ["goreng"]);
  assert.deepEqual(p.facets.style, ["crispy"]);
  // "paha atas" is ONE cut. Matched word-by-word it would be "paha" plus a
  // stray "atas" left over in `rest`.
  assert.deepEqual(p.facets.cut, ["paha atas"]);
  assert.deepEqual(p.rest, []);
});

test("the base is chosen BEFORE facets, so a facet word cannot swallow it", () => {
  // The regression: once "ayam" joined the filling vocabulary, facets were read
  // first and "Ayam Goreng" consumed its own base — nothing left, whole family gone.
  const p = parseFood("Ayam Goreng");
  assert.equal(p.base, "ayam");
  assert.notEqual(p.baseKind, "unknown");
  assert.deepEqual(p.facets.prep, ["goreng"]);
});

test("in a compound dish the head is the dish and the next word is the FILLING", () => {
  const p = parseFood("Soto ayam");
  assert.equal(p.base, "soto");
  assert.equal(p.baseKind, "dish");
  assert.deepEqual(p.facets.isi, ["ayam"]);
});

test("a part named first does not become the base", () => {
  for (const [name, cut] of [["Dada Ayam Rebus", "dada"], ["Paha Ayam Goreng", "paha"], ["Hati Ayam Rebus", "hati"]]) {
    const p = parseFood(name);
    assert.equal(p.base, "ayam", name);
    assert.deepEqual(p.facets.cut, [cut], name);
  }
});

test("English names land in the SAME family as their Indonesian rows", () => {
  const breast = parseFood("Chicken breast");
  assert.equal(breast.base, "ayam");
  assert.deepEqual(breast.facets.cut, ["dada"]);
  const fried = parseFood("Fried rice");
  assert.equal(fried.base, "nasi");
  assert.deepEqual(fried.facets.prep, ["goreng"]);
});

test("ambiguous words are never facets by themselves", () => {
  // "kuning" is yellow noodles in "Mie kuning" and egg yolk in "Kuning telur".
  // Read as a facet it would put the yolk in the noodle family's colour axis.
  const noodle = parseFood("Mie kuning");
  assert.equal(noodle.base, "mie");
  assert.deepEqual(noodle.rest, ["kuning"]);
  const white = parseFood("Putih telur rebus");
  assert.equal(white.base, "telur");
  assert.deepEqual(white.facets.prep, ["rebus"]);
});

test("a dish keeps its method as a facet: Nasi goreng is a nasi, fried", () => {
  const p = parseFood("Nasi goreng");
  assert.equal(p.base, "nasi");
  assert.deepEqual(p.facets.prep, ["goreng"]);
});

test("pre-1972 and variant spellings share a base", () => {
  assert.equal(parseFood("Telor dadar").base, "telur");
  assert.equal(parseFood("Telur dadar").base, "telur");
});

test("it is total: odd input never throws", () => {
  for (const s of ["", "   ", "---", "123", "()", "a", "Ñandú ñam", "AYAM!!!", "ayam ayam ayam"]) {
    assert.doesNotThrow(() => parseFood(s), JSON.stringify(s));
  }
  assert.equal(parseFood("").base, "");
});

test("nameKey collapses the 'estimasi' suffix so duplicates meet", () => {
  assert.equal(nameKey("Ayam Pop Padang (estimasi)"), nameKey("Ayam pop padang"));
});
