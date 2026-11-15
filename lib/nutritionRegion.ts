import type { LabelOcrItem } from "./nutritionLabel";
import type { LabelCrop } from "./nutritionCamera";

/** Locate the table from printed nutrient names, never from expected values. */
export function nutritionTableRegion(
  items: LabelOcrItem[],
  width: number,
  height: number,
): LabelCrop | null {
  const cells = items
    .filter((i) => i.score >= 0.5 && i.poly.length === 4)
    .map((i) => ({
      text: i.text.replace(/\s/g, ""),
      left: Math.min(...i.poly.map((p) => p[0])),
      right: Math.max(...i.poly.map((p) => p[0])),
      top: Math.min(...i.poly.map((p) => p[1])),
      bottom: Math.max(...i.poly.map((p) => p[1])),
    }));
  const nutrients = cells.filter((c) =>
    /^(?:total)?(?:energ[iy/l]|calories|protein|fat|carbohydrate|sugars?|sodium|lemak|karbohidrat|gula|natrium|garam|能量|[熱热]量|蛋白[質质]|脂肪|碳水|[钠鈉])/i.test(
      c.text,
    ),
  );
  if (nutrients.length < 2) return null;
  let left = Math.min(...nutrients.map((c) => c.left)),
    right = Math.max(...nutrients.map((c) => c.right));
  let top = Math.min(...nutrients.map((c) => c.top)),
    bottom = Math.max(...nutrients.map((c) => c.bottom));
  const rowHeight = nutrients
    .map((c) => c.bottom - c.top)
    .sort((a, b) => a - b)[Math.floor(nutrients.length / 2)];
  const headers = cells.filter(
    (c) =>
      /^(?:informasi|nutrition|营养|營養|perserving|amountperserving|jumlahpersajian|takaran|servingsize|每)/i.test(
        c.text,
      ) &&
      c.bottom <= top + rowHeight &&
      c.bottom >= top - height * 0.25 &&
      c.left < right &&
      c.right > left,
  );
  if (headers.length) {
    top = Math.min(top, ...headers.map((c) => c.top));
    left = Math.min(left, ...headers.map((c) => c.left));
    right = Math.max(right, ...headers.map((c) => c.right));
  } else top -= rowHeight * 3;
  // Include separated quantity and percent cells, bounded by the table heading.
  const limit = Math.min(
    width,
    Math.max(right + rowHeight * 2, left + (right - left) * 1.5),
  );
  const quantities = cells.filter(
    (c) =>
      c.top >= top &&
      c.bottom <= bottom + rowHeight * 1.5 &&
      c.left >= left &&
      c.right <= limit &&
      /^\d.*(?:%|g|克|卡|焦|kkal|kcal|kj|ml)$/i.test(c.text),
  );
  if (quantities.length)
    right = Math.max(right, ...quantities.map((c) => c.right));
  const pad = rowHeight * 0.75;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width, right + pad);
  bottom = Math.min(height, bottom + pad);
  if ((right - left) * (bottom - top) > width * height * 0.8) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function useLatinNutritionReader(text: string) {
  return (
    (
      text.match(
        /protein|lemak|karbohidrat|calories|total\s*fat|carbohydrate/gi,
      ) ?? []
    ).length >= 2 && !/蛋白[质質]|碳水|脂肪/.test(text)
  );
}
