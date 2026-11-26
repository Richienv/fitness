// Motivation layer for Home: streaks, today's rings, the week strip, badge
// progress, the before/after of a log, and the one next action.
//
// Pure functions over plain records, so every number can be traced to a real
// meal, workout or weigh-in (see docs/plans/2026-11-20-motivation-home-design.md).
// The browser adapter that reads the stores lives in lib/motivationData.ts.
import { BADGE_BY_KEY } from "./badges.ts";
import type { MealType } from "./presets";
import type { WeighChange } from "./weighIn";

export type DayIntake = { kcal: number; protein: number };
export type DayTarget = { kcal: number; protein: number };
export type WorkoutRecord = {
  date: string;
  completed: boolean;
  /** At least one set with a weight above zero. */
  weighted: boolean;
};
export type MotivationInput = {
  /** YYYY-MM-DD in China Standard Time (lib/targets todayKey). */
  today: string;
  /** Meal totals per date. */
  intake: Record<string, DayIntake>;
  workouts: WorkoutRecord[];
  /** Dates with a logged weight. */
  weighIns: string[];
  /** The kcal/protein target the Makan page uses for that date. */
  target: (date: string) => DayTarget;
  /** Training day for that date (getDaily(date).gymDay). */
  isGymDay: (date: string) => boolean;
};
export type Streak = { count: number; todayDone: boolean };
export type WeekDay = {
  date: string;
  letter: string;
  isToday: boolean;
  isFuture: boolean;
  logged: boolean;
  protein: number;
  proteinTarget: number;
  proteinRatio: number;
  proteinHit: boolean;
  workout: boolean;
  planned: boolean;
};
export type BadgeKey = "consistent" | "protein" | "century" | "iron";
export type BadgeProgress = {
  key: BadgeKey;
  label: string;
  milestone: string;
  unit: string;
  progress: number;
  target: number;
};
export type Snapshot = {
  today: string;
  kcal: number;
  protein: number;
  kcalTarget: number;
  proteinTarget: number;
  meal: Streak;
  weigh: Streak;
  /** Counted in weeks; `todayDone` means this week already has a session. */
  workoutWeeks: Streak;
  workoutToday: boolean;
  gymToday: boolean;
  /** Days this week with a completed session (the strip shows days too). */
  weekWorkouts: number;
  weekPlanned: number;
  lastWeighIn: string | null;
  week: WeekDay[];
  badges: BadgeProgress[];
};

