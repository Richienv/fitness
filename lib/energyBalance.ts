// Today's energy balance and what it means for BOTH total body weight and pure
// body fat — in real time per second and per meal. Pure: no storage.
//
//   burn today = normal burn (what the body spends without exercise)
//              + active burn (Latihan: Apple Health, or the estimates)
//   balance    = burn − food          (positive = deficit)
//
// Why total body weight moves faster than pure fat:
//   1. Pure adipose tissue ≈ 7,700 kcal/kg.
//   2. Sustainable body tissue (fat + small lean share with lifting & protein,
//      ~85% fat / ~15% lean) ≈ 6,770 kcal/kg.
//   3. Same-day glycogen + bound water: ~20% of an acute deficit/surplus draws
//      from or stores into liver/muscle glycogen (4 kcal/g, each 1 g glycogen
//      binds ~3 g water → 4 g total weight per 4 kcal = 1 g/kcal), smoothly
//      saturated around ±360 kcal/day (~90 g glycogen = ~360 g total mass).
//
// Honest limits, shown in the UI: water/sodium intake and physical food mass
// sitting in the gut still swing the bathroom scale day-to-day, and weekly pace
// uses steady tissue/fat only (never multiplying one-time glycogen water by 7).
import { mifflinBMR } from "./energy.ts";

export const KCAL_PER_KG_FAT = 7700;
/** Effective energy density of sustainable body tissue (~85% fat + ~15% lean). */
export const KCAL_PER_KG_TISSUE = 6770;
/** Fraction of an acute single-day energy swing buffered by glycogen. */
export const GLYCOGEN_SHARE = 0.2;
/** Daily glycogen energy buffer (~90 g glycogen × 4 kcal/g = 360 kcal = 360 g with 3× bound water). */
export const GLYCOGEN_MAX_KCAL = 360;
/** BMR × this = a day without exercise (desk, errands). */
export const SEDENTARY_FACTOR = 1.2;
/** From this fraction of the day on, the plan projection uses what was eaten. */
export const DAY_CLOSING = 0.9;
export const SECONDS_PER_DAY = 86400;

export type BalanceInput = {
  sex: "male" | "female";
  kg: number;
  cm: number;
  age: number;
  /** Logged so far today. */
  eatenKcal: number;
  /** Today's target, including what training earned. */
  targetKcal: number;
  /** Active burn so far today. */
  activeKcal: number;
  /** True when activeKcal is Apple Health's active energy. */
  activeFromHealth: boolean;
  /** 0..1, how much of the day (China Standard Time) has passed (second-level). */
  dayFraction: number;
};

/** Breakdown of a caloric balance (positive = deficit / weight lost) into
 *  total body weight vs pure fat. */
export type WeightDelta = {
  /** Positive = deficit (losing), negative = surplus (gaining). */
  kcal: number;
  /** Pure adipose fat change in grams (kcal / 7,700 × 1,000). */
  fatGrams: number;
  /** Sustainable tissue share (fat + lean) in grams from non-glycogen energy. */
  tissueGrams: number;
  /** Acute glycogen + bound water shift in grams (positive = lost). */
  glycogenWaterGrams: number;
  /** Total estimated body weight change in grams (tissue + glycogen-water). */
  bodyGrams: number;
  /** Total estimated body weight change in kg (positive = lost). */
  bodyKg: number;
  /** Pure fat change in kg (positive = lost). */
  fatKg: number;
  /** Anchor weight minus bodyKg (projected or live body weight in kg). */
  weightKg: number;
};

/** Continuous real-time burn speed while not eating. */
export type BurnRate = {
  kcalPerSecond: number;
  kcalPerMinute: number;
  kcalPerHour: number;
  /** Pure fat burn speed while resting/fasting (kg/second & g/hour). */
  fatKgPerSecond: number;
  fatGramsPerHour: number;
  /** Total body weight drop speed right now while not eating (kg/second & g/hour). */
  bodyKgPerSecond: number;
  bodyGramsPerHour: number;
};

export type MealWeightImpact = {
  kcal: number;
  /** Marginal body weight added by this meal (grams, positive = weight added). */
  bodyGrams: number;
  /** Pure fat equivalent of this meal (grams). */
  fatGrams: number;
  /** Minutes of normal burn needed to offset this meal's calories. */
  burnMinutes: number;
};

