"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { useSession } from "next-auth/react";
import { getMealsForDate, isCustomItem, type MealLog } from "@/lib/store";
import { macrosFor } from "@/lib/ingredients";
import {
  getAllMeasurements,
  saveMeasurement,
  type Measurement,
} from "@/lib/measurements";
import {
  getActiveWorkoutId,
  getAllWorkouts,
  type WorkoutSession,
} from "@/lib/workouts";
import { todayKey } from "@/lib/targets";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import { readCompanion, type CompanionSettings } from "@/lib/companionSettings";
import { companionProgress, weightSummary } from "@/lib/companionProgress";
import {
  hasChanges,
  mealSlotForHour,
  nextAction,
  type Celebration,
  type Snapshot,
} from "@/lib/motivation";
import { readSnapshot } from "@/lib/motivationData";
import { weighCelebration, weighContext, type WeighIn } from "@/lib/weighIn";
import { haptic } from "@/lib/haptics";
import { toast } from "../Toast";
import ProgressCelebration from "../_motion/ProgressCelebration";
import AvatarPlayer from "./AvatarPlayer";
import HomeHud from "./HomeHud";
import NextActionCard from "./NextActionCard";
import WeighInSheet from "./WeighInSheet";
import Icon from "../ui/Icon";
const kg = (n: number) =>
  n.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
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
    [date, setDate] = useState(""),
    [snap, setSnap] = useState<Snapshot | null>(null),
    [hour, setHour] = useState(12);
  const [weigh, setWeigh] = useState<{
      today: string;
      todayKg: number | null;
      previous: WeighIn | null;
    } | null>(null),
    [celebration, setCelebration] = useState<Celebration | null>(null);
  const refresh = useCallback(() => {
    const d = todayKey();
    setDate(d);
    setHour(new Date().getHours());
    // If a record is malformed the HUD steps aside; the quiet links remain.
    try {
      setSnap(readSnapshot({ today: d }));
    } catch {
      setSnap(null);
    }
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
  // The weigh-in opens in place, read fresh from storage at the tap.
  const openWeigh = useCallback(() => {
    const d = todayKey();
    const c = weighContext(getAllMeasurements(), d);
    setWeigh({ today: d, todayKg: c.today, previous: c.previous });
  }, []);
  const closeWeigh = useCallback(() => setWeigh(null), []);
  const closeCelebration = useCallback(() => setCelebration(null), []);
  const saveWeight = useCallback(
    (kg: number) => {
      const d = weigh?.today ?? todayKey();
      // "Before" comes from storage right before the save, so a weight merged
      // by background sync is never counted as part of this weigh-in. The
      // save itself never depends on the celebration.
      let before: { snap: Snapshot; rows: Measurement[] } | null = null;
      try {
        before = { snap: readSnapshot({ today: d }), rows: getAllMeasurements() };
      } catch {}
      saveMeasurement({ date: d, weightKg: kg });
      haptic("success");
      setWeigh(null);
      refresh();
      let c: Celebration | null = null;
      try {
        if (before)
          c = weighCelebration(
            before.snap,
            readSnapshot({ today: d }),
            before.rows,
            getAllMeasurements(),
            d,
          );
      } catch {}
      if (c && hasChanges(c)) setCelebration(c);
      else toast("Berat tersimpan", "success");
    },
    [weigh?.today, refresh],
  );
  const weight = date
    ? weightSummary(measurements, date)
    : { latest: null, mean: null, count: 0 };
  const progress = date
    ? companionProgress(settings.goal, measurements, workouts, date)
    : { level: null, fraction: null };
  const name = session?.user?.name?.split(" ")[0] || "Akunmu";
  const slot = mealSlotForHour(hour);
  const action = snap
    ? nextAction(snap, {
        hour,
        activeWorkoutId: active,
        slotLogged: meals.some(
          (m) => m.mealType === slot && m.items.length > 0,
        ),
        weightGoal: settings.goal?.mode === "weight",
      })
    : null;
  const goal = settings.goal;
  const trend = weight.mean ?? weight.latest?.weightKg ?? null;
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
      {snap && <HomeHud s={snap} />}
      {action && <NextActionCard action={action} onWeigh={openWeigh} />}
      <nav className="quiet-actions" aria-label="Catat lainnya">
        {action?.key !== "meal" && action?.key !== "protein" && (
          <Link href="/meal?add=1">
            <Icon name="plus" size={16} />
            Catat makan
          </Link>
        )}
        {action?.key !== "workout" && action?.key !== "resume" && (
          <Link href={active ? `/workout/session/${active}` : "/workout"}>
            <Icon name="workout" size={16} />
            {active ? "Lanjut latihan" : "Latihan"}
          </Link>
        )}
        {action?.key !== "weigh" && (
          <button type="button" aria-haspopup="dialog" onClick={openWeigh}>
            <Icon name="scale" size={16} />
            Catat berat
          </button>
        )}
      </nav>
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
        {goal && (
          <Link href="/companion#goals" className="avatar-goal">
            {progress.fraction !== null && (
              <span className="avatar-goal-bar" aria-hidden="true">
                <span
                  style={
                    {
                      ["--p" as string]: progress.fraction,
                    } as CSSProperties
                  }
                />
              </span>
            )}
            <span className="avatar-goal-text">
              {goal.mode === "weight" ? (
                <>
                  <span>
                    {trend !== null
                      ? `${weight.mean !== null ? "Tren" : "Terakhir"} ${kg(trend)} kg`
                      : "Belum ada timbangan"}
                  </span>
                  <span>
                    Target{" "}
                    {goal.targetWeight !== null ? kg(goal.targetWeight) : "—"} kg
                  </span>
                </>
              ) : (
                <>
                  <span>Pinggang turun, beban naik</span>
                  <span>
                    {progress.fraction !== null
                      ? `${Math.round(progress.fraction * 100)}% menuju target`
                      : "Menunggu dua catatan"}
                  </span>
                </>
              )}
            </span>
          </Link>
        )}
      </section>
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
      {weigh && (
        <WeighInSheet
          today={weigh.today}
          todayKg={weigh.todayKg}
          previous={weigh.previous}
          onSave={saveWeight}
          onClose={closeWeigh}
        />
      )}
      {celebration && (
        <ProgressCelebration
          c={celebration}
          title={
            celebration.weigh?.replaced != null
              ? "Berat diperbarui"
              : "Berat tercatat"
          }
          onClose={closeCelebration}
        />
      )}
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
