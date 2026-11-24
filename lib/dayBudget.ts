// How training changes what you can eat today. Pure: no storage.
//
// The daily targets already carry a typical amount of training: the gym-day
// target is the rest-day target plus ~300 kcal (see computeDayTargets), and
// both come from BMR × an activity multiplier. Adding the whole burn on top
// would count the same exercise twice. So the rule is:
//
//   earned  = rest-day target + eatBack × active burn
//   bonus   = how far `earned` goes beyond today's own target (never below 0)
//
// A normal gym day (burn ≈ what the +300 assumes) adds nothing; a harder day,
// or cardio on a rest day, adds up to `eatBack` of the extra burn. The extra
// goes to carbs, like the gym/rest carb cycle. `eatBack` is a choice (0 turns
// it off) because the burn numbers are estimates, ±20–30 %.
import type { MacroTarget } from "./settings";

export const EAT_BACK_OPTIONS = [0, 0.5, 0.75] as const;
export type EatBack = (typeof EAT_BACK_OPTIONS)[number];
export const DEFAULT_EAT_BACK: EatBack = 0.5;
/** Never add more than this many kcal in a day, whatever the estimate says. */
export const MAX_BONUS_KCAL = 600;

export function normalizeEatBack(v: unknown): EatBack {
  return (EAT_BACK_OPTIONS as readonly number[]).includes(v as number)
    ? (v as EatBack)
    : DEFAULT_EAT_BACK;
}

export type AdjustedTarget = {
  /** What to show and compare against: base plus bonus. */
  target: MacroTarget;
  /** The day's own target before any adjustment. */
  base: MacroTarget;
  /** Extra kcal earned from training today (0 when none). */
  bonusKcal: number;
  burnKcal: number;
  eatBack: EatBack;
};

export function adjustTarget(args: {
  base: MacroTarget;
  rest: MacroTarget;
  burnKcal: number;
  eatBack: number;
}): AdjustedTarget {
  const eatBack = normalizeEatBack(args.eatBack);
  const burn = Number.isFinite(args.burnKcal) && args.burnKcal > 0 ? args.burnKcal : 0;
  const earned = args.rest.kcal + eatBack * burn;
  const raw = eatBack > 0 ? earned - args.base.kcal : 0;
  const bonus = Math.min(MAX_BONUS_KCAL, Math.max(0, Math.round(raw / 10) * 10));
  return {
    target: bonus
      ? {
          kcal: args.base.kcal + bonus,
          protein: args.base.protein,
          carbs: args.base.carbs + Math.round(bonus / 4),
          fat: args.base.fat,
        }
      : args.base,
    base: args.base,
    bonusKcal: bonus,
    burnKcal: burn,
    eatBack,
  };
}
