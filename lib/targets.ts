import { DEFAULT_SETTINGS, getSettings, type MacroTarget } from "./settings";

export type { MacroTarget };

// Backwards-compatible `TARGETS.gymDay` / `TARGETS.restDay` — now backed by
// the user settings store. Getters fire on every access so edits made in the
// settings page take effect across the whole app without any prop threading.
export const TARGETS = {
  get gymDay(): MacroTarget {
    if (typeof window === "undefined") return DEFAULT_SETTINGS.targets.gymDay;
    return getSettings().targets.gymDay;
  },
  get restDay(): MacroTarget {
    if (typeof window === "undefined") return DEFAULT_SETTINGS.targets.restDay;
    return getSettings().targets.restDay;
  },
};

export function getStartDate(): string {
  if (typeof window === "undefined") return DEFAULT_SETTINGS.startDate;
  return getSettings().startDate;
}

export function weekNumber(now = new Date()): number {
  const start = new Date(getStartDate());
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
