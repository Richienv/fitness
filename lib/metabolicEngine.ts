// Pure precision metabolic, TDEE, thermic-effect, sleep, and closed-loop
// reality-calibration engine. Zero DOM/storage/DB dependencies — server-safe.
import { mifflinBMR } from "./energy.ts";
import { cycleMetabolicEffect, type CycleMetabolicEffect } from "./cycle.ts";

export type SittingBand = "lt4" | "4to6" | "7to9" | "10plus";
export type DailyPosture = "desk" | "mixed" | "standing" | "physical";
export type TypicalStepsBand = "lt3k" | "3k_5500" | "5500_8500" | "gt8500";
export type DeficitPace = "gentle" | "steady" | "focused" | "maintain";
export type BodyBuildEstimate = "lean" | "average" | "soft" | "high";
export type TodayCondition =
  | "normal"
  | "low_sleep"
  | "period_pms"
  | "recovering"
  | "extra_active";

export type MetabolicProfile = {
  sittingHours?: SittingBand;
  dailyPosture?: DailyPosture;
  typicalSteps?: TypicalStepsBand;
  deficitPace?: DeficitPace;
  bodyFatPct?: number | null;
  bodyBuild?: BodyBuildEstimate | null;
  cycleLengthDays?: number;
  calibratedAt?: string | null;
};

export const FEMALE_CALORIE_FLOOR = 1200;
export const MALE_CALORIE_FLOOR = 1500;
export const MIN_CALIBRATION_FOOD_DAYS = 7;
export const MIN_CALIBRATION_WEIGH_DAYS = 3;
export const MIN_CALIBRATION_SPAN_DAYS = 7;

export function calorieFloorFor(sex: "male" | "female"): number {
  return sex === "female" ? FEMALE_CALORIE_FLOOR : MALE_CALORIE_FLOOR;
}

const SITTING_VALUES: readonly SittingBand[] = ["lt4", "4to6", "7to9", "10plus"];
const POSTURE_VALUES: readonly DailyPosture[] = ["desk", "mixed", "standing", "physical"];
const STEPS_VALUES: readonly TypicalStepsBand[] = ["lt3k", "3k_5500", "5500_8500", "gt8500"];
const PACE_VALUES: readonly DeficitPace[] = ["gentle", "steady", "focused", "maintain"];
const BUILD_VALUES: readonly BodyBuildEstimate[] = ["lean", "average", "soft", "high"];
const CONDITION_VALUES: readonly TodayCondition[] = [
  "normal",
  "low_sleep",
  "period_pms",
  "recovering",
  "extra_active",
];

export function isValidTodayCondition(v: unknown): v is TodayCondition {
  return CONDITION_VALUES.includes(v as TodayCondition);
}

export function sanitizeMetabolicProfile(raw: unknown): MetabolicProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: MetabolicProfile = {};

  if (SITTING_VALUES.includes(o.sittingHours as SittingBand)) {
    out.sittingHours = o.sittingHours as SittingBand;
  }
  if (POSTURE_VALUES.includes(o.dailyPosture as DailyPosture)) {
    out.dailyPosture = o.dailyPosture as DailyPosture;
  }
  if (STEPS_VALUES.includes(o.typicalSteps as TypicalStepsBand)) {
    out.typicalSteps = o.typicalSteps as TypicalStepsBand;
  }
  if (PACE_VALUES.includes(o.deficitPace as DeficitPace)) {
    out.deficitPace = o.deficitPace as DeficitPace;
  }
  if (o.bodyBuild === null) {
    out.bodyBuild = null;
  } else if (BUILD_VALUES.includes(o.bodyBuild as BodyBuildEstimate)) {
    out.bodyBuild = o.bodyBuild as BodyBuildEstimate;
  }
  if (o.bodyFatPct === null) {
    out.bodyFatPct = null;
  } else if (
    typeof o.bodyFatPct === "number" &&
    Number.isFinite(o.bodyFatPct) &&
    o.bodyFatPct >= 5 &&
    o.bodyFatPct <= 60
  ) {
    out.bodyFatPct = Math.round(o.bodyFatPct * 10) / 10;
  }
  if (
    typeof o.cycleLengthDays === "number" &&
    Number.isFinite(o.cycleLengthDays)
  ) {
    out.cycleLengthDays = Math.min(40, Math.max(21, Math.round(o.cycleLengthDays)));
  }
  if (typeof o.calibratedAt === "string" && o.calibratedAt.length <= 40) {
    out.calibratedAt = o.calibratedAt;
  } else if (o.calibratedAt === null) {
    out.calibratedAt = null;
  }

  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const BUILD_BF_MAP: Record<"male" | "female", Record<BodyBuildEstimate, number>> = {
  male: { lean: 13, average: 19, soft: 25, high: 32 },
  female: { lean: 20, average: 26, soft: 33, high: 40 },
};

