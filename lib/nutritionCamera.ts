export const LABEL_GUIDE = { x: 0.08, y: 0.1, padding: 0.025 };
export type LabelCrop = { x: number; y: number; width: number; height: number };

/** Map the visible guide through object-fit: cover, including a small edge margin. */
export function nutritionGuideCrop(
  sourceWidth: number,
  sourceHeight: number,
  viewWidth: number,
  viewHeight: number,
): LabelCrop {
  if (
    [sourceWidth, sourceHeight, viewWidth, viewHeight].some(
      (n) => !Number.isFinite(n) || n <= 0,
    )
  )
    throw new Error("Ukuran kamera belum tersedia.");
  const scale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
  const visibleWidth = viewWidth / scale;
  const visibleHeight = viewHeight / scale;
  const insetX = LABEL_GUIDE.x - LABEL_GUIDE.padding;
  const insetY = LABEL_GUIDE.y - LABEL_GUIDE.padding;
  return {
    x: (sourceWidth - visibleWidth) / 2 + visibleWidth * insetX,
    y: (sourceHeight - visibleHeight) / 2 + visibleHeight * insetY,
    width: visibleWidth * (1 - 2 * insetX),
    height: visibleHeight * (1 - 2 * insetY),
  };
}
