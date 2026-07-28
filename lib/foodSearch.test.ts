import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  tokenize,
  editDistance,
  scoreToken,
  prepare,
  searchPrepared,
  searchFoods,
  type SearchableFood,
} from "./foodSearch.ts";

const CATALOGUE: SearchableFood[] = [
  { id: "1", name: "Ayam goreng", foodGroup: "Masakan Nusantara", popularity: 90 },
  { id: "2", name: "Ayam bakar", foodGroup: "Masakan Nusantara", popularity: 80 },
  { id: "3", name: "Ayam goreng tepung saus padang", foodGroup: "Masakan Nusantara", popularity: 10 },
  { id: "4", name: "Bayam rebus", foodGroup: "Sayur", popularity: 40 },
  { id: "5", name: "Nasi goreng", foodGroup: "Serealia", popularity: 95 },
  { id: "6", name: "Nasi putih", foodGroup: "Serealia", popularity: 100 },
  { id: "7", name: "Telur dadar", englishName: "Omelette", foodGroup: "Telur", popularity: 60 },
  { id: "8", name: "Daging sapi giling", englishName: "Minced beef", popularity: 50 },
  { id: "9", name: "Kopi susu gula aren", foodGroup: "Minuman", popularity: 70 },
  { id: "10", name: "Es teh manis", foodGroup: "Minuman", popularity: 65 },
];

const names = (q: string, opts = {}) => searchFoods(CATALOGUE, q, opts).map((f) => f.name);

test("normalize strips case, diacritics and punctuation", () => {
  assert.equal(normalize("Ayam Bakar"), "ayam bakar");
  assert.equal(normalize("Crème brûlée"), "creme brulee");
  assert.equal(normalize("Nasi  goreng!!"), "nasi goreng");
  assert.deepEqual(tokenize("  ayam   bakar "), ["ayam", "bakar"]);
});

test("an empty query returns nothing rather than everything", () => {
  assert.deepEqual(names(""), []);
  assert.deepEqual(names("   "), []);
});

test("a whole-word match outranks the same letters buried in another word", () => {
  // "Bayam" contains a-y-a-m but is not chicken.
  const out = names("ayam");
  assert.equal(out[0], "Ayam goreng");
  assert.ok(out.indexOf("Ayam bakar") < out.indexOf("Bayam rebus"));
});

test("typing more words NARROWS the results", () => {
  const one = names("ayam");
  const two = names("ayam bakar");
  assert.ok(two.length < one.length, `"ayam" ${one.length} → "ayam bakar" ${two.length}`);
  assert.deepEqual(two, ["Ayam bakar"]);
});

test("every token must match — this is AND, not OR", () => {
  // "nasi" matches two foods and "telur" one, but nothing is both.
  assert.deepEqual(names("nasi telur"), []);
});

test("the shorter name wins among equals", () => {
  const out = names("ayam goreng");
  assert.equal(out[0], "Ayam goreng");
  assert.ok(out.includes("Ayam goreng tepung saus padang"));
  assert.ok(
    out.indexOf("Ayam goreng") < out.indexOf("Ayam goreng tepung saus padang"),
    "extra unasked-for words should rank lower"
  );
});

test("a prefix finds the word", () => {
  assert.ok(names("gor").includes("Ayam goreng"));
  assert.ok(names("nas").includes("Nasi putih"));
});

test("typos are forgiven, proportionally to word length", () => {
  assert.ok(names("gorneg").includes("Ayam goreng"), "transposition");
  assert.ok(names("nasi gorng").includes("Nasi goreng"), "dropped letter");
  // Three letters or fewer get no budget — otherwise everything matches.
  assert.deepEqual(names("xyz"), []);
});

test("edit distance handles transposition and bails out early", () => {
  assert.equal(editDistance("goreng", "gorneg"), 1);
  assert.equal(editDistance("ayam", "ayam"), 0);
  assert.ok(editDistance("ayam", "kentang", 2) > 2, "far apart, over budget");
});

test("English names are searchable", () => {
  assert.ok(names("omelette").includes("Telur dadar"));
  assert.ok(names("minced beef").includes("Daging sapi giling"));
});

test("the Indonesian name outweighs the English one", () => {
  const t = prepare(CATALOGUE);
  const byName = searchPrepared(t, "telur")[0];
  assert.equal(byName.food.name, "Telur dadar");
});

test("aliases expand a token but score below the literal word", () => {
  const aliases = (t: string) => (t === "chicken" ? ["ayam"] : []);
  const out = names("chicken", { aliases });
  assert.ok(out.includes("Ayam goreng"), "alias should find it");

  const direct = searchPrepared(prepare(CATALOGUE), "ayam")[0].score;
  const viaAlias = searchPrepared(prepare(CATALOGUE), "chicken", { aliases })[0].score;
  assert.ok(viaAlias < direct, "a synonym is weaker evidence than the word typed");
});

test("the whole phrase beats scattered tokens", () => {
  const out = names("nasi goreng");
  assert.equal(out[0], "Nasi goreng");
});

test("popularity breaks ties but never overrides a better match", () => {
  // "Nasi putih" is the most popular food in the fixture, but a query for
  // goreng must not surface it at all.
  assert.ok(!names("goreng").includes("Nasi putih"));
  // Among two equally-good matches, the more popular one leads.
  const out = names("nasi");
  assert.equal(out[0], "Nasi putih");
});

test("a group name is searchable but weakly", () => {
  const out = names("minuman");
  assert.ok(out.includes("Kopi susu gula aren"));
  assert.ok(out.includes("Es teh manis"));
});

test("results are capped and stable", () => {
  const a = searchFoods(CATALOGUE, "a", { limit: 3 });
  assert.ok(a.length <= 3);
  const b = searchFoods(CATALOGUE, "a", { limit: 3 });
  assert.deepEqual(a.map((f) => f.id), b.map((f) => f.id));
});

test("ranking 2000 foods stays instant", () => {
  const big: SearchableFood[] = [];
  for (let i = 0; i < 2000; i++) {
    big.push({ id: `f${i}`, name: `Makanan nomor ${i} goreng`, popularity: i % 100 });
  }
  const p = prepare(big);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) searchPrepared(p, "goreng nomor");
  const per = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  // A keystroke budget. Well under a frame at 60fps.
  assert.ok(per < 16, `search took ${per.toFixed(2)}ms per keystroke over 2000 foods`);
});

test("scoreToken orders its tiers the way ranking depends on", () => {
  assert.ok(scoreToken("ayam", "ayam") > scoreToken("ayam", "ayam goreng"));
  assert.ok(scoreToken("ayam", "ayam goreng") > scoreToken("ayam", "goreng ayam"));
  assert.ok(scoreToken("ayam", "goreng ayam") > scoreToken("aya", "goreng ayam"));
  assert.ok(scoreToken("aya", "goreng ayam") > scoreToken("yam", "bayam"));
  assert.equal(scoreToken("zzz", "ayam goreng"), 0);
});
