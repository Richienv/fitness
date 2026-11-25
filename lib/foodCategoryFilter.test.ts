import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOOD_CATEGORIES,
  matchesFoodCategory,
  searchCatalogueWithAliases,
  suggestRelaxedFoods,
} from "./foodCategoryFilter.ts";
import { prepare, type SearchableFood } from "./foodSearch.ts";

const SAMPLE: (SearchableFood & { zh?: string; group?: string })[] = [
  { id: "pork-1", name: "Daging Babi Has Dalam (Tenderloin)", foodGroup: "Daging" },
  { id: "pork-2", name: "Babi Samcan Panggang", foodGroup: "Daging", cuisine: "chinese" },
  { id: "legume-1", name: "Tempe kacang babi", foodGroup: "Kacang" },
  { id: "chicken-1", name: "Dada Ayam Rebus", foodGroup: "Daging" },
  { id: "egg-1", name: "Telur Ceplok", foodGroup: "Telur" },
  { id: "fish-1", name: "Ikan Salmon Panggang", foodGroup: "Ikan dsb" },
  { id: "rice-1", name: "Nasi Putih", foodGroup: "Serealia" },
  { id: "veg-1", name: "Tumis Brokoli", foodGroup: "Sayur" },
  { id: "drink-1", name: "Teh Susu Melati", foodGroup: "Minuman" },
  { id: "cn-1", name: "Tumis Tomat Telur / 番茄炒蛋", foodGroup: "Makanan Utama", cuisine: "chinese" },
  { id: "bp-char-siu", name: "Char Siu / Babi Panggang Merah", foodGroup: "Masakan Nusantara", aliases: "charsiu" },
];

test("FOOD_CATEGORIES includes all expected filter pills and classifies cleanly", () => {
  assert.equal(FOOD_CATEGORIES.length, 8);
  assert.equal(matchesFoodCategory(SAMPLE[0], "meat_pork"), true);
  // "Tempe kacang babi" is a legume, never meat_pork
  assert.equal(matchesFoodCategory(SAMPLE[2], "meat_pork"), false);
  // Chicken shouldn't bleed into meat_pork
  assert.equal(matchesFoodCategory(SAMPLE[3], "meat_pork"), false);
  assert.equal(matchesFoodCategory(SAMPLE[3], "poultry_egg"), true);
  assert.equal(matchesFoodCategory(SAMPLE[4], "poultry_egg"), true);
  assert.equal(matchesFoodCategory(SAMPLE[5], "seafood"), true);
  assert.equal(matchesFoodCategory(SAMPLE[6], "rice_noodle"), true);
  assert.equal(matchesFoodCategory(SAMPLE[7], "veg_fruit"), true);
  assert.equal(matchesFoodCategory(SAMPLE[8], "drinks"), true);
  assert.equal(matchesFoodCategory(SAMPLE[9], "chinese"), true);
  assert.equal(matchesFoodCategory(SAMPLE[1], "chinese"), true);
});

test("searchCatalogueWithAliases and suggestRelaxedFoods handle aliases and zero-hit fallback", () => {
  const prep = prepare(SAMPLE);

  const charsiuHits = searchCatalogueWithAliases(prep, "charsiu");
  assert.ok(charsiuHits.some((f) => f.id === "bp-char-siu"));

  const suggestions = suggestRelaxedFoods(prep, "salmon bakar spesial xoxo");
  assert.ok(suggestions.some((f) => f.id === "fish-1"));

  const typoSuggestions = suggestRelaxedFoods(prep, "salmmo");
  assert.ok(typoSuggestions.some((f) => f.id === "fish-1"));
});
