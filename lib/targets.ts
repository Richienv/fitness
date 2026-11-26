import {
  DEFAULT_SETTINGS,
  getSettings,
  profileComplete,
  type MacroTarget,
} from "./settings";
import {
  calorieFloorFor,
  computeMetabolicSnapshot,
  isValidTodayCondition,
  type TodayCondition,
} from "./metabolicEngine";
import { scopedKey } from "./userScope";

export type { MacroTarget };

function readLatestBodyDims(fallbackKg: number): {
  kg: number;
  waistCm: number | null;
  hipCm: number | null;
} {
  if (typeof window === "undefined") {
    return { kg: fallbackKg, waistCm: null, hipCm: null };
  }
  try {
    const raw = window.localStorage.getItem(scopedKey("richie.measurements.v1"));
    if (!raw) return { kg: fallbackKg, waistCm: null, hipCm: null };
    const list = JSON.parse(raw) as Array<{
      date?: string;
      measuredAt?: number;
      weightKg?: number | null;
      waistCm?: number | null;
      hipCm?: number | null;
    }>;
    if (!Array.isArray(list) || list.length === 0) {
      return { kg: fallbackKg, waistCm: null, hipCm: null };
    }
    const sorted = [...list].sort(
      (a, b) =>
        (b.date ?? "").localeCompare(a.date ?? "") ||
        (b.measuredAt ?? 0) - (a.measuredAt ?? 0),
    );
    const latestWeight = sorted.find(
      (m) => typeof m.weightKg === "number" && Number.isFinite(m.weightKg) && m.weightKg > 20,
    );
    const latestWaist = sorted.find(
      (m) => typeof m.waistCm === "number" && Number.isFinite(m.waistCm) && m.waistCm > 40,
    );
    const latestHip = sorted.find(
      (m) => typeof m.hipCm === "number" && Number.isFinite(m.hipCm) && m.hipCm > 50,
    );
    return {
      kg: latestWeight?.weightKg ?? fallbackKg,
      waistCm: latestWaist?.waistCm ?? null,
      hipCm: latestHip?.hipCm ?? null,
    };
  } catch {
    return { kg: fallbackKg, waistCm: null, hipCm: null };
  }
}

function readCachedConditionAndOffset(date: string): {
  todayCondition: TodayCondition;
  adaptiveOffsetKcal: number;
} {
  if (typeof window === "undefined") {
    return { todayCondition: "normal", adaptiveOffsetKcal: 0 };
  }
  let todayCondition: TodayCondition = "normal";
  let adaptiveOffsetKcal = 0;
  try {
    const rawCond = window.localStorage.getItem(scopedKey("r2.todayCondition.v1"));
    if (rawCond) {
      const map = JSON.parse(rawCond) as Record<string, unknown>;
      if (isValidTodayCondition(map?.[date])) {
        todayCondition = map[date] as TodayCondition;
      }
    }
  } catch {}
  try {
    const rawCache = window.localStorage.getItem(scopedKey("r2.metabolicCache.v1"));
    if (rawCache) {
      const c = JSON.parse(rawCache) as {
        date?: string;
        adaptiveOffsetKcal?: unknown;
      };
      if (
        c?.date === date &&
        typeof c.adaptiveOffsetKcal === "number" &&
        Number.isFinite(c.adaptiveOffsetKcal)
      ) {
        adaptiveOffsetKcal = c.adaptiveOffsetKcal;
      }
    }
  } catch {}
  return { todayCondition, adaptiveOffsetKcal };
}

/** Resolve the day targets from the precision metabolic engine:
 *  - uses latest scale weight + waist/hip circumference when available
 *  - honors conservative NEAT sitting/posture/step bands
 *  - applies menstrual cycle RMR shift & female 1200 kcal / male 1500 kcal safety floor
 *  - incorporates cached closed-loop 14–28d adaptive calibration offset
 */
function resolvedTargets(): { gymDay: MacroTarget; restDay: MacroTarget } {
  const s = getSettings();
  // A hand-edited target always wins — the user's explicit number beats the
  // physiology-derived estimate.
  if (s.targetsCustom) return s.targets;
  const p = s.profile;
  if (profileComplete(p) && p.sex && p.weightKg != null) {
    const date = todayKey();
    const dims = readLatestBodyDims(p.weightKg);
    const { todayCondition, adaptiveOffsetKcal } =
      readCachedConditionAndOffset(date);
    const snap = computeMetabolicSnapshot({
      sex: p.sex,
      goal: p.goal,
      kg: dims.kg,
      cm: p.heightCm as number,
      age: p.age as number,
      waistCm: dims.waistCm,
      hipCm: dims.hipCm,
      metabolic: p.metabolic,
      fallbackActivity: p.activity,
      menstrualTrackingEnabled: p.menstrualTrackingEnabled,
      cycleStartDate: p.cycleStartDate ?? null,
      activeBurnDay: 0,
      hasWatchActive: false,
      eatenToday: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      todayCondition,
      history: [],
      date,
    });
    const floor = calorieFloorFor(p.sex);
    const restKcal = Math.max(
      floor,
      Math.round((snap.restTargetKcal + adaptiveOffsetKcal) / 10) * 10,
    );
    const gymKcal = Math.max(
      floor,
      Math.round((snap.gymTargetKcal + adaptiveOffsetKcal) / 10) * 10,
    );
    const fatFloor = Math.round(0.8 * dims.kg);
    const protein = snap.proteinTargetG;
    const fatRest = Math.max(fatFloor, Math.round((restKcal * 0.25) / 9));
    const carbsRest = Math.max(
      0,
      Math.round((restKcal - protein * 4 - fatRest * 9) / 4),
    );
    const fatGym = Math.max(fatFloor, Math.round((gymKcal * 0.25) / 9));
    const carbsGym = Math.max(
      0,
      Math.round((gymKcal - protein * 4 - fatGym * 9) / 4),
    );
    return {
      gymDay: { kcal: gymKcal, protein, carbs: carbsGym, fat: fatGym },
      restDay: { kcal: restKcal, protein, carbs: carbsRest, fat: fatRest },
    };
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
export function getSleepTargetMin(): number {
  return Math.round((getSettings().routine?.sleepHours ?? 8) * 60);
}
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
