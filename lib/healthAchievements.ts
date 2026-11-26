// Evidence-based health achievements that unlock clean stage backgrounds.
// Criteria are grounded in WHO / AHA / ISSN / NASEM / ACSM guidelines rather
// than scale weight alone, rewarding daily nutrition, hydration, training, and
// mutual consistency. Pure module (zero browser/DB imports) for fast testing.

import type { StageBackgroundId } from "./stageBackgrounds.ts";

export type DailyAchievementNutrition = {
  date: string;
  kcal: number;
  protein: number;
  fat: number;
  sugar: number;
  hasFood: boolean;
};

export type WorkoutAchievementDay = {
  date: string;
  completed?: boolean;
};

export type HealthAchievementKey =
  | "sugar_3d"
  | "fat_5d"
  | "protein_3d"
  | "water_3d"
  | "workout_3w"
  | "kcal_5d"
  | "streak_7d"
  | "couple_energy";

export type HealthAchievementDef = {
  key: HealthAchievementKey;
  title: string;
  description: string;
  scienceNote: string;
  unitLabel: string;
  target: number;
  stageId: StageBackgroundId;
};

export type HealthAchievementProgress = HealthAchievementDef & {
  current: number;
  best: number;
  pct: number;
  unlocked: boolean;
};

export const HEALTH_ACHIEVEMENTS: readonly HealthAchievementDef[] = [
  {
    key: "sugar_3d",
    title: "Kontrol Gula",
    description: "Gula harian < 25 g selama 3 hari beruntun",
    scienceNote: "AHA/WHO: batasi gula tambahan ≤ 25 g/hari untuk stabilkan insulin & energi.",
    unitLabel: "hari",
    target: 3,
    stageId: "jade-zen",
  },
  {
    key: "fat_5d",
    title: "Lemak Terjaga",
    description: "Lemak harian ≤ 50 g selama 5 hari beruntun",
    scienceNote: "Keseimbangan lemak sehat membantu menjaga defisit tanpa mengorbankan hormon.",
    unitLabel: "hari",
    target: 5,
    stageId: "nordic-mist",
  },
  {
    key: "protein_3d",
    title: "Pelindung Otot",
    description: "Protein ≥ 85% target selama 3 hari beruntun",
    scienceNote: "ISSN: asupan protein tinggi menjaga massa otot & rasa kenyang saat cut.",
    unitLabel: "hari",
    target: 3,
    stageId: "golden-dawn",
  },
  {
    key: "water_3d",
    title: "Hidrasi Optimal",
    description: "Minum ≥ 2.000 ml air selama 3 hari beruntun",
    scienceNote: "Hidrasi cukup mendukung termogenesis, fokus, dan pemulihan otot.",
    unitLabel: "hari",
    target: 3,
    stageId: "ocean-glass",
  },
  {
    key: "workout_3w",
    title: "Momentum Latihan",
    description: "Minimal 3 sesi latihan dalam 7 hari terakhir",
    scienceNote: "WHO/ACSM: 3+ sesi resistance/kardio mingguan memicu adaptasi metabolik.",
    unitLabel: "sesi",
    target: 3,
    stageId: "ember-forge",
  },
  {
    key: "kcal_5d",
    title: "Disiplin Kalori",
    description: "Kalori harian di rentang sehat (50% s/d +150 kkal) 5 hari",
    scienceNote: "Konsistensi moderat mencegah metabolisme melambat & rebound nafsu makan.",
    unitLabel: "hari",
    target: 5,
    stageId: "aurora-horizon",
  },
  {
    key: "streak_7d",
    title: "7 Hari Konsisten",
    description: "Catat makanan 7 hari dalam 10 hari terakhir",
    scienceNote: "Self-monitoring harian adalah prediktor terkuat keberhasilan jangka panjang.",
    unitLabel: "hari",
    target: 7,
    stageId: "starlight-peak",
  },
  {
    key: "couple_energy",
    title: "Kompak Berdua",
    description: "Terhubung dengan pasangan & catat progres 3 hari",
    scienceNote: "Dukungan pasangan meningkatkan kepatuhan kebiasaan sehat hingga 2×.",
    unitLabel: "hari",
    target: 3,
    stageId: "sakura-loft",
  },
];

const DAY_MS = 86_400_000;

