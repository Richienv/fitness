// "Makan biasa": the meal Richie actually eats in a slot, so Home can log it
// in one tap.
//
// The rule is deliberately plain and readable, because one tap writes a real
// record: the same set of foods in this slot on at least 3 different days in
// the last 28 days (today excluded). The most frequent set wins; a tie goes to
// the one eaten most recently. Portions come from the most recent time he ate
// it, so the default is his own portion, not "1 porsi".
//
// Pure: no storage, no clock. lib/usualMealData.ts reads the store.
import type { MealType } from "./presets";

export type SlotMeal<T> = { date: string; mealType: MealType; items: T[] };
export type UsualMeal<T> = {
  /** Items exactly as he logged them on `lastDate`. */
  items: T[];
  /** Distinct days this meal was eaten in the window. */
  days: number;
  lastDate: string;
};

const DAY_MS = 86400000;
const offset = (date: string, days: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

export function usualMeal<T>(
  meals: SlotMeal<T>[],
  slot: MealType,
  today: string,
  keyOf: (item: T) => string,
  { windowDays = 28, minDays = 3 } = {},
): UsualMeal<T> | null {
  const from = offset(today, -windowDays);
  // One meal per day: rows for the same day and slot are merged.
  const byDate = new Map<string, T[]>();
  for (const m of meals) {
    if (m.mealType !== slot || m.date >= today || m.date < from) continue;
    if (!m.items?.length) continue;
    byDate.set(m.date, [...(byDate.get(m.date) ?? []), ...m.items]);
  }
  const groups = new Map<string, { days: number; lastDate: string; items: T[] }>();
  for (const [date, items] of byDate) {
    const signature = [...new Set(items.map(keyOf))].sort().join("|");
    const g = groups.get(signature);
    if (!g) groups.set(signature, { days: 1, lastDate: date, items });
    else {
      g.days++;
      if (date > g.lastDate) {
        g.lastDate = date;
        g.items = items;
      }
    }
  }
  let best: UsualMeal<T> | null = null;
  for (const g of groups.values()) {
    if (g.days < minDays) continue;
    if (
      !best ||
      g.days > best.days ||
      (g.days === best.days && g.lastDate > best.lastDate)
    )
      best = { items: g.items, days: g.days, lastDate: g.lastDate };
  }
  return best;
}