/** Estimate body fat % from explicit number, circumference tape (modified U.S. Navy), or body build preset. */
export function resolveBodyFatPct(args: {
  sex: "male" | "female";
  kg: number;
  cm: number;
  waistCm?: number | null;
  hipCm?: number | null;
  metabolic?: MetabolicProfile | null;
}): { pct: number | null; source: "explicit" | "tape" | "build" | null } {
  const m = args.metabolic;
  if (
    typeof m?.bodyFatPct === "number" &&
    Number.isFinite(m.bodyFatPct) &&
    m.bodyFatPct >= 5 &&
    m.bodyFatPct <= 60
  ) {
    return { pct: m.bodyFatPct, source: "explicit" };
  }

  // Approximate US Navy estimate from height & waist (+ hip for women) when measured.
  if (
    typeof args.waistCm === "number" &&
    args.waistCm > 40 &&
    args.waistCm < 200 &&
    args.cm > 120
  ) {
    if (args.sex === "male") {
      const estNeck = 0.215 * args.cm;
      const diff = args.waistCm - estNeck;
      if (diff > 5) {
        const bf =
          495 /
            (1.0324 -
              0.19077 * Math.log10(diff) +
              0.15456 * Math.log10(args.cm)) -
          450;
        if (Number.isFinite(bf)) {
          return { pct: Math.round(clamp(bf, 7, 50) * 10) / 10, source: "tape" };
        }
      }
    } else if (
      typeof args.hipCm === "number" &&
      args.hipCm > 50 &&
      args.hipCm < 220
    ) {
      const estNeck = 0.2 * args.cm;
      const diff = args.waistCm + args.hipCm - estNeck;
      if (diff > 20) {
        const bf =
          495 /
            (1.29579 -
              0.35004 * Math.log10(diff) +
              0.221 * Math.log10(args.cm)) -
          450;
        if (Number.isFinite(bf)) {
          return { pct: Math.round(clamp(bf, 12, 54) * 10) / 10, source: "tape" };
        }
      }
    }
  }

  if (m?.bodyBuild && BUILD_BF_MAP[args.sex][m.bodyBuild]) {
    return { pct: BUILD_BF_MAP[args.sex][m.bodyBuild], source: "build" };
  }
  return { pct: null, source: null };
}

export function precisionBmr(args: {
  sex: "male" | "female";
  kg: number;
  cm: number;
  age: number;
  waistCm?: number | null;
  hipCm?: number | null;
  metabolic?: MetabolicProfile | null;
}): {
  bmr: number;
  mifflin: number;
  katch: number | null;
  method: "mifflin" | "katch_blend";
  bodyFatPct: number | null;
  bodyFatSource: "explicit" | "tape" | "build" | null;
} {
  const mifflin = mifflinBMR(args.sex, args.kg, args.cm, args.age);
  const bf = resolveBodyFatPct(args);
  if (bf.pct === null) {
    return {
      bmr: mifflin,
      mifflin,
      katch: null,
      method: "mifflin",
      bodyFatPct: null,
      bodyFatSource: null,
    };
  }
  const leanKg = args.kg * (1 - bf.pct / 100);
  const katch = 370 + 21.6 * leanKg;
  // Blend 50/50 and guard within ±15% of Mifflin-St Jeor against noisy body-fat guesses.
  const bmr = clamp((mifflin + katch) / 2, mifflin * 0.85, mifflin * 1.15);
  return {
    bmr,
    mifflin,
    katch,
    method: "katch_blend",
    bodyFatPct: bf.pct,
    bodyFatSource: bf.source,
  };
}

