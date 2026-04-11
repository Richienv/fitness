export const TARGETS = {
  gymDay: { kcal: 2200, protein: 155, carbs: 150, fat: 70 },
  restDay: { kcal: 1700, protein: 155, carbs: 120, fat: 70 },
};

export const START_DATE = "2026-01-06";

export function weekNumber(now = new Date()): number {
  const start = new Date(START_DATE);
  const ms = now.getTime() - start.getTime();
  const week = Math.floor(ms / (1000 * 60 * 60 * 24 * 7)) + 1;
  return Math.max(1, Math.min(12, week));
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
