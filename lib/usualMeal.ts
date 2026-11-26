// "Makan biasa": the meal the user actually eats in a slot, so Home can log
// it in one tap. Supports both classic count mode and recency-weighted mode
// so foods eaten yesterday / the last few days outrank distant past logs.
//
// Pure: no storage, no clock. lib/usualMealData.ts reads the store.
import type { MealType } from "./presets";

export type SlotMeal<T> = { date: string; mealType: MealType; items: T[] };
export type UsualMeal<T> = {
  /** Items exactly as logged on `lastDate`. */
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
  { windowDays = 28, minDays = 3, recencyWeighted = false } = {},
): UsualMeal<T> | null {
  const from = offset(today, -windowDays);
  const todayMs = Date.parse(today + "T12:00:00Z");
  // One meal per day: rows for the same day and slot are merged.
  const byDate = new Map<string, T[]>();
  for (const m of meals) {
    if (m.mealType !== slot || m.date >= today || m.date < from) continue;
    if (!m.items?.length) continue;
    byDate.set(m.date, [...(byDate.get(m.date) ?? []), ...m.items]);
  }
  const groups = new Map<
    string,
    { days: number; score: number; lastDate: string; items: T[] }
  >();
  for (const [date, items] of byDate) {
    const signature = [...new Set(items.map(keyOf))].sort().join("|");
    const ageDays = Math.max(1, Math.round((todayMs - Date.parse(date + "T12:00:00Z")) / DAY_MS));
    const dayScore =
      Math.pow(2, -ageDays / 3.5) * (ageDays <= 1 ? 1.5 : ageDays <= 3 ? 1.2 : 1.0);
    const g = groups.get(signature);
    if (!g) {
      groups.set(signature, { days: 1, score: dayScore, lastDate: date, items });
    } else {
      g.days++;
      g.score += dayScore;
      if (date > g.lastDate) {
        g.lastDate = date;
        g.items = items;
      }
    }
  }
  let best: (UsualMeal<T> & { score: number }) | null = null;
  for (const g of groups.values()) {
    if (g.days < minDays) continue;
    const better = recencyWeighted
      ? !best ||
        g.score > best.score + 1e-6 ||
        (Math.abs(g.score - best.score) <= 1e-6 && g.lastDate > best.lastDate)
      : !best ||
        g.days > best.days ||
        (g.days === best.days && g.lastDate > best.lastDate);
    if (better) {
      best = { items: g.items, days: g.days, lastDate: g.lastDate, score: g.score };
    }
  }
  return best ? { items: best.items, days: best.days, lastDate: best.lastDate } : null;
}