const SITTING_BASE: Record<SittingBand, number> = {
  "10plus": 1.1,
  "7to9": 1.15,
  "4to6": 1.22,
  lt4: 1.3,
};

const POSTURE_DELTA: Record<DailyPosture, number> = {
  desk: -0.02,
  mixed: 0.02,
  standing: 0.08,
  physical: 0.16,
};

const STEPS_DELTA: Record<TypicalStepsBand, number> = {
  lt3k: -0.02,
  "3k_5500": 0.02,
  "5500_8500": 0.07,
  gt8500: 0.13,
};

/**
 * Pure non-exercise NEAT multiplier.
 * - When Apple Watch / Health active energy is connected and > 0, returns 1.0 (avoiding double counting).
 * - When calibrated via sitting hours + posture + steps, returns true non-exercise factor [1.08..1.52].
 * - When uncalibrated, stays conservatively in [1.12..1.24] instead of over-optimistic 1.5+.
 */
export function computeNeatFactor(args: {
  metabolic?: MetabolicProfile | null;
  fallbackActivity?: number | null;
  hasWatchActive: boolean;
}): { factor: number; calibratedLifestyle: boolean } {
  if (args.hasWatchActive) {
    return {
      factor: 1.0,
      calibratedLifestyle: Boolean(
        args.metabolic?.sittingHours ||
          args.metabolic?.dailyPosture ||
          args.metabolic?.typicalSteps,
      ),
    };
  }
  const m = args.metabolic;
  const hasAny = Boolean(m?.sittingHours || m?.dailyPosture || m?.typicalSteps);
  if (hasAny) {
    const base = m?.sittingHours ? SITTING_BASE[m.sittingHours] : 1.16;
    const pDelta = m?.dailyPosture ? POSTURE_DELTA[m.dailyPosture] : 0;
    const sDelta = m?.typicalSteps ? STEPS_DELTA[m.typicalSteps] : 0;
    return {
      factor: Math.round(clamp(base + pDelta + sDelta, 1.08, 1.52) * 1000) / 1000,
      calibratedLifestyle: true,
    };
  }
  const fb =
    typeof args.fallbackActivity === "number" && Number.isFinite(args.fallbackActivity)
      ? args.fallbackActivity
      : 1.2;
  // Map legacy 1.2..1.725 conservatively onto true baseline non-exercise [1.12..1.24]
  const conservative = clamp(1.12 + Math.max(0, fb - 1.2) * 0.22, 1.12, 1.24);
  return {
    factor: Math.round(conservative * 1000) / 1000,
    calibratedLifestyle: false,
  };
}

/**
 * Thermic Effect of Food adjustment relative to the standard 10% mixed-diet assumption.
 * Protein digestion burns ~24% of its kcal, carbs ~7%, fat ~2.5%.
 */
export function computeTefDeltaKcal(macros: {
  eatenKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): number {
  const eaten = Math.max(0, Number.isFinite(macros.eatenKcal) ? macros.eatenKcal : 0);
  if (eaten < 50) return 0;
  const pKcal = Math.max(0, macros.proteinG) * 4;
  const cKcal = Math.max(0, macros.carbsG) * 4;
  const fKcal = Math.max(0, macros.fatG) * 9;
  const macroSum = pKcal + cKcal + fKcal;
  if (macroSum < 50) return 0;
  const scale = eaten / macroSum;
  const actualTef = (pKcal * 0.24 + cKcal * 0.07 + fKcal * 0.025) * scale;
  const baselineTef = eaten * 0.1;
  return Math.round(clamp(actualTef - baselineTef, -80, 140));
}

export type MetabolicHistoryDay = {
  date: string;
  weightKg: number | null;
  eatenKcal: number;
  activeKcal: number;
  /** Baseline (BMR + NEAT + cycle, excluding adaptive offset) for that historical day. */
  formulaBaselineBurn: number;
  /** True on menstrual/luteal water-retention days so water swings don't distort TDEE calibration. */
  excludeFromSlope?: boolean;
};

export type TdeeCalibrationResult = {
  status: "collecting" | "learning" | "calibrated";
  validFoodDays: number;
  weighDays: number;
  spanDays: number;
  daysNeeded: number;
  observedTotalTdee: number | null;
  formulaTotalTdee: number | null;
  adaptiveOffsetKcal: number;
  confidencePct: number;
  realityMismatch: boolean;
  mismatchMessage: string | null;
};

function diffDaysUtc(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000,
  );
}

