import {
  DEFAULT_SETTINGS,
  getSettings,
  profileComplete,
  type MacroTarget,
} from "./settings";
import { computeDayTargets } from "./energy";

export type { MacroTarget };

/** Resolve the day targets: if the user has filled a physiology profile
 *  (sex + height + age + weight) we derive them via Mifflin-St Jeor; otherwise
 *  we fall back to the hardcoded/edited settings targets. This keeps existing
 *  (profile-less) users' numbers exactly as before. */
function resolvedTargets(): { gymDay: MacroTarget; restDay: MacroTarget } {
  const s = getSettings();
  // A hand-edited target always wins — the user's explicit number beats the
  // physiology-derived estimate.
  if (s.targetsCustom) return s.targets;
  const p = s.profile;
  if (profileComplete(p) && p.sex && p.weightKg != null) {
    const { gymDay, restDay } = computeDayTargets({
      sex: p.sex,
      goal: p.goal,
      weightKg: p.weightKg,
      heightCm: p.heightCm as number,
      age: p.age as number,
      activity: p.activity,
    });
    return { gymDay, restDay };
  }
  return s.targets;
}

// Backwards-compatible `TARGETS.gymDay` / `TARGETS.restDay`. Getters fire on
// every access so profile/settings edits take effect app-wide with no props.
export const TARGETS = {
  get gymDay(): MacroTarget {
    if (typeof window === "undefined") return DEFAULT_SETTINGS.targets.gymDay;
    return resolvedTargets().gymDay;
  },
  get restDay(): MacroTarget {
    if (typeof window === "undefined") return DEFAULT_SETTINGS.targets.restDay;
    return resolvedTargets().restDay;
  },
};

// Nightly sleep goal (minutes). 8h target; 7h floor still "counts" for streak.
export const SLEEP_TARGET_MIN = 480;
export const SLEEP_FLOOR_MIN = 420;

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