export type Balance = {
  bmr: number;
  /** Full-day burn without exercise. */
  normal: number;
  active: number;
  /** normal + active, for the whole day. */
  burnDay: number;
  /** The food the plan projection assumes: the target until the day is closing. */
  intake: number;
  intakeFrom: "target" | "eaten";
  /** burnDay − intake (plan projection). Positive = deficit. */
  balance: number;
  /** Pure fat change in grams for the plan projection: positive = fat lost. */
  fatGrams: number;
  /** Total estimated body weight change in grams for the plan projection. */
  bodyGrams: number;
  /** Where things stand at this exact second (food eaten, burn pro-rated to the second). */
  soFar: {
    burn: number;
    /** Unrounded burn so far (for smooth per-second weight ticks). */
    burnExact: number;
    eaten: number;
    balance: number;
    /** Exact balance right now: burnExact − eaten. */
    balanceExact: number;
    weight: WeightDelta;
  };
  /** "Kalau tidak makan lagi hari ini": full-day burn minus what was eaten so far. */
  stopEating: WeightDelta & {
    /** Steady tissue weekly pace if every day repeated this balance (kg/week). */
    kgPerWeekBody: number;
    /** Pure fat weekly pace if every day repeated this balance (kg/week). */
    kgPerWeekFat: number;
  };
  /** "Kalau sisa makan sesuai target": full-day burn minus plan intake. */
  onPlan: WeightDelta;
  /** Continuous burn rate per second / minute / hour right now while not eating. */
  rate: BurnRate;
  /** The plan projected day, repeated for a week, in kg of pure fat (positive = lost). */
  kgPerWeek: number;
  /** The plan projected day, repeated for a week, in kg of sustainable body tissue. */
  bodyKgPerWeek: number;
};

const finite = (n: number) => Number.isFinite(n) && n >= 0;

/** Convert a same-day caloric balance (positive = deficit / weight lost) into
 *  total body weight change (fat + lean tissue + glycogen-bound water) and pure
 *  fat change. Smooth, strictly monotonic, and energy-conserving. */
export function weightChangeFromKcal(balanceKcal: number, anchorKg: number): WeightDelta {
  const kcal = Number.isFinite(balanceKcal) ? balanceKcal : 0;
  const kg = Number.isFinite(anchorKg) && anchorKg > 0 ? anchorKg : 70;
  const fatKg = kcal / KCAL_PER_KG_FAT;
  const glycogenKcal =
    GLYCOGEN_MAX_KCAL * Math.tanh((kcal * GLYCOGEN_SHARE) / GLYCOGEN_MAX_KCAL);
  // 1 g glycogen = 4 kcal and binds ~3 g water → 4 g total scale weight per 4 kcal = 1 g/kcal.
  const glycogenWaterGrams = glycogenKcal;
  const remainingKcal = kcal - glycogenKcal;
  const tissueGrams = (remainingKcal / KCAL_PER_KG_TISSUE) * 1000;
  const bodyGrams = tissueGrams + glycogenWaterGrams;
  const bodyKg = bodyGrams / 1000;
  const weightKg = kg - bodyKg;
  return {
    kcal,
    fatGrams: fatKg * 1000,
    tissueGrams,
    glycogenWaterGrams,
    bodyGrams,
    bodyKg,
    fatKg,
    weightKg,
  };
}

/** Exact instantaneous burn & body-weight loss rate while not eating, using
 *  the analytical derivative of `weightChangeFromKcal` at `currentBalanceKcal`. */
export function burnRatePerSecond(
  normalBurnDay: number,
  currentBalanceKcal = 0,
): BurnRate {
  const normal = finite(normalBurnDay) ? normalBurnDay : 0;
  const bal = Number.isFinite(currentBalanceKcal) ? currentBalanceKcal : 0;
  const kcalPerSecond = normal / SECONDS_PER_DAY;
  const t = Math.tanh((bal * GLYCOGEN_SHARE) / GLYCOGEN_MAX_KCAL);
  const dGlycogenDKcal = GLYCOGEN_SHARE * (1 - t * t);
  // kg of body weight per kcal at this balance point:
  const bodyKgPerKcal =
    dGlycogenDKcal / 1000 + (1 - dGlycogenDKcal) / KCAL_PER_KG_TISSUE;
  const bodyKgPerSecond = kcalPerSecond * bodyKgPerKcal;
  const fatKgPerSecond = kcalPerSecond / KCAL_PER_KG_FAT;
  return {
    kcalPerSecond,
    kcalPerMinute: kcalPerSecond * 60,
    kcalPerHour: kcalPerSecond * 3600,
    fatKgPerSecond,
    fatGramsPerHour: fatKgPerSecond * 3600 * 1000,
    bodyKgPerSecond,
    bodyGramsPerHour: bodyKgPerSecond * 3600 * 1000,
  };
}

