"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { macrosFor, type Macros } from "@/lib/ingredients";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import {
  dedupeMeals,
  getAllMeals,
  getDaily,
  getMealsForDate,
  isCustomItem,
  setDaily,
  type MealItem,
  type MealLog,
} from "@/lib/store";
import { TARGETS, todayKey } from "@/lib/targets";
import {
  getSession,
  getTodaysWorkout,
  recommendedSessionFor,
  type WorkoutSession,
} from "@/lib/workouts";
import { haptic } from "@/lib/haptics";
import Icon from "./ui/Icon";
import NutritionSummary from "./meal/NutritionSummary";
import MorningScene from "./meal/MorningScene";
const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
function sumMealItems(items: MealItem[]): Macros {
  return items.reduce<Macros>(
    (a, it) => {
      const m = isCustomItem(it)
        ? { kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat }
        : macrosFor(it.id, it.qty);
      return {
        kcal: a.kcal + m.kcal,
        protein: a.protein + m.protein,
        carbs: a.carbs + m.carbs,
        fat: a.fat + m.fat,
      };
    },
    { ...EMPTY },
  );
}

/** Consecutive days (back from today) with at least one meal logged.
 *  Today with nothing logged yet doesn't break the streak (grace). */
function dayStreak(allMeals: MealLog[], todayStr: string): number {
  const logged = new Set(allMeals.map((m) => m.date));
  const [y, mo, d] = todayStr.split("-").map(Number);
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    dt.setUTCDate(dt.getUTCDate() - i);
    const key = dt.toISOString().slice(0, 10);
    if (logged.has(key)) streak++;
    else if (i === 0)
      continue; // today not logged yet — grace
    else break;
  }
  return streak;
}

/** Exercise-level progress for today's push/pull/etc session. */
function sessionProgress(
  workout: WorkoutSession | null,
  fallbackId: string,
): { done: number; total: number; complete: boolean } {
  const def = getSession(workout?.sessionType ?? fallbackId);
  if (!workout) {
    return { done: 0, total: def?.exercises.length ?? 6, complete: false };
  }
  const total = def?.exercises.length ?? workout.exercises.length;
  let done = 0;
  workout.exercises.forEach((ex, i) => {
    const need = def?.exercises[i]?.sets ?? 0;
    if (need > 0 ? ex.sets.length >= need : ex.sets.length > 0) done++;
  });
  return { done, total, complete: workout.completed };
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [gymDay, setGymDay] = useState(true);
  const [streak, setStreak] = useState(0);

  const reloadFromStore = useCallback(() => {
    dedupeMeals();
    const today = todayKey();
    setMeals(getMealsForDate(today));
    setWorkout(getTodaysWorkout(today));
    setGymDay(getDaily(today).gymDay);
    setStreak(dayStreak(getAllMeals(), today));
  }, []);
  useSoftRefresh(reloadFromStore);

  useEffect(() => {
    setMounted(true);
    reloadFromStore();
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [reloadFromStore]);

  const greeting = !mounted
    ? "Selamat datang"
    : now.getHours() < 11
      ? "Selamat pagi"
      : now.getHours() < 15
        ? "Selamat siang"
        : now.getHours() < 18
          ? "Selamat sore"
          : "Selamat malam";

  const totals: Macros = useMemo(
    () =>
      meals.reduce<Macros>(
        (a, m) => {
          const s = sumMealItems(m.items);
          return {
            kcal: a.kcal + s.kcal,
            protein: a.protein + s.protein,
            carbs: a.carbs + s.carbs,
            fat: a.fat + s.fat,
          };
        },
        { ...EMPTY },
      ),
    [meals],
  );

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;

  const recommendedId = useMemo(() => recommendedSessionFor(now), [now]);
  const sess = sessionProgress(workout, recommendedId);
  const sessName =
    getSession(workout?.sessionType ?? recommendedId)?.name ?? "LATIHAN";

  function toggleGym(next: boolean) {
    if (next === gymDay) return;
    haptic("tap");
    setGymDay(next);
    const today = todayKey();
    const cur = getDaily(today);
    setDaily({ date: today, gymDay: next, checklist: cur.checklist ?? {} });
  }

  return (
    <main className="friendly-page home-page">
      <header className="page-top">
        <Link href="/" className="friendly-brand">
          r2<span>fit</span>
        </Link>
        <Link className="soft-button" href="/settings">
          <Icon name="settings" />
          Pengaturan
        </Link>
      </header>
      <section className="friendly-greeting">
        <div>
          <p className="eyebrow">
            {mounted
              ? now.toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : "Hari ini"}
          </p>
          <h1>{greeting}.</h1>
          <p>Langkah kecil, kebiasaan baik.</p>
        </div>
        <MorningScene />
      </section>
      <div className="row-between">
        <h2>Hari ini</h2>
        <div className="segment">
          <button aria-pressed={gymDay} onClick={() => toggleGym(true)}>
            Latihan
          </button>
          <button aria-pressed={!gymDay} onClick={() => toggleGym(false)}>
            Istirahat
          </button>
        </div>
      </div>
      <section className="daily-nutrition">
        <NutritionSummary
          values={totals}
          caption="Nutrisi yang sudah dicatat"
        />
        <div className="calorie-budget">
          <div className="row-between">
            <span>
              {Math.max(
                0,
                Math.round(target.kcal - totals.kcal),
              ).toLocaleString("id-ID")}{" "}
              kkal tersisa
            </span>
            <span>Target {target.kcal.toLocaleString("id-ID")}</span>
          </div>
          <progress
            value={Math.min(totals.kcal, target.kcal)}
            max={target.kcal}
            aria-label="Kalori tercatat dari target harian"
          />
        </div>
      </section>
      <Link href="/meal" className="home-primary">
        <span className="action-icon">
          <Icon name="meal" size={26} />
        </span>
        <span>
          <strong>Catat makan</strong>
          <small>Cari makanan, racik, atau scan barcode</small>
        </span>
        <Icon name="arrow" />
      </Link>
      <div className="home-secondary">
        <Link href="/workout">
          <Icon name="workout" />
          <span>
            <strong>
              {sess.complete ? "Latihan selesai" : "Latihan hari ini"}
            </strong>
            <small>
              {gymDay
                ? `${sess.done}/${sess.total} gerakan · ${sessName.toLocaleLowerCase("id-ID")}`
                : "Hari istirahat · pemulihan aktif"}
            </small>
          </span>
          <Icon name="arrow" />
        </Link>
        <Link href="/sleep">
          <Icon name="sleep" />
          <span>
            <strong>Catat tidur</strong>
            <small>Target 8 jam untuk pemulihan</small>
          </span>
          <Icon name="arrow" />
        </Link>
      </div>
      <p className="home-streak">
        {streak > 0
          ? `${streak} hari mencatat makan. Pertahankan ritmenya.`
          : "Mulai dengan makanan pertama hari ini."}
      </p>
    </main>
  );
}
