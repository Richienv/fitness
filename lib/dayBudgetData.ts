"use client";
// Today's calorie target as the app should show it: the day's own target, plus
// what training earned (lib/dayBudget). Every screen that used
// `gymDay ? TARGETS.gymDay : TARGETS.restDay` reads this instead, so the home
// ring, Makan, the dashboards and the widget all agree.
import { burnReader } from "./burnData";
import { adjustTarget, normalizeEatBack, type AdjustedTarget } from "./dayBudget";
import { getSettings } from "./settings";
import { getDaily } from "./store";
import { TARGETS } from "./targets";

export function readEatBack(): number {
  return normalizeEatBack(getSettings().exerciseEatBack);
}

/**
 * The target for `date`. `gymDay` overrides the stored day type (Makan lets
 * you flip it and re-renders before it is saved); `burnKcal` overrides the
 * stored burn (a caller that already has a reader for many days).
 */
export function dayTarget(
  date: string,
  opts: { gymDay?: boolean; burnKcal?: number; eatBack?: number } = {},
): AdjustedTarget {
  const gymDay = opts.gymDay ?? getDaily(date).gymDay;
  const base = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const eatBack = opts.eatBack ?? readEatBack();
  const burn = opts.burnKcal ?? (eatBack > 0 ? burnReader()(date).total : 0);
  return adjustTarget({ base, rest: TARGETS.restDay, burnKcal: burn, eatBack });
}

/** The same, for many days: reads the stores once. */
export function dayTargetReader(): (date: string, gymDay?: boolean) => AdjustedTarget {
  const eatBack = readEatBack();
  const burn = eatBack > 0 ? burnReader() : null;
  return (date, gymDay) =>
    dayTarget(date, { gymDay, eatBack, burnKcal: burn ? burn(date).total : 0 });
}
