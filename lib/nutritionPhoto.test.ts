import test from "node:test";
import assert from "node:assert/strict";
import {
  FULL_PHOTO,
  movePhotoCrop,
  photoCropPixels,
} from "./nutritionPhoto.ts";
test("full-photo acquisition preserves all table edges instead of enforcing a portrait guide", () => {
  assert.deepEqual(photoCropPixels(FULL_PHOTO, 1920, 1080), {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(
    photoCropPixels({ x: 0.1, y: 0.2, width: 0.8, height: 0.6 }, 2000, 1000),
    { x: 200, y: 200, width: 1600, height: 600 },
  );
});
test("touch crop clamps movement and cannot invert or escape the source", () => {
  const crop = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
  assert.equal(movePhotoCrop(crop, 1, 1, "move").x, 0.5);
  assert.equal(movePhotoCrop(crop, -1, -1, "move").y, 0);
  for (const handle of ["nw", "ne", "sw", "se"])
    for (const delta of [-2, 2]) {
      const result = movePhotoCrop(crop, delta, delta, handle);
      assert(
        result.x >= 0 &&
          result.y >= 0 &&
          result.width >= 0.119 &&
          result.height >= 0.119,
      );
      assert(
        result.x + result.width <= 1.0001 && result.y + result.height <= 1.0001,
      );
    }
  assert.throws(() => photoCropPixels(FULL_PHOTO, 0, 0));
});
