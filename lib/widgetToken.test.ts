import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AUTH_SECRET = "test-secret-for-token-tests-only";
const { signHealthToken, signWidgetToken, verifyHealthToken, verifyWidgetToken } =
  await import("./widgetToken.ts");

test("a health token sends health data and nothing else", () => {
  const h = signHealthToken("user-1");
  assert.equal(verifyHealthToken(h), "user-1");
  assert.equal(verifyWidgetToken(h), null);
});

test("a widget token stays read-only", () => {
  const w = signWidgetToken("user-1");
  assert.equal(verifyWidgetToken(w), "user-1");
  assert.equal(verifyHealthToken(w), null);
});

test("tampered or expired tokens are refused", () => {
  const h = signHealthToken("user-1");
  const [payload, sig] = h.split(".");
  assert.equal(verifyHealthToken(`${payload}x.${sig}`), null);
  assert.equal(verifyHealthToken(signHealthToken("user-1", -1)), null);
  assert.equal(verifyHealthToken(""), null);
});
