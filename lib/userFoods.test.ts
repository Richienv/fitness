import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateKcalFromMacros } from "./userFoods.ts";

test("estimateKcalFromMacros computes 4/9/4 calories cleanly for quick food entry", () => {
  assert.equal(estimateKcalFromMacros(25, 10, 30), 25 * 4 + 10 * 9 + 30 * 4);
  assert.equal(estimateKcalFromMacros(0, 0, 0), 0);
  assert.equal(estimateKcalFromMacros(-5, Number.NaN, 12.5), 50);
});
