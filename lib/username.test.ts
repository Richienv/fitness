import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUsername, usernameError, isValidUsername, atHandle } from "./username.ts";

test("normalize strips @ and lowercases", () => {
  assert.equal(normalizeUsername("@Richie"), "richie");
  assert.equal(normalizeUsername("  RENITA  "), "renita");
  assert.equal(normalizeUsername("@@dobel"), "dobel");
});

test("case-insensitive: @Richie and @richie collapse to one handle", () => {
  assert.equal(normalizeUsername("@Richie"), normalizeUsername("@RICHIE"));
});

test("valid handles", () => {
  assert.ok(isValidUsername("richie"));
  assert.ok(isValidUsername("@renita_01"));
  assert.ok(isValidUsername("abc"));
});

test("length bounds", () => {
  assert.ok(usernameError("ab")); // too short
  assert.ok(usernameError("a".repeat(21))); // too long
  assert.equal(usernameError("a".repeat(20)), null);
});

test("charset + must start with a letter", () => {
  assert.ok(usernameError("has space"));
  assert.ok(usernameError("dash-not-ok"));
  assert.ok(usernameError("emoji🔥"));
  assert.ok(usernameError("1richie"));
  assert.ok(usernameError("_richie"));
});

test("reserved handles are rejected", () => {
  assert.ok(usernameError("admin"));
  assert.ok(usernameError("@Settings"));
  assert.ok(usernameError("r2fit"));
});

test("empty is rejected", () => {
  assert.ok(usernameError(""));
  assert.ok(usernameError("   "));
});

test("atHandle formats for display", () => {
  assert.equal(atHandle("richie"), "@richie");
  assert.equal(atHandle(null), "");
});