const DAY_MS = 86400000;
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + "T12:00:00Z") + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
function weekday(date: string): number {
  return new Date(Date.parse(date + "T12:00:00Z")).getUTCDay();
}
/** Monday of the week that holds `date`. */
export function weekStart(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

/** Consecutive days ending today. Today may still be empty without breaking
 *  the streak, the same rule as computeStreak in lib/hermes.ts. */
export function dailyStreak(
  hit: (date: string) => boolean,
  today: string,
  cap = 3650,
): Streak {
  const todayDone = hit(today);
  let count = todayDone ? 1 : 0;
  for (let i = 1; i < cap; i++) {
    if (!hit(addDays(today, -i))) break;
    count++;
  }
  return { count, todayDone };
}

/** Consecutive Monday-first weeks with at least one completed session. An
 *  empty current week does not break it, so rest days never reset anything. */
export function weeklyStreak(dates: string[], today: string): Streak {
  const weeks = new Set(dates.filter((d) => d <= today).map(weekStart));
  const current = weekStart(today);
  const todayDone = weeks.has(current);
  let count = todayDone ? 1 : 0;
  for (let w = addDays(current, -7); weeks.has(w); w = addDays(w, -7))
    count++;
  return { count, todayDone };
}

const LETTERS = ["S", "S", "R", "K", "J", "S", "M"]; // Senin … Minggu
const BADGE_ORDER: BadgeKey[] = ["consistent", "protein", "century", "iron"];

export function snapshot(input: MotivationInput): Snapshot {
  const { today, intake } = input;
  const logged = (d: string) => (intake[d]?.kcal ?? 0) > 0;
  const proteinMet = (d: string) => {
    const t = input.target(d).protein;
    return t > 0 && (intake[d]?.protein ?? 0) >= t;
  };
  const done = input.workouts.filter((w) => w.completed && w.date <= today);
  const workoutDays = new Set(done.map((w) => w.date));
  const weighDays = new Set(input.weighIns.filter((d) => d <= today));
  const meal = dailyStreak(logged, today);
  const monday = weekStart(today);
  const week: WeekDay[] = LETTERS.map((letter, i) => {
    const date = addDays(monday, i);
    const protein = intake[date]?.protein ?? 0;
    const proteinTarget = input.target(date).protein;
    return {
      date,
      letter,
      isToday: date === today,
      isFuture: date > today,
      logged: logged(date),
      protein,
      proteinTarget,
      proteinRatio:
        proteinTarget > 0 ? Math.min(1, protein / proteinTarget) : 0,
      proteinHit: proteinMet(date),
      workout: workoutDays.has(date),
      planned: input.isGymDay(date),
    };
  });
  const proteinDays = Object.keys(intake).filter(
    (d) => d <= today && proteinMet(d),
  ).length;
  const counts: Record<BadgeKey, number> = {
    consistent: meal.count,
    protein: proteinDays,
    century: done.length,
    iron: done.filter((w) => w.weighted).length,
  };
  const t = input.target(today);
  return {
    today,
    kcal: intake[today]?.kcal ?? 0,
    protein: intake[today]?.protein ?? 0,
    kcalTarget: t.kcal,
    proteinTarget: t.protein,
    meal,
    weigh: dailyStreak((d) => weighDays.has(d), today),
    workoutWeeks: weeklyStreak([...workoutDays], today),
    workoutToday: workoutDays.has(today),
    gymToday: input.isGymDay(today),
    weekWorkouts: new Set(
      done.filter((w) => w.date >= monday).map((w) => w.date),
    ).size,
    weekPlanned: week.filter((d) => d.planned).length,
    lastWeighIn: [...weighDays].sort().at(-1) ?? null,
    week,
    badges: BADGE_ORDER.map((key) => {
      const def = BADGE_BY_KEY[key];
      return {
        key,
        label: def.label,
        milestone: def.milestone,
        unit: def.unit,
        progress: counts[key],
        target: def.target,
      };
    }),
  };
}

export type StreakKey = "meal" | "workout" | "weigh";
export type StreakChange = {
  key: StreakKey;
  label: string;
  unit: string;
  from: number;
  to: number;
};
export type CelebrationKind = "meal" | "workout" | "weigh";
export type Celebration = {
  kind: CelebrationKind;
  added: DayIntake;
  before: Snapshot;
  after: Snapshot;
  proteinReached: boolean;
  streaks: StreakChange[];
  week: { from: number; to: number; planned: number } | null;
  badges: (BadgeProgress & { from: number; to: number })[];
  /** A weigh-in's own numbers (lib/weighIn.ts weighCelebration). */
  weigh?: WeighChange;
};

export const STREAK_LABEL: Record<StreakKey, { label: string; unit: string }> =
  {
    meal: { label: "Catat makan beruntun", unit: "hari" },
    workout: { label: "Latihan beruntun", unit: "minggu" },
    weigh: { label: "Timbang beruntun", unit: "hari" },
  };

/** What a log changed, computed from records right before and right after
 *  the save. Only values that actually moved are listed. */
export function celebrationDiff(
  before: Snapshot,
  after: Snapshot,
  kind: CelebrationKind,
): Celebration {
  const pairs: [StreakKey, Streak, Streak][] = [
    ["meal", before.meal, after.meal],
    ["workout", before.workoutWeeks, after.workoutWeeks],
    ["weigh", before.weigh, after.weigh],
  ];
  const round = (n: number) => Math.round(n);
  return {
    kind,
    added: {
      kcal: round(after.kcal - before.kcal),
      protein: round(after.protein - before.protein),
    },
    before,
    after,
    proteinReached:
      after.proteinTarget > 0 &&
      before.protein < before.proteinTarget &&
      after.protein >= after.proteinTarget,
    streaks: pairs
      .filter(([, a, b]) => b.count !== a.count)
      .map(([key, a, b]) => ({ key, ...STREAK_LABEL[key], from: a.count, to: b.count })),
    week:
      after.weekWorkouts !== before.weekWorkouts
        ? {
            from: before.weekWorkouts,
            to: after.weekWorkouts,
            planned: after.weekPlanned,
          }
        : null,
    badges: after.badges.flatMap((b) => {
      const from = before.badges.find((x) => x.key === b.key)?.progress ?? 0;
      return b.progress > from ? [{ ...b, from, to: b.progress }] : [];
    }),
  };
}

/** True when the log moved anything the sheet would count up. A 0 kcal
 *  log (water, creatine) or re-saving the same weight changes nothing, so it
 *  gets the plain toast. */
export function hasChanges(c: Celebration): boolean {
  return (
    !!c.weigh?.changed ||
    !!c.weigh?.levelChange ||
    c.added.kcal !== 0 ||
    c.added.protein !== 0 ||
    c.proteinReached ||
    c.week !== null ||
    c.streaks.length > 0 ||
    c.badges.length > 0
  );
}

type SlotRecord = { date: string; mealType: MealType; items: unknown[] };
/** The meal slot that gained food between two lists for one date. */
export function addedMealType(
  before: SlotRecord[],
  after: SlotRecord[],
  date: string,
): MealType | null {
  const count = (list: SlotRecord[], t: MealType) =>
    list
      .filter((m) => m.date === date && m.mealType === t)
      .reduce((n, m) => n + (m.items?.length ?? 0), 0);
  const types: MealType[] = ["breakfast", "lunch", "snack", "dinner"];
  return types.find((t) => count(after, t) > count(before, t)) ?? null;
}

/** Same windows as the Makan page, which opens its builder at this slot. */
export function mealSlotForHour(hour: number): MealType {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 18) return "snack";
  return "dinner";
}
export const SLOT_NAME: Record<MealType, string> = {
  breakfast: "sarapan",
  lunch: "makan siang",
  snack: "camilan",
  dinner: "makan malam",
};

