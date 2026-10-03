import { test } from "node:test";
import assert from "node:assert/strict";
import {
  preprocessPixels,
  imageStatistics,
  automaticImageMethods,
  type PixelImage,
} from "./nutritionPreprocess.ts";
function image(values: number[], width = values.length): PixelImage {
  return {
    width,
    height: values.length / width,
    data: new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255])),
  };
}
test("original preserves pixels without mutating the source", () => {
  const src = image([20, 40, 100]);
  const copy = preprocessPixels(src, "original");
  assert.deepEqual(copy, src);
  copy.data[0] = 200;
  assert.equal(src.data[0], 20);
});
test("contrast expands faded text range while preserving dimensions", () => {
  const src = image([85, 90, 95, 100, 105, 110]);
  const before = imageStatistics(src),
    after = imageStatistics(preprocessPixels(src, "contrast"));
  assert.ok(after.high - after.low > before.high - before.low);
  assert.equal(preprocessPixels(src, "grayscale").data.length, src.data.length);
});
test("flat patches stay flat instead of manufacturing text", () => {
  const out = preprocessPixels(image([105, 105, 105]), "grayscale");
  assert.equal(new Set(out.data.filter((_, i) => i % 4 !== 3)).size, 1);
});
test("transparent pixels composite onto white", () => {
  const src = image([0, 0]);
  src.data[3] = src.data[7] = 0;
  assert.equal(imageStatistics(src).mean, 255);
  assert.deepEqual(
    [...preprocessPixels(src, "grayscale").data],
    [255, 255, 255, 255, 255, 255, 255, 255],
  );
});
test("grayscale has equal color channels and opaque alpha", () => {
  const src = image([100]);
  src.data.set([180, 70, 30, 255]);
  const out = preprocessPixels(src, "grayscale").data;
  assert.equal(out[0], out[1]);
  assert.equal(out[1], out[2]);
  assert.equal(out[3], 255);
});
test("denoising removes isolated noise and bounds sharpening", () => {
  const src = image([100, 100, 100, 100, 255, 100, 100, 100, 100], 3);
  const out = preprocessPixels(src, "clean", { sharpen: 3 });
  assert.ok(out.data[16] < 30);
  assert.ok(Math.abs(out.data[16] - out.data[0]) < 20);
});
test("adaptive threshold preserves dark strokes and produces binary output", () => {
  const src = image(
    Array.from({ length: 49 }, (_, i) => (i % 7 === 3 ? 20 : 220)),
    7,
  );
  const out = preprocessPixels(src, "threshold").data;
  assert.equal(out[3 * 4], 0);
  assert.equal(out[0], 255);
  assert.ok([...out].every((n) => n === 0 || n === 255));
});
test("auto rescue is limited to two non-destructive first choices", () => {
  assert.deepEqual(
    automaticImageMethods({ low: 10, high: 70, mean: 45, edge: 2 }),
    ["contrast", "grayscale"],
  );
  assert.deepEqual(
    automaticImageMethods({ low: 10, high: 240, mean: 130, edge: 25 }),
    ["clean", "grayscale"],
  );
});
test("invalid dimensions are rejected before allocating filters", () => {
  assert.throws(() =>
    preprocessPixels(
      { width: 0, height: 2, data: new Uint8ClampedArray(0) },
      "clean",
    ),
  );
  assert.throws(() =>
    preprocessPixels(
      { width: 2, height: 2, data: new Uint8ClampedArray(3) },
      "threshold",
    ),
  );
});
