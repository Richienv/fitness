// lib/cycle.ts — menstrual cycle phase model (28-day)
// Pure logic module. No React, no DOM, no DB.

export type CyclePhase = "follicular" | "ovulation" | "luteal";

export type CycleInfo = {
  day: number;
  phase: CyclePhase;
  label: string;
  note: string;
};

export type CycleSubPhase =
  | "menstrual"
  | "follicular"
  | "ovulation"
  | "early_luteal"
  | "late_luteal";

export type CycleMetabolicEffect = {
  active: boolean;
  day: number;
  subPhase: CycleSubPhase;
  label: string;
  /** Fractional RMR multiplier shift (e.g. 0, +0.01, +0.03, +0.055). */
  rmrPct: number;
  /** Typical temporary water-retention band in kg (for honest scale explanation). */
  waterRetentionKg: [number, number];
  /** True on high water-swing days so adaptive TDEE down-weights noisy scale spikes. */
  excludeFromWeightSlope: boolean;
  guidance: string;
};

const DEFAULT_CYCLE_LENGTH = 28;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function clampCycleLength(cycleLength?: number | null): number {
  if (typeof cycleLength !== "number" || !Number.isFinite(cycleLength)) {
    return DEFAULT_CYCLE_LENGTH;
  }
  return Math.min(40, Math.max(21, Math.round(cycleLength)));
}

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
  cycleLength = DEFAULT_CYCLE_LENGTH,
): number {
  const start = toDayTimestamp(cycleStartDate);
  const now = toDayTimestamp(on);
  if (Number.isNaN(start) || Number.isNaN(now)) return NaN;
  const len = clampCycleLength(cycleLength);
  const diffDays = Math.round((now - start) / MS_PER_DAY);
  // JS % can be negative for dates before the start; normalise into [0, len-1].
  const mod = ((diffDays % len) + len) % len;
  return mod + 1;
}

/**
 * Map a 1-based cycle day to a phase (ovulation shifts cleanly when cycleLength != 28).
 */
export function cyclePhase(day: number, cycleLength = DEFAULT_CYCLE_LENGTH): CyclePhase {
  const len = clampCycleLength(cycleLength);
  const ovStart = len === 28 ? 12 : Math.max(8, Math.round(len - 16));
  const ovEnd = len === 28 ? 16 : Math.min(len - 8, ovStart + 4);
  if (day >= ovStart && day <= ovEnd) return "ovulation";
  if (day > ovEnd) return "luteal";
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
  cycleLength = DEFAULT_CYCLE_LENGTH,
): CycleInfo | null {
  if (!cycleStartDate) return null;
  const day = cycleDay(cycleStartDate, on, cycleLength);
  if (Number.isNaN(day)) return null;
  const phase = cyclePhase(day, cycleLength);
  return {
    day,
    phase,
    label: PHASE_LABEL[phase],
    note: PHASE_NOTE[phase],
  };
}

/**
 * Detailed cycle sub-phase metabolic & water-retention effect for precision
 * TDEE calibration and honest scale interpretation.
 */
export function cycleMetabolicEffect(
  cycleStartDate: string | null,
  menstrualTrackingEnabled: boolean,
  on: Date | string = new Date(),
  cycleLength = DEFAULT_CYCLE_LENGTH,
): CycleMetabolicEffect {
  const len = clampCycleLength(cycleLength);
  const rawDay = cycleStartDate ? cycleDay(cycleStartDate, on, len) : NaN;
  if (!menstrualTrackingEnabled || !cycleStartDate || Number.isNaN(rawDay)) {
    return {
      active: false,
      day: 1,
      subPhase: "follicular",
      label: "Siklus nonaktif",
      rmrPct: 0,
      waterRetentionKg: [0, 0],
      excludeFromWeightSlope: false,
      guidance: "",
    };
  }

  const ovStart = len === 28 ? 12 : Math.max(8, Math.round(len - 16));
  const ovEnd = len === 28 ? 16 : Math.min(len - 8, ovStart + 4);
  const lateStart = Math.max(ovEnd + 3, len - 6);

  if (rawDay <= 5) {
    return {
      active: true,
      day: rawDay,
      subPhase: "menstrual",
      label: "Haid (Hari 1–5)",
      rmrPct: 0.015,
      waterRetentionKg: rawDay <= 2 ? [0.4, 1.2] : [0, 0.5],
      excludeFromWeightSlope: rawDay <= 3,
      guidance:
        "Awal haid — retensi air mulai turun bertahap. Fokus zat besi, protein, dan hidrasi.",
    };
  }
  if (rawDay < ovStart) {
    return {
      active: true,
      day: rawDay,
      subPhase: "follicular",
      label: "Folikular",
      rmrPct: 0,
      waterRetentionKg: [0, 0.2],
      excludeFromWeightSlope: false,
      guidance:
        "Fase paling stabil untuk membaca tren lemak & performa latihan. Berat timbangan paling jujur.",
    };
  }
  if (rawDay <= ovEnd) {
    return {
      active: true,
      day: rawDay,
      subPhase: "ovulation",
      label: "Ovulasi",
      rmrPct: 0.02,
      waterRetentionKg: [0.2, 0.6],
      excludeFromWeightSlope: false,
      guidance:
        "Bakar basal naik tipis (~2%) & energi tinggi. Jaga form compound berat karena ligamen lebih longgar.",
    };
  }
  if (rawDay < lateStart) {
    return {
      active: true,
      day: rawDay,
      subPhase: "early_luteal",
      label: "Luteal Awal",
      rmrPct: 0.035,
      waterRetentionKg: [0.3, 0.9],
      excludeFromWeightSlope: false,
      guidance:
        "Progesteron mulai menaikkan bakar basal ~3,5%. Wajar bila timbangan sedikit naik karena air.",
    };
  }
  return {
    active: true,
    day: rawDay,
    subPhase: "late_luteal",
    label: "Luteal Akhir (PMS)",
    rmrPct: 0.055,
    waterRetentionKg: [0.6, 1.6],
    excludeFromWeightSlope: true,
    guidance:
      "Luteal akhir (PMS): bakar basal naik ~5,5% (+60–90 kkal), tetapi tubuh menahan ~0,6–1,6 kg air. Jangan samakan air haid dengan kenaikan lemak.",
  };
}

/** True when the given date falls in the luteal phase. */
export function isLuteal(
  cycleStartDate: string,
  on: Date | string = new Date(),
  cycleLength = DEFAULT_CYCLE_LENGTH,
): boolean {
  const info = cycleInfo(cycleStartDate, on, cycleLength);
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
  cycleLength = DEFAULT_CYCLE_LENGTH,
): boolean {
  if (!menstrualTrackingEnabled || !cycleStartDate) return false;
  return isLuteal(cycleStartDate, on, cycleLength);
}

/**
 * Extra kcal allowed before flagging "over target". 150 kcal on late-luteal
 * days when tracking is on, otherwise 0.
 */
export function lutealCalorieAllowance(
  cycleStartDate: string | null,
  menstrualTrackingEnabled: boolean,
  on: Date | string = new Date(),
  cycleLength = DEFAULT_CYCLE_LENGTH,
): number {
  const eff = cycleMetabolicEffect(
    cycleStartDate,
    menstrualTrackingEnabled,
    on,
    cycleLength,
  );
  return eff.active && eff.subPhase === "late_luteal" ? 150 : 0;
}