/**
 * Closed-loop Bayesian reality calibration: compares observed intake & EWMA water-filtered
 * weight change against formula TDEE over the past 14–28 days.
 */
export function calibrateAdaptiveTdee(
  historyDescOrAsc: readonly MetabolicHistoryDay[],
): TdeeCalibrationResult {
  const days = [...historyDescOrAsc]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-28);

  const foodDays = days.filter((d) => d.eatenKcal >= 550 && d.formulaBaselineBurn > 500);
  const allWeighs = days.filter(
    (d): d is MetabolicHistoryDay & { weightKg: number } =>
      typeof d.weightKg === "number" && Number.isFinite(d.weightKg) && d.weightKg > 20,
  );
  // Filter out high-retention luteal/menstrual days when possible to isolate true tissue change.
  const cleanWeighs = allWeighs.filter((d) => !d.excludeFromSlope);
  const slopeWeighs = cleanWeighs.length >= MIN_CALIBRATION_WEIGH_DAYS ? cleanWeighs : allWeighs;

  const spanDays =
    slopeWeighs.length >= 2
      ? Math.max(0, diffDaysUtc(slopeWeighs[0].date, slopeWeighs[slopeWeighs.length - 1].date))
      : 0;

  const validFoodDays = foodDays.length;
  const weighDays = allWeighs.length;
  const missingFood = Math.max(0, MIN_CALIBRATION_FOOD_DAYS - validFoodDays);
  const missingWeigh = Math.max(0, MIN_CALIBRATION_WEIGH_DAYS - weighDays);
  const daysNeeded = Math.max(missingFood, missingWeigh);

  if (
    validFoodDays < MIN_CALIBRATION_FOOD_DAYS ||
    slopeWeighs.length < MIN_CALIBRATION_WEIGH_DAYS ||
    spanDays < MIN_CALIBRATION_SPAN_DAYS
  ) {
    return {
      status: validFoodDays >= 3 || weighDays >= 2 ? "learning" : "collecting",
      validFoodDays,
      weighDays,
      spanDays,
      daysNeeded: Math.max(daysNeeded, spanDays < MIN_CALIBRATION_SPAN_DAYS ? MIN_CALIBRATION_SPAN_DAYS - spanDays : 0),
      observedTotalTdee: null,
      formulaTotalTdee: null,
      adaptiveOffsetKcal: 0,
      confidencePct: Math.min(35, Math.round((validFoodDays / MIN_CALIBRATION_FOOD_DAYS) * 35)),
      realityMismatch: false,
      mismatchMessage: null,
    };
  }

  // EWMA trend smoothing across selected weigh-ins
  const alpha = 0.25;
  const ewma: { dayIdx: number; val: number }[] = [];
  let cur = slopeWeighs[0].weightKg;
  for (let i = 0; i < slopeWeighs.length; i++) {
    cur = i === 0 ? slopeWeighs[i].weightKg : alpha * slopeWeighs[i].weightKg + (1 - alpha) * cur;
    ewma.push({
      dayIdx: diffDaysUtc(slopeWeighs[0].date, slopeWeighs[i].date),
      val: cur,
    });
  }

  // Ordinary least squares slope of EWMA trend (kg/day)
  const n = ewma.length;
  const meanX = ewma.reduce((s, p) => s + p.dayIdx, 0) / n;
  const meanY = ewma.reduce((s, p) => s + p.val, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of ewma) {
    const dx = p.dayIdx - meanX;
    num += dx * (p.val - meanY);
    den += dx * dx;
  }
  const slopeKgPerDay = den > 0 ? clamp(num / den, -0.35, 0.35) : 0;

  const avgEaten = foodDays.reduce((s, d) => s + d.eatenKcal, 0) / validFoodDays;
  const avgActive = foodDays.reduce((s, d) => s + d.activeKcal, 0) / validFoodDays;
  const avgFormulaBase = foodDays.reduce((s, d) => s + d.formulaBaselineBurn, 0) / validFoodDays;

  const observedTotalTdee = avgEaten - slopeKgPerDay * 7700;
  const observedBaseline = observedTotalTdee - avgActive;
  const rawOffset = observedBaseline - avgFormulaBase;
  const weight = clamp((validFoodDays - 4) / 20, 0.2, 0.85);
  const adaptiveOffsetKcal = Math.round(clamp(rawOffset * weight, -420, 420));
  const formulaTotalTdee = Math.round(avgFormulaBase + avgActive);
  const confidencePct = Math.round(45 + weight * 50);
  const realityMismatch = Math.abs(adaptiveOffsetKcal) >= 100;

  let mismatchMessage: string | null = null;
  if (adaptiveOffsetKcal <= -100) {
    mismatchMessage = `Realita timbangan & makanmu menunjukkan pembakaran tubuhmu ~${Math.abs(adaptiveOffsetKcal)} kkal lebih hemat dari rumus standar — target makan otomatis disesuaikan ke bawah (tetap di batas aman) agar tidak diam-diam surplus.`;
  } else if (adaptiveOffsetKcal >= 100) {
    mismatchMessage = `Metabolismemu membakar ~${adaptiveOffsetKcal} kkal lebih tinggi dari rumus standar — target makan disesuaikan naik supaya defisitmu tidak terlalu ekstrem.`;
  }

  return {
    status: "calibrated",
    validFoodDays,
    weighDays,
    spanDays,
    daysNeeded: 0,
    observedTotalTdee: Math.round(observedTotalTdee),
    formulaTotalTdee,
    adaptiveOffsetKcal,
    confidencePct,
    realityMismatch,
    mismatchMessage,
  };
}