function shiftDate(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/** Count active and max consecutive-day streaks ending at `today` (or `today - 1`
 *  so an unfinished today never wipes out an active streak built through yesterday). */
function computeConsecutiveStreak(
  qualifyingDates: Set<string>,
  today: string,
  lookbackDays = 60,
): { active: number; max: number } {
  const start = shiftDate(today, -lookbackDays);
  let running = 0;
  let max = 0;
  let active = 0;

  // Walk chronologically from start..today
  for (let i = lookbackDays; i >= 0; i--) {
    const d = shiftDate(today, -i);
    if (d < start) continue;
    if (qualifyingDates.has(d)) {
      running++;
      if (running > max) max = running;
    } else {
      // Allow today itself to still be in progress without breaking active display,
      // but earlier gaps reset running streak.
      if (d !== today) {
        running = 0;
      }
    }
    if (i === 0) active = running;
  }

  return { active, max };
}

export type EvaluateAchievementsInput = {
  today: string;
  dailyNutrition: DailyAchievementNutrition[];
  workouts: WorkoutAchievementDay[];
  waterByDate: Record<string, number>;
  kcalTarget: number;
  proteinTarget: number;
  fatTarget?: number;
  hasPartnerActivity?: boolean;
  previouslyEarnedKeys?: ReadonlySet<string> | readonly string[];
};

export function evaluateHealthAchievements(
  input: EvaluateAchievementsInput,
): {
  items: HealthAchievementProgress[];
  unlockedKeys: Set<HealthAchievementKey>;
  unlockedStageIds: Set<StageBackgroundId>;
} {
  const {
    today,
    dailyNutrition,
    workouts,
    waterByDate,
    kcalTarget,
    proteinTarget,
    fatTarget,
    hasPartnerActivity = false,
  } = input;

  const earnedSet = new Set<string>(input.previouslyEarnedKeys ?? []);
  const byDate = new Map<string, DailyAchievementNutrition>();
  for (const row of dailyNutrition) {
    if (row.date <= today) byDate.set(row.date, row);
  }

  // Meaningful logged days prevent empty 0-kcal days from faking low sugar / low fat.
  const sugarDates = new Set<string>();
  const fatDates = new Set<string>();
  const proteinDates = new Set<string>();
  const kcalDates = new Set<string>();
  const loggedDatesLast10 = new Set<string>();
  const loggedDatesAny = new Set<string>();

  const minRealKcal = 250;
  const effectiveFatCap = fatTarget && fatTarget > 0 ? Math.max(50, Math.round(fatTarget)) : 50;
  const minProtein = proteinTarget > 0 ? proteinTarget * 0.85 : 70;
  const minKcal = kcalTarget > 0 ? kcalTarget * 0.5 : 800;
  const maxKcal = kcalTarget > 0 ? kcalTarget + 150 : 2500;
  const tenDaysAgo = shiftDate(today, -9);

  for (const [d, n] of byDate.entries()) {
    if (!n.hasFood || n.kcal < minRealKcal) continue;
    loggedDatesAny.add(d);
    if (d >= tenDaysAgo) loggedDatesLast10.add(d);
    if (n.sugar < 25) sugarDates.add(d);
    if (n.fat <= effectiveFatCap) fatDates.add(d);
    if (n.protein >= minProtein) proteinDates.add(d);
    if (n.kcal >= minKcal && n.kcal <= maxKcal) kcalDates.add(d);
  }

  const waterDates = new Set<string>();
  for (const [d, ml] of Object.entries(waterByDate)) {
    if (d <= today && typeof ml === "number" && ml >= 2000) {
      waterDates.add(d);
    }
  }

  const sevenDaysAgo = shiftDate(today, -6);
  const completedWorkoutDates = new Set<string>();
  let workoutsLast7 = 0;
  for (const w of workouts) {
    if (w.completed === false) continue;
    if (w.date > today) continue;
    completedWorkoutDates.add(w.date);
    if (w.date >= sevenDaysAgo) workoutsLast7++;
  }

  const activeOrMax = (dates: Set<string>, target: number) => {
    const s = computeConsecutiveStreak(dates, today);
    return {
      current: Math.min(target, s.active),
      best: s.max,
    };
  };

  const sugarStats = activeOrMax(sugarDates, 3);
  const fatStats = activeOrMax(fatDates, 5);
  const proteinStats = activeOrMax(proteinDates, 3);
  const waterStats = activeOrMax(waterDates, 3);
  const kcalStats = activeOrMax(kcalDates, 5);
  const activeLoggedTotal = loggedDatesAny.size;

  const metricForKey = (
    key: HealthAchievementKey,
  ): { current: number; best: number; target: number } => {
    switch (key) {
      case "sugar_3d":
        return { ...sugarStats, target: 3 };
      case "fat_5d":
        return { ...fatStats, target: 5 };
      case "protein_3d":
        return { ...proteinStats, target: 3 };
      case "water_3d":
        return { ...waterStats, target: 3 };
      case "workout_3w":
        return {
          current: Math.min(3, workoutsLast7),
          best: Math.max(workoutsLast7, completedWorkoutDates.size >= 3 ? 3 : workoutsLast7),
          target: 3,
        };
      case "kcal_5d":
        return { ...kcalStats, target: 5 };
      case "streak_7d":
        return {
          current: Math.min(7, loggedDatesLast10.size),
          best: Math.min(7, loggedDatesAny.size),
          target: 7,
        };
      case "couple_energy": {
        const cur = hasPartnerActivity ? Math.min(3, loggedDatesLast10.size) : 0;
        const best = hasPartnerActivity ? Math.min(3, activeLoggedTotal) : 0;
        return { current: cur, best, target: 3 };
      }
    }
  };

  const unlockedKeys = new Set<HealthAchievementKey>();
  const unlockedStageIds = new Set<StageBackgroundId>(["clean-studio"]);

  const items: HealthAchievementProgress[] = HEALTH_ACHIEVEMENTS.map((def) => {
    const m = metricForKey(def.key);
    const unlocked = m.best >= def.target || earnedSet.has(def.key);
    const current = unlocked ? def.target : Math.min(def.target, m.current);
    const pct = Math.max(0, Math.min(1, current / def.target));
    if (unlocked) {
      unlockedKeys.add(def.key);
      unlockedStageIds.add(def.stageId);
    }
    return {
      ...def,
      current,
      best: Math.max(m.best, unlocked ? def.target : m.current),
      pct,
      unlocked,
    };
  });

  // Unused constant guard keep clean
  void DAY_MS;

  return { items, unlockedKeys, unlockedStageIds };
}