export type NextActionKey =
  | "resume"
  | "weigh"
  | "usual"
  | "meal"
  | "workout"
  | "protein"
  | "done";
export type NextAction = {
  key: NextActionKey;
  title: string;
  hint: string;
  href: string;
};
export type NextActionContext = {
  /** Local hour on the device, as the Makan page uses. */
  hour: number;
  activeWorkoutId: string | null;
  /** The meal slot for `hour` already has food today. */
  slotLogged: boolean;
  /** The avatar goal is a weight trend. */
  weightGoal: boolean;
  /** The meal he usually eats in this slot (lib/usualMeal.ts), if any. */
  usual?: { label: string; kcal: number; protein: number; days: number } | null;
};

/** One obvious next step, in a fixed order (design note, section 3). */
export function nextAction(s: Snapshot, ctx: NextActionContext): NextAction {
  const proteinLeft = Math.max(0, Math.round(s.proteinTarget - s.protein));
  if (ctx.activeWorkoutId)
    return {
      key: "resume",
      title: "Lanjut latihan",
      hint: "Sesi tadi masih terbuka",
      href: `/workout/session/${ctx.activeWorkoutId}`,
    };
  const weighsLately =
    s.lastWeighIn !== null && s.lastWeighIn >= addDays(s.today, -14);
  const morning = ctx.hour >= 4 && ctx.hour < 11;
  if (morning && !s.weigh.todayDone && (ctx.weightGoal || weighsLately))
    return {
      key: "weigh",
      title: "Timbang pagi ini",
      hint:
        s.weigh.count > 0
          ? `Timbang beruntun jadi ${s.weigh.count + 1} hari`
          : "Tren berat butuh 3 timbangan seminggu",
      href: "/dashboard/progress",
    };
  // Sarapan, makan siang and makan malam lead; a snack is optional, so an
  // empty snack slot never outranks the training day.
  const slot = mealSlotForHour(ctx.hour);
  if (!ctx.slotLogged && slot !== "snack" && ctx.usual) {
    const name = SLOT_NAME[slot];
    return {
      key: "usual",
      title: `${name[0].toUpperCase()}${name.slice(1)} biasa`,
      hint: `${ctx.usual.label} · ${Math.round(ctx.usual.kcal).toLocaleString("id-ID")} kkal · ${Math.round(ctx.usual.protein)} g protein`,
      href: "/meal?add=1",
    };
  }
  if (!ctx.slotLogged && slot !== "snack") {
    return {
      key: "meal",
      title: `Catat ${SLOT_NAME[slot]}`,
      hint:
        s.meal.count > 0 && !s.meal.todayDone
          ? `Catat makan beruntun jadi ${s.meal.count + 1} hari`
          : proteinLeft >= 10
            ? `${proteinLeft} g protein lagi hari ini`
            : "Biar catatan hari ini lengkap",
      href: "/meal?add=1",
    };
  }
  if (s.gymToday && !s.workoutToday) {
    const n = s.weekWorkouts + 1;
    return {
      key: "workout",
      title: "Mulai latihan",
      hint:
        s.weekPlanned >= n
          ? `Latihan ke-${n} dari ${s.weekPlanned} minggu ini`
          : `Latihan ke-${n} minggu ini`,
      href: "/workout",
    };
  }
  if (proteinLeft >= 10)
    return {
      key: "protein",
      title: "Catat makan",
      hint: `${proteinLeft} g protein lagi hari ini`,
      href: "/meal?add=1",
    };
  return {
    key: "done",
    title: "Lihat progres",
    hint: "Hari ini sudah lengkap. Istirahat yang cukup.",
    href: "/companion",
  };
}