const PACE_DEFICIT: Record<DeficitPace, number> = {
  gentle: 250,
  steady: 350,
  focused: 450,
  maintain: 0,
};

function defaultPaceForGoal(goal: string, pace?: DeficitPace): DeficitPace {
  if (pace && PACE_VALUES.includes(pace)) return pace;
  if (goal === "fat_loss") return "steady";
  if (goal === "recomp") return "gentle";
  if (goal === "muscle_gain" || goal === "maintain") return "maintain";
  return "steady";
}

export type MetabolicSnapshot = {
  bmr: number;
  mifflinBmr: number;
  bmrMethod: "mifflin" | "katch_blend";
  bodyFatPct: number | null;
  neatFactor: number;
  neatKcal: number;
  cycleEffect: CycleMetabolicEffect;
  cycleRmrKcal: number;
  tefDeltaKcal: number;
  conditionDeltaKcal: number;
  todayCondition: TodayCondition;
  sleepMin: number | null;
  adaptiveOffsetKcal: number;
  /** True full-day non-exercise / calibrated baseline passed to energyBalance as normalBurn. */
  normalBurnDay: number;
  activeBurnDay: number;
  totalBurnDay: number;
  calibration: TdeeCalibrationResult;
  recommendedDeficit: number;
  recommendedTargetKcal: number;
  gymTargetKcal: number;
  restTargetKcal: number;
  proteinTargetG: number;
  fatTargetG: number;
  carbsTargetG: number;
  calorieFloor: number;
  floored: boolean;
  accuracyScore: number;
  accuracyLabel: string;
  missingSignals: string[];
  alerts: string[];
};

