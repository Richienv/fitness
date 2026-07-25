import { test } from "node:test";
import assert from "node:assert/strict";
import { cuisineOf } from "./cuisine.ts";

test("padang dishes win over generic indonesian keywords", () => {
  assert.equal(cuisineOf("Rendang Sapi"), "padang");
  assert.equal(cuisineOf("Sate Padang"), "padang"); // not generic "sate"
  assert.equal(cuisineOf("Gulai Ayam"), "padang");
});

test("japanese", () => {
  assert.equal(cuisineOf("Chicken Katsu"), "japanese");
  assert.equal(cuisineOf("Salmon Sushi"), "japanese");
  assert.equal(cuisineOf("Ramen Miso"), "japanese");
});

test("korean", () => {
  assert.equal(cuisineOf("Kimchi Fried Rice"), "korean");
  assert.equal(cuisineOf("Tteokbokki"), "korean");
});

test("chinese", () => {
  assert.equal(cuisineOf("Capcay Goreng"), "chinese");
  assert.equal(cuisineOf("Siomay"), "chinese");
  assert.equal(cuisineOf("Mie Ayam"), "chinese");
});

test("western", () => {
  assert.equal(cuisineOf("Beef Burger"), "western");
  assert.equal(cuisineOf("Spaghetti Bolognese"), "western");
  assert.equal(cuisineOf("Brownies"), "western");
});

test("indonesian generic", () => {
  assert.equal(cuisineOf("Nasi Goreng"), "indonesian");
  assert.equal(cuisineOf("Sate Ayam"), "indonesian"); // plain sate
  assert.equal(cuisineOf("Soto Ayam"), "indonesian");
});

test("raw ingredients fall to other", () => {
  assert.equal(cuisineOf("Ayam, daging, mentah"), "other");
  assert.equal(cuisineOf("Beras giling"), "other");
});