/** Marginal weight & fat impact of a single meal, plus how long normal burn
 *  takes to offset its calories. */
export function mealWeightImpact(
  mealKcal: number,
  normalBurnDay: number,
  balanceBeforeKcal = 0,
): MealWeightImpact {
  const kcal = finite(mealKcal) ? mealKcal : 0;
  const normal = finite(normalBurnDay) ? normalBurnDay : 0;
  const before = weightChangeFromKcal(balanceBeforeKcal, 70);
  const after = weightChangeFromKcal(balanceBeforeKcal - kcal, 70);
  return {
    kcal: Math.round(kcal),
    // Eating reduces the deficit, so body weight increases by (before - after).
    bodyGrams: Math.max(0, before.bodyGrams - after.bodyGrams),
    fatGrams: (kcal / KCAL_PER_KG_FAT) * 1000,
    burnMinutes: normal > 0 ? Math.round((kcal / normal) * 1440) : 0,
  };
}

export function energyBalance(i: BalanceInput): Balance | null {
  if (!(i.kg > 20 && i.kg < 400 && i.cm > 100 && i.cm < 250 && i.age > 5 && i.age < 120)) return null;
  const bmr = mifflinBMR(i.sex, i.kg, i.cm, i.age);
  if (!(bmr > 0)) return null;
  const eaten = finite(i.eatenKcal) ? i.eatenKcal : 0;
  const active = finite(i.activeKcal) ? i.activeKcal : 0;
  const frac = Math.min(1, Math.max(0, Number.isFinite(i.dayFraction) ? i.dayFraction : 0));
  const normal = i.activeFromHealth && active > 0 ? bmr : bmr * SEDENTARY_FACTOR;
  const burnDay = normal + active;
  const closing = frac >= DAY_CLOSING;
  const intake = closing ? eaten : Math.max(eaten, finite(i.targetKcal) ? i.targetKcal : 0);
  const balance = burnDay - intake;
  const soFarBurn = normal * frac + active;
  const soFarBalance = soFarBurn - eaten;
  const stopBalance = burnDay - eaten;
  const onPlan = weightChangeFromKcal(balance, i.kg);
  const stopDelta = weightChangeFromKcal(stopBalance, i.kg);
  const soFarWeight = weightChangeFromKcal(soFarBalance, i.kg);
  const rate = burnRatePerSecond(normal, soFarBalance);
  return {
    bmr: Math.round(bmr),
    normal: Math.round(normal),
    active: Math.round(active),
    burnDay: Math.round(burnDay),
    intake: Math.round(intake),
    intakeFrom: closing ? "eaten" : "target",
    balance: Math.round(balance),
    fatGrams: Math.round(onPlan.fatGrams),
    bodyGrams: Math.round(onPlan.bodyGrams),
    soFar: {
      burn: Math.round(soFarBurn),
      burnExact: soFarBurn,
      eaten: Math.round(eaten),
      balance: Math.round(soFarBalance),
      balanceExact: soFarBalance,
      weight: soFarWeight,
    },
    stopEating: {
      ...stopDelta,
      kgPerWeekFat: Math.round(((stopBalance * 7) / KCAL_PER_KG_FAT) * 100) / 100,
      kgPerWeekBody: Math.round(((stopBalance * 7) / KCAL_PER_KG_TISSUE) * 100) / 100,
    },
    onPlan,
    rate,
    kgPerWeek: Math.round(((balance * 7) / KCAL_PER_KG_FAT) * 100) / 100,
    bodyKgPerWeek: Math.round(((balance * 7) / KCAL_PER_KG_TISSUE) * 100) / 100,
  };
}

/** Weeks to reach `targetKg` at today's pace, or null when the pace goes the
 *  wrong way or is too slow to mean anything. */
export function weeksToGoal(currentKg: number, targetKg: number, kgPerWeek: number): number | null {
  if (![currentKg, targetKg, kgPerWeek].every(Number.isFinite)) return null;
  const toLose = currentKg - targetKg;
  if (toLose <= 0 || kgPerWeek < 0.05) return null;
  const w = Math.ceil(toLose / kgPerWeek);
  return w > 104 ? null : w;
}

/** How much of the day has passed in China Standard Time (second-level precision). */
export function dayFractionCST(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const s = Number(parts.find((p) => p.type === "second")?.value ?? 0);
  return (h * 3600 + m * 60 + s) / SECONDS_PER_DAY;
}
