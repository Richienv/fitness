// Today's energy balance and what it means for body fat. Pure: no storage.
//
//   burn today = normal burn (what the body spends without exercise)
//              + active burn (Latihan: Apple Health, or the estimates)
//   balance    = burn − food          (positive = deficit)
//   fat change = balance / 7,700 kcal per kg
//
// "Normal burn" is Mifflin-St Jeor BMR (sex-aware, so Richie and Renita each get
// their own) × 1.2 when no watch data exists (BMR plus the light movement of an
// ordinary day). With Apple Health, the watch's active energy already includes
// that everyday movement, so only the BMR is added to it.
//
// Honest limits, shown in the UI: it is fat, not scale weight (water and food in
// the gut swing the scale by ±1 kg a day), and every input is an estimate.
import { mifflinBMR } from "./energy.ts";

export const KCAL_PER_KG_FAT = 7700;
/** BMR × this = a day without exercise (desk, errands). */
export const SEDENTARY_FACTOR = 1.2;
/** From this fraction of the day on, the projection uses what was eaten. */
export const DAY_CLOSING = 0.9;

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
  /** 0..1, how much of the day (China Standard Time) has passed. */
  dayFraction: number;
};

export type Balance = {
  bmr: number;
  /** Full-day burn without exercise. */
  normal: number;
  active: number;
  /** normal + active, for the whole day. */
  burnDay: number;
  /** The food the projection assumes: the target until the day is closing. */
  intake: number;
  intakeFrom: "target" | "eaten";
  /** burnDay − intake. Positive = deficit. */
  balance: number;
  /** Fat change in grams: positive = fat lost, negative = gained. */
  fatGrams: number;
  /** Where things stand right now (food eaten, burn pro-rated). */
  soFar: { burn: number; eaten: number; balance: number };
  /** The projected day, repeated for a week, in kg of fat (positive = lost). */
  kgPerWeek: number;
};

const finite = (n: number) => Number.isFinite(n) && n >= 0;

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
  return {
    bmr: Math.round(bmr),
    normal: Math.round(normal),
    active: Math.round(active),
    burnDay: Math.round(burnDay),
    intake: Math.round(intake),
    intakeFrom: closing ? "eaten" : "target",
    balance: Math.round(balance),
    fatGrams: Math.round((balance / KCAL_PER_KG_FAT) * 1000),
    soFar: {
      burn: Math.round(soFarBurn),
      eaten: Math.round(eaten),
      balance: Math.round(soFarBurn - eaten),
    },
    kgPerWeek: Math.round(((balance * 7) / KCAL_PER_KG_FAT) * 100) / 100,
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

/** How much of the day has passed in China Standard Time. */
export function dayFractionCST(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h * 60 + m) / 1440;
}
