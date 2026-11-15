import type { LabelCrop } from "./nutritionCamera";
export type PhotoCrop = { x: number; y: number; width: number; height: number };
export const FULL_PHOTO: PhotoCrop = { x: 0, y: 0, width: 1, height: 1 };
export function photoCropPixels(
  crop: PhotoCrop,
  width: number,
  height: number,
): LabelCrop {
  if (
    ![width, height, crop.x, crop.y, crop.width, crop.height].every(
      Number.isFinite,
    ) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Ukuran foto tidak valid.");
  const x = Math.max(0, Math.min(0.98, crop.x));
  const y = Math.max(0, Math.min(0.98, crop.y));
  return {
    x: x * width,
    y: y * height,
    width: Math.max(0.02, Math.min(1 - x, crop.width)) * width,
    height: Math.max(0.02, Math.min(1 - y, crop.height)) * height,
  };
}
export function movePhotoCrop(
  crop: PhotoCrop,
  dx: number,
  dy: number,
  handle: string,
): PhotoCrop {
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));
  if (handle === "move")
    return {
      ...crop,
      x: clamp(crop.x + dx, 0, 1 - crop.width),
      y: clamp(crop.y + dy, 0, 1 - crop.height),
    };
  let left = crop.x,
    top = crop.y,
    right = left + crop.width,
    bottom = top + crop.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - 0.12);
  if (handle.includes("e")) right = clamp(right + dx, left + 0.12, 1);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - 0.12);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + 0.12, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