export function computeMetabolicSnapshot(args: {
  sex: "male" | "female";
  goal: string;
  kg: number;
  cm: number;
  age: number;
  waistCm?: number | null;
  hipCm?: number | null;
  metabolic?: MetabolicProfile | null;
  fallbackActivity?: number | null;
  menstrualTrackingEnabled?: boolean;
  cycleStartDate?: string | null;
  activeBurnDay: number;
  hasWatchActive: boolean;
  eatenToday: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  sleepMin?: number | null;
  todayCondition?: TodayCondition;
  history?: readonly MetabolicHistoryDay[];
  date?: Date | string;
}): MetabolicSnapshot {
  const bmrRes = precisionBmr({
    sex: args.sex,
    kg: args.kg,
    cm: args.cm,
    age: args.age,
    waistCm: args.waistCm,
    hipCm: args.hipCm,
    metabolic: args.metabolic,
  });

  const neat = computeNeatFactor({
    metabolic: args.metabolic,
    fallbackActivity: args.fallbackActivity,
    hasWatchActive: args.hasWatchActive,
  });

  const cycleLen = args.metabolic?.cycleLengthDays ?? 28;
  const cycleEnabled = args.sex === "female" && Boolean(args.menstrualTrackingEnabled);
  let cycleEffect = cycleMetabolicEffect(
    args.cycleStartDate ?? null,
    cycleEnabled,
    args.date ?? new Date(),
    cycleLen,
  );

  const cond: TodayCondition = args.todayCondition ?? "normal";
  if (
    args.sex === "female" &&
    cond === "period_pms" &&
    !cycleEffect.active
  ) {
    cycleEffect = {
      active: true,
      day: 25,
      subPhase: "late_luteal",
      label: "Mode Haid / PMS",
      rmrPct: 0.05,
      waterRetentionKg: [0.6, 1.5],
      excludeFromWeightSlope: true,
      guidance:
        "Mode Haid/PMS aktif: bakar basal naik ~5%, wajar timbangan menahan ±0,6–1,5 kg air.",
    };
  }

  const baseRestingAndNeat = bmrRes.bmr * neat.factor;
  const neatKcal = Math.max(0, baseRestingAndNeat - bmrRes.bmr);
  const cycleRmrKcal = Math.round(bmrRes.bmr * cycleEffect.rmrPct);
  const tefDeltaKcal = computeTefDeltaKcal({
    eatenKcal: args.eatenToday.kcal,
    proteinG: args.eatenToday.proteinG,
    carbsG: args.eatenToday.carbsG,
    fatG: args.eatenToday.fatG,
  });

  const sleepMin =
    typeof args.sleepMin === "number" && Number.isFinite(args.sleepMin) && args.sleepMin > 0
      ? args.sleepMin
      : null;

  let conditionDeltaKcal = 0;
  const alerts: string[] = [];

  if (cond === "low_sleep" || (sleepMin !== null && sleepMin < 360)) {
    const pen = -Math.round(baseRestingAndNeat * 0.04);
    conditionDeltaKcal += pen;
    alerts.push(
      `Tidur <6 jam menurunkan gerak tak sadar (NEAT) ~${Math.abs(pen)} kkal hari ini.`,
    );
  }
  if (cond === "recovering") {
    conditionDeltaKcal += Math.round(bmrRes.bmr * 0.05);
    alerts.push("Mode Pemulihan: defisit dijeda ke maintenance supaya imun & energi pulih.");
  } else if (cond === "extra_active" && !args.hasWatchActive) {
    conditionDeltaKcal += 140;
  }

  const calibration = calibrateAdaptiveTdee(args.history ?? []);
  if (calibration.mismatchMessage) {
    alerts.push(calibration.mismatchMessage);
  }

  const rawNormal =
    baseRestingAndNeat +
    cycleRmrKcal +
    tefDeltaKcal +
    conditionDeltaKcal +
    calibration.adaptiveOffsetKcal;
  // Never drop normal burn unrealistically below 88% of BMR
  const normalBurnDay = Math.round(Math.max(bmrRes.bmr * 0.88, rawNormal));
  const activeBurnDay = Math.max(0, Math.round(args.activeBurnDay));
  const totalBurnDay = normalBurnDay + activeBurnDay;

  const floor = calorieFloorFor(args.sex);
  const pace = defaultPaceForGoal(args.goal, args.metabolic?.deficitPace);
  let targetDelta =
    args.goal === "muscle_gain" && !args.metabolic?.deficitPace
      ? -200 // surplus
      : PACE_DEFICIT[pace];

  if (cond === "recovering") {
    targetDelta = 0;
  } else if (cycleEffect.subPhase === "late_luteal" && targetDelta > 250) {
    // Slightly soften deficit during PMS craving window while keeping net deficit genuine
    targetDelta = Math.max(200, targetDelta - 80);
  }

  const rawTarget = Math.round((totalBurnDay - targetDelta) / 10) * 10;
  const floored = rawTarget < floor;
  const recommendedTargetKcal = Math.max(floor, rawTarget);
  if (floored) {
    alerts.push(
      `Target dijaga di batas aman minimal ${floor.toLocaleString("id-ID")} kkal (${args.sex === "female" ? "wanita" : "pria"}). Jika bakar harianmu dekat dengan batas ini, tambah jalan/gerak pelan untuk menjaga defisit.`,
    );
  }

  // Gym day vs Rest day pair from calibrated resting/NEAT base (plus ~260 typical gym session burn)
  const restBaseline =
    bmrRes.bmr * (args.hasWatchActive ? 1.14 : neat.factor) +
    cycleRmrKcal +
    calibration.adaptiveOffsetKcal;
  const restTargetKcal = Math.max(floor, Math.round((restBaseline - targetDelta) / 10) * 10);
  const gymTargetKcal = Math.max(
    floor,
    Math.round((restBaseline + 260 - targetDelta) / 10) * 10,
  );

  const proteinTargetG = Math.round(1.8 * args.kg);
  const fatFloorG = Math.round(0.8 * args.kg);
  const fatTargetG = Math.max(fatFloorG, Math.round((recommendedTargetKcal * 0.25) / 9));
  const carbsTargetG = Math.max(
    0,
    Math.round((recommendedTargetKcal - proteinTargetG * 4 - fatTargetG * 9) / 4),
  );

  // Accuracy scoring (0..98%) & missing signal prompts
  let score = 42;
  const missingSignals: string[] = [];

  if (args.hasWatchActive) {
    score += 22;
  } else if (neat.calibratedLifestyle) {
    score += 18;
  } else {
    missingSignals.push("Isi jam duduk & aktivitas harian (10 dtk)");
  }

  if (bmrRes.method === "katch_blend") {
    score += 10;
  } else {
    missingSignals.push("Isi perkiraan bentuk tubuh / lingkar pinggang");
  }

  if (args.sex === "female") {
    if (cycleEffect.active) {
      score += 8;
    } else {
      missingSignals.push("Aktifkan tanggal haid (siklus ubah bakar & air ±1,5 kg)");
    }
  } else {
    score += 8;
  }

  if (sleepMin !== null || cond !== "normal") {
    score += 4;
  }

  if (calibration.status === "calibrated") {
    score += 12;
  } else {
    score += Math.min(6, Math.round((calibration.validFoodDays / MIN_CALIBRATION_FOOD_DAYS) * 6));
    missingSignals.push(
      `Log makan & timbang ${calibration.daysNeeded} hari lagi untuk kalibrasi realitas`,
    );
  }

  const accuracyScore = Math.min(98, score);
  const accuracyLabel =
    accuracyScore >= 85
      ? "Sangat Akurat"
      : accuracyScore >= 68
        ? "Cukup Akurat"
        : "Estimasi Dasar";

  return {
    bmr: Math.round(bmrRes.bmr),
    mifflinBmr: Math.round(bmrRes.mifflin),
    bmrMethod: bmrRes.method,
    bodyFatPct: bmrRes.bodyFatPct,
    neatFactor: neat.factor,
    neatKcal: Math.round(neatKcal),
    cycleEffect,
    cycleRmrKcal,
    tefDeltaKcal,
    conditionDeltaKcal,
    todayCondition: cond,
    sleepMin,
    adaptiveOffsetKcal: calibration.adaptiveOffsetKcal,
    normalBurnDay,
    activeBurnDay,
    totalBurnDay,
    calibration,
    recommendedDeficit: Math.max(0, totalBurnDay - recommendedTargetKcal),
    recommendedTargetKcal,
    gymTargetKcal,
    restTargetKcal,
    proteinTargetG,
    fatTargetG,
    carbsTargetG,
    calorieFloor: floor,
    floored,
    accuracyScore,
    accuracyLabel,
    missingSignals,
    alerts,
  };
}
