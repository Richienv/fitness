export const TARGETS = {
  gymDay: { kcal: 2200, protein: 155, carbs: 150, fat: 70 },
  restDay: { kcal: 1700, protein: 155, carbs: 120, fat: 70 },
};

// Program start: Monday, April 7, 2026 (week 1 of the 12-week block).
export const START_DATE = "2026-04-07";

export function weekNumber(now = new Date()): number {
  const start = new Date(START_DATE);
  const ms = now.getTime() - start.getTime();
  const week = Math.ceil((ms + 1) / (1000 * 60 * 60 * 24 * 7));
  return Math.max(1, Math.min(12, week));
}

// All date keys are computed in China Standard Time (Asia/Shanghai, UTC+8).
// Richie lives in Hangzhou — using device/UTC time rolled days over too
// early and left the dashboard showing yesterday's data at 00:00 local.
const CST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayKey(now: Date = new Date()): string {
  // en-CA yields "YYYY-MM-DD"
  return CST_FORMATTER.format(now);
}

export function cstDateParts(now: Date = new Date()): { y: number; m: number; d: number } {
  const [y, m, d] = todayKey(now).split("-").map(Number);
  return { y, m, d };
}
