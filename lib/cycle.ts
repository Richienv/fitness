// lib/cycle.ts — menstrual cycle phase model (28-day)
// Pure logic module. No React, no DOM, no DB.

export type CyclePhase = "follicular" | "ovulation" | "luteal";

export type CycleInfo = {
  day: number;
  phase: CyclePhase;
  label: string;
  note: string;
};

const CYCLE_LENGTH = 28;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a YYYY-MM-DD string or Date into a UTC-midnight timestamp (ms).
 * Returns NaN for invalid input.
 */
function toDayTimestamp(value: Date | string): number {
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "string") {
    // Accept YYYY-MM-DD (and full ISO). Take just the date part.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!m) return NaN;
    d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  } else {
    return NaN;
  }
  const t = d.getTime();
  if (Number.isNaN(t)) return NaN;
  // Normalise to whole UTC days so DST / time-of-day never shifts the diff.
  return Math.floor(t / MS_PER_DAY) * MS_PER_DAY;
}

/**
 * 1-based day within a repeating 28-day cycle counted from cycleStartDate.
 * Whole-day diff mod 28, +1. Returns NaN on invalid input.
 */
export function cycleDay(
  cycleStartDate: string,
  on: Date | string = new Date(),
): number {
  const start = toDayTimestamp(cycleStartDate);
  const now = toDayTimestamp(on);
  if (Number.isNaN(start) || Number.isNaN(now)) return NaN;
  const diffDays = Math.round((now - start) / MS_PER_DAY);
  // JS % can be negative for dates before the start; normalise into [0, 27].
  const mod = ((diffDays % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH;
  return mod + 1;
}

/**
 * Map a 1-based cycle day to a phase.
 *
 * Follicular and ovulation windows biologically overlap (ovulation is
 * commonly cited around days 12–16, still inside the broader follicular
 * phase). To give a single, non-ambiguous phase per day we resolve the
 * overlap by treating days 12–16 as "ovulation":
 *   - days  1–11 : follicular
 *   - days 12–16 : ovulation
 *   - days 17–28 : luteal
 */
export function cyclePhase(day: number): CyclePhase {
  if (day >= 12 && day <= 16) return "ovulation";
  if (day >= 17) return "luteal";
  return "follicular";
}

const PHASE_LABEL: Record<CyclePhase, string> = {
  follicular: "FOLIKULAR",
  ovulation: "OVULASI",
  luteal: "LUTEAL",
};

const PHASE_NOTE: Record<CyclePhase, string> = {
  follicular: "Fase kuat — waktunya coba PR / naik beban.",
  ovulation: "Ligamen lebih longgar — jaga form di compound berat.",
  luteal: "Wajar performa turun & retensi air. Timbangan naik ≠ lemak.",
};

/**
 * Full cycle info for a date. Returns null when there is no start date.
 */
export function cycleInfo(
  cycleStartDate: string,
  on: Date | string = new Date(),
): CycleInfo | null {
  if (!cycleStartDate) return null;
  const day = cycleDay(cycleStartDate, on);
  if (Number.isNaN(day)) return null;
  const phase = cyclePhase(day);
  return {
    day,
    phase,
    label: PHASE_LABEL[phase],
    note: PHASE_NOTE[phase],
  };
}

/** True when the given date falls in the luteal phase. */
export function isLuteal(
  cycleStartDate: string,
  on: Date | string = new Date(),
): boolean {
  const info = cycleInfo(cycleStartDate, on);
  return info !== null && info.phase === "luteal";
}

/**
 * Whether weight-gain warnings should be muted: tracking is enabled AND the
 * current phase is luteal (water retention makes the scale unreliable).
 */
export function suppressWeightWarning(
  cycleStartDate: string | null,
  menstrualTrackingEnabled: boolean,
  on: Date | string = new Date(),
): boolean {
  if (!menstrualTrackingEnabled || !cycleStartDate) return false;
  return isLuteal(cycleStartDate, on);
}

/**
 * Extra kcal allowed before flagging "over target". 150 kcal on late-luteal
 * days (day >= 22) when tracking is on, otherwise 0.
 */
export function lutealCalorieAllowance(
  cycleStartDate: string | null,
  menstrualTrackingEnabled: boolean,
  on: Date | string = new Date(),
): number {
  if (!menstrualTrackingEnabled || !cycleStartDate) return 0;
  const day = cycleDay(cycleStartDate, on);
  if (Number.isNaN(day)) return 0;
  return day >= 22 ? 150 : 0;
}
