import test from "node:test";
import assert from "node:assert/strict";
import { nutritionGuideCrop } from "./nutritionCamera.ts";
test("landscape video maps the portrait guide into the central source crop", () => {
  const c = nutritionGuideCrop(1920, 1080, 400, 500);
  assert.ok(Math.abs(c.width - 768.96) < 0.001);
  assert.ok(Math.abs(c.height - 918) < 0.001);
  assert.ok(Math.abs(c.x + c.width / 2 - 960) < 0.001);
  assert.ok(Math.abs(c.y + c.height / 2 - 540) < 0.001);
});
test("portrait video crops top and bottom rather than unreadable side bars", () => {
  const c = nutritionGuideCrop(1080, 1920, 320, 400);
  assert.ok(Math.abs(c.width - 961.2) < 0.001);
  assert.ok(Math.abs(c.height - 1147.5) < 0.001);
  assert.ok(
    c.x >= 0 && c.y >= 0 && c.x + c.width <= 1080 && c.y + c.height <= 1920,
  );
});
test("a camera without dimensions cannot fabricate a guide crop", () => {
  assert.throws(() => nutritionGuideCrop(0, 1080, 400, 500));
});
