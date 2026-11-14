"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getMealsForDate, isCustomItem, type MealLog } from "@/lib/store";
import { macrosFor } from "@/lib/ingredients";
import { getAllMeasurements, type Measurement } from "@/lib/measurements";
import {
  getActiveWorkoutId,
  getAllWorkouts,
  type WorkoutSession,
} from "@/lib/workouts";
import { todayKey } from "@/lib/targets";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import { readCompanion, type CompanionSettings } from "@/lib/companionSettings";
import { companionProgress, weightSummary } from "@/lib/companionProgress";
import AvatarPlayer from "./AvatarPlayer";
import Icon from "../ui/Icon";
export default function HomePage() {
  const { data: session } = useSession();
  const [meals, setMeals] = useState<MealLog[]>([]),
    [measurements, setMeasurements] = useState<Measurement[]>([]),
    [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [settings, setSettings] = useState<CompanionSettings>({
      character: "richie",
      goal: null,
    }),
    [active, setActive] = useState<string | null>(null),
    [date, setDate] = useState("");
  const refresh = useCallback(() => {
    const d = todayKey();
    setDate(d);
    setMeals(getMealsForDate(d));
    setMeasurements(getAllMeasurements());
    setWorkouts(getAllWorkouts());
    setActive(getActiveWorkoutId());
    setSettings(readCompanion(session?.user?.name));
  }, [session?.user?.name]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [refresh]);
  useSoftRefresh(refresh);
  const totals = useMemo(
    () =>
      meals
        .flatMap((m) => m.items)
        .reduce(
          (a, i) => {
            const n = isCustomItem(i) ? i : macrosFor(i.id, i.qty);
            return { kcal: a.kcal + n.kcal, protein: a.protein + n.protein };
          },
          { kcal: 0, protein: 0 },
        ),
    [meals],
  );
  const weight = date
    ? weightSummary(measurements, date)
    : { latest: null, mean: null, count: 0 };
  const progress = date
    ? companionProgress(settings.goal, measurements, workouts, date)
    : { level: null, fraction: null };
  const name = session?.user?.name?.split(" ")[0] || "Akunmu";
  return (
    <main className="lean-home">
      <h1 className="companion-sr-only">R2 Fit — hari ini</h1>
      <header className="lean-header">
        <Link href="/" className="friendly-brand">
          r2<span>fit</span>
        </Link>
        <Link href="/settings" className="account-link">
          {name}
          <Icon name="settings" size={19} />
        </Link>
      </header>
      <section className="home-avatar">
        <AvatarPlayer
          character={settings.character}
          level={progress.level ?? 1}
        />
        <div className="avatar-status">
          <Link href="/companion">
            {settings.character === "richie" ? "Richie" : "Renita"}{" "}
            <span>⌄</span>
          </Link>
          <Link href="/companion#goals">
            {progress.level
              ? `Level ${progress.level} / 12`
              : settings.goal
                ? "Menunggu tren"
                : "Atur target"}
          </Link>
        </div>
      </section>
      <div className="lean-facts">
        <Link href="/dashboard/progress">
          <span>{weight.mean !== null ? "Tren berat" : "Berat terakhir"}</span>
          <strong>
            {weight.mean !== null
              ? weight.mean.toFixed(1)
              : (weight.latest?.weightKg?.toFixed(1) ?? "—")}
            <small> kg</small>
          </strong>
        </Link>
        <Link href="/meal">
          <span>Tercatat</span>
          <strong>
            {Math.round(totals.kcal).toLocaleString("id-ID")}
            <small> kcal</small>
          </strong>
        </Link>
        <Link href="/meal">
          <span>Protein</span>
          <strong>
            {Math.round(totals.protein)}
            <small> g</small>
          </strong>
        </Link>
      </div>
      <div className="lean-actions">
        <Link href="/meal?add=1">
          <Icon name="plus" />
          Catat makan
        </Link>
        <Link href={active ? `/workout/session/${active}` : "/workout"}>
          <Icon name="workout" />
          {active ? "Lanjut latihan" : "Mulai latihan"}
        </Link>
      </div>
      <Link href="/dashboard/progress" className="lean-weight">
        Catat berat <Icon name="plus" size={16} />
      </Link>
      <section className="lean-today">
        <div className="row-between">
          <h2>Hari ini</h2>
          <Link href="/meal">Lihat semua</Link>
        </div>
        {meals.length === 0 ? (
          <Link className="empty-meal" href="/meal?add=1">
            Belum ada makanan tercatat <Icon name="plus" size={17} />
          </Link>
        ) : (
          meals.slice(-3).map((m) => (
            <Link className="lean-record" key={m.id} href="/meal">
              <span>
                {
                  {
                    breakfast: "Sarapan",
                    lunch: "Makan siang",
                    snack: "Snack",
                    dinner: "Makan malam",
                  }[m.mealType]
                }
                <small>{m.items.length} item</small>
              </span>
              <strong>
                {Math.round(
                  m.items.reduce(
                    (s, i) =>
                      s +
                      (isCustomItem(i) ? i.kcal : macrosFor(i.id, i.qty).kcal),
                    0,
                  ),
                )}{" "}
                <small>kcal</small>
              </strong>
            </Link>
          ))
        )}
      </section>
      <Link href="/companion" className="duo-link">
        <img
          src="/avatars/v2/duo-poster.webp"
          alt="Richie dan Renita"
          width={64}
          height={64}
        />
        <span>Richie & Renita</span>
        <Icon name="arrow" size={18} />
      </Link>
    </main>
  );
}
