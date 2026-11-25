"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  getCustomTemplates,
  startCustomWorkout,
  startWorkout,
  type SessionType,
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
import { dayTarget } from "@/lib/dayBudgetData";
import { readEnergyView } from "@/lib/energyBalanceData";
import { addWaterMl, getWaterMl } from "@/lib/water";
import EnergyBalanceCard from "./EnergyBalanceCard";
import HeroAvatarStage from "./HeroAvatarStage";
import {
  logUsualMeal,
  readUsualMeal,
  undoUsualMeal,
  type UsualOffer,
} from "@/lib/usualMealData";
import {
  acceptMealShadow,
  acceptWorkoutShadow,
  dismissShadowOffer,
  getHomeShadowOffers,
  undoAcceptedMealShadow,
} from "@/lib/habitGraphData";
import type { ShadowRecommendation } from "@/lib/habitGraph";
import { celebrationDiff, SLOT_NAME } from "@/lib/motivation";
import { weighCelebration, weighContext, type WeighIn } from "@/lib/weighIn";
import { haptic } from "@/lib/haptics";
import { toast } from "../Toast";
import ProgressCelebration from "../_motion/ProgressCelebration";
import HomeHud from "./HomeHud";
import NextActionCard from "./NextActionCard";
import ShadowRecommendations from "../ui/ShadowRecommendations";
import ShadowQuickEditSheet, {
  type MealQuickEditResult,
  type WorkoutQuickEditResult,
} from "../ui/ShadowQuickEditSheet";
import WeighInSheet from "./WeighInSheet";
import PartnerRoomSheet, {
  pickDefaultPartnerId,
  type PartnerSummary,
  type PresenceData,
} from "./PartnerRoomSheet";
import Icon from "../ui/Icon";
export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
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
    [bonus, setBonus] = useState(0),
    [hour, setHour] = useState(12);
  const [weigh, setWeigh] = useState<{
      today: string;
      todayKg: number | null;
      previous: WeighIn | null;
    } | null>(null),
    [celebration, setCelebration] = useState<Celebration | null>(null),
    [usual, setUsual] = useState<UsualOffer | null>(null),
    // The one-tap log the open celebration can take back.
    [undo, setUndo] = useState<{
      mealId: string;
      stamp: number;
      title: string;
    } | null>(null),
    [waterMl, setWaterMl] = useState(0),
    [detailOpen, setDetailOpen] = useState(false),
    [presence, setPresence] = useState<PresenceData | null>(null),
    [roomOpen, setRoomOpen] = useState(false),
    [roomPartnerId, setRoomPartnerId] = useState<string | null>(null),
    [shadows, setShadows] = useState<ShadowRecommendation[]>([]),
    [editingShadow, setEditingShadow] = useState<ShadowRecommendation | null>(null),
    [workoutTitle, setWorkoutTitle] = useState<string | null>(null);

  const fetchPresence = useCallback(async () => {
    try {
      const res = await fetch("/api/social/presence", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.ok && json?.data) {
        setPresence(json.data as PresenceData);
      }
    } catch {
      // non-fatal when offline or unauthenticated
    }
  }, []);

  useEffect(() => {
    void fetchPresence();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchPresence();
      }
    }, 12_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchPresence();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchPresence]);
  const refresh = useCallback(() => {
    const d = todayKey();
    const h = new Date().getHours();
    setDate(d);
    setHour(h);
    try {
      setUsual(readUsualMeal(mealSlotForHour(h), d));
    } catch {
      setUsual(null);
    }
    // If a record is malformed the HUD steps aside; the quiet links remain.
    try {
      setSnap(readSnapshot({ today: d }));
      setBonus(dayTarget(d).bonusKcal);
    } catch {
      setSnap(null);
    }
    const activeId = getActiveWorkoutId();
    setMeals(getMealsForDate(d));
    setWaterMl(getWaterMl(d));
    setMeasurements(getAllMeasurements());
    setWorkouts(getAllWorkouts());
    setActive(activeId);
    setSettings(readCompanion(session?.user?.name));
    try {
      setShadows(getHomeShadowOffers({ date: d, hour: h, activeWorkoutId: activeId }));
    } catch {
      setShadows([]);
    }
  }, [session?.user?.name]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [refresh]);
  const handleSoftRefresh = useCallback(() => {
    refresh();
    void fetchPresence();
  }, [refresh, fetchPresence]);
  useSoftRefresh(handleSoftRefresh);
  // The weigh-in opens in place, read fresh from storage at the tap.
  const openWeigh = useCallback(() => {
    const d = todayKey();
    const c = weighContext(getAllMeasurements(), d);
    setWeigh({ today: d, todayKg: c.today, previous: c.previous });
  }, []);
  const closeWeigh = useCallback(() => setWeigh(null), []);
  const closeCelebration = useCallback(() => {
    setCelebration(null);
    setUndo(null);
  }, []);
  // "Makan biasa": one tap logs the meal he usually eats in this slot, read
  // fresh from storage at the tap, then the sheet counts up what changed.
  const logUsual = useCallback(() => {
    const d = todayKey();
    const slot = mealSlotForHour(new Date().getHours());
    const offer = readUsualMeal(slot, d);
    const slotTaken = getMealsForDate(d).some(
      (m) => m.mealType === slot && m.items.length > 0,
    );
    if (!offer || slotTaken) {
      router.push("/meal?add=1");
      return;
    }
    let before: Snapshot | null = null;
    try {
      before = readSnapshot({ today: d });
    } catch {}
    const logged = logUsualMeal(offer, d);
    haptic("success");
    refresh();
    let c: Celebration | null = null;
    try {
      if (before) c = celebrationDiff(before, readSnapshot({ today: d }), "meal");
    } catch {}
    const name = SLOT_NAME[slot];
    if (c) {
      setUndo({
        ...logged,
        title: `${name[0].toUpperCase()}${name.slice(1)} biasa tercatat`,
      });
      setCelebration(c);
    } else toast(`${offer.label} tercatat`, "success");
  }, [refresh, router]);
  const undoUsual = useCallback(() => {
    if (undo) {
      undoUsualMeal(undo.mealId, undo.stamp);
      undoAcceptedMealShadow(undo.mealId, undo.stamp);
    }
    setCelebration(null);
    setUndo(null);
    haptic("tap");
    refresh();
    toast(
      `${undo?.title.replace(" tercatat", "") ?? "Catatan"} dibatalkan`,
      "success",
    );
  }, [undo, refresh]);

  const confirmMealShadow = useCallback(
    (offer: ShadowRecommendation, edit?: MealQuickEditResult) => {
      const d = todayKey();
      let before: Snapshot | null = null;
      try {
        before = readSnapshot({ today: d });
      } catch {}
      const res = acceptMealShadow(offer, {
        date: d,
        mealType: edit?.slot,
        customCombo: edit?.combo,
      });
      setEditingShadow(null);
      if (!res) return;
      haptic("success");
      refresh();
      let c: Celebration | null = null;
      try {
        if (before) c = celebrationDiff(before, readSnapshot({ today: d }), "meal");
      } catch {}
      const slotName = SLOT_NAME[res.slot];
      if (c && hasChanges(c)) {
        setUndo({
          mealId: res.mealId,
          stamp: res.stamp,
          title: `${slotName[0].toUpperCase()}${slotName.slice(1)} tercatat`,
        });
        setCelebration(c);
      } else {
        toast(`✓ ${res.label} · +${res.kcal} kkal`, "success");
      }
    },
    [refresh],
  );

  const confirmWorkoutShadow = useCallback(
    (offer: ShadowRecommendation, edit?: WorkoutQuickEditResult) => {
      const d = todayKey();
      let before: Snapshot | null = null;
      try {
        before = readSnapshot({ today: d });
      } catch {}
      const res = acceptWorkoutShadow(offer, { date: d, ...(edit ?? {}) });
      setEditingShadow(null);
      if (!res) return;
      haptic("success");
      refresh();
      let c: Celebration | null = null;
      try {
        if (before) c = celebrationDiff(before, readSnapshot({ today: d }), "workout");
      } catch {}
      if (c && hasChanges(c) && res.kind === "session") {
        setUndo(null);
        setWorkoutTitle(`${res.title} selesai`);
        setCelebration(c);
      } else {
        toast(`✓ ${res.title} · ≈ ${res.kcal.toLocaleString("id-ID")} kkal`, "success");
      }
    },
    [refresh],
  );

  const handleShadowConfirm = useCallback(
    (offer: ShadowRecommendation) => {
      if (offer.meal) confirmMealShadow(offer);
      else if (offer.workout) confirmWorkoutShadow(offer);
    },
    [confirmMealShadow, confirmWorkoutShadow],
  );

  const handleShadowDismiss = useCallback(
    (offer: ShadowRecommendation) => {
      dismissShadowOffer(offer.targetNodeId);
      refresh();
    },
    [refresh],
  );

  const handleShadowStartLive = useCallback(
    (offer: ShadowRecommendation) => {
      setEditingShadow(null);
      const d = todayKey();
      const w = offer.workout;
      if (!w) return;
      if (w.sessionType && w.sessionType !== "CUSTOM") {
        const started = startWorkout(w.sessionType as SessionType, d);
        router.push(`/workout/session/${started.id}`);
        return;
      }
      if (w.customTemplateId) {
        const tpl = getCustomTemplates().find((t) => t.id === w.customTemplateId);
        if (tpl) {
          const started = startCustomWorkout(tpl, d);
          router.push(`/workout/session/${started.id}`);
          return;
        }
      }
      router.push("/workout");
    },
    [router],
  );
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
  const progress = date
    ? companionProgress(settings.goal, measurements, workouts, date)
    : { level: null, fraction: null };
  const weightInfo = date ? weightSummary(measurements, date) : null;
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
        usual,
      })
    : null;
  // Re-read whenever the snapshot or meals change (every save, sync or return to the app).
  const energy = useMemo(
    () =>
      snap && date
        ? readEnergyView(
            date,
            snap.kcal,
            settings.goal?.mode === "weight" ? settings.goal.targetWeight : null,
          )
        : null,
    // bonus and meals change with training burn and logged meals, which the view also reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, date, settings.goal, bonus, meals, waterMl],
  );
  const currentKg =
    weightInfo?.latest?.weightKg ??
    (energy?.status === "ok" ? energy.kg : null);
  const changeWater = useCallback((delta: number) => {
    const d = todayKey();
    setWaterMl(addWaterMl(d, delta));
    haptic("tap");
  }, []);

  const partners: PartnerSummary[] = presence?.partners ?? [];
  const activeVisitors = presence?.activeVisitors ?? [];
  const recentNudges = presence?.recentNudges ?? [];
  const activeVisitor = activeVisitors[0] ?? null;
  const isSignLit = activeVisitors.length > 0;
  const latestNudge = !activeVisitor ? (recentNudges[0] ?? null) : null;
  const primaryPartner = useMemo(() => {
    const id = pickDefaultPartnerId(partners);
    return partners.find((p) => p.id === id) ?? partners[0] ?? null;
  }, [partners]);

  const openPartnerRoom = useCallback(
    (partnerId?: string | null) => {
      haptic("tap");
      setRoomPartnerId(partnerId ?? primaryPartner?.id ?? null);
      setRoomOpen(true);
    },
    [primaryPartner?.id],
  );

  return (
    <main className="lean-home">
      <h1 className="companion-sr-only">R2 Fit — hari ini</h1>
      <header className="home-topbar">
        <Link href="/" className="friendly-brand">
          r2<span>fit</span>
        </Link>
        {snap && (
          <nav className="home-streak-bar" aria-label="Streak">
            <Link
              href="/meal"
              className={`home-streak-item meal${snap.meal.todayDone ? " lit" : ""}`}
              aria-label={`Catat makan ${snap.meal.count} hari`}
            >
              <Icon name="flame" size={15} />
              {snap.meal.count}
            </Link>
            <Link
              href="/workout"
              className={`home-streak-item workout${snap.workoutWeeks.todayDone ? " lit" : ""}`}
              aria-label={`Latihan ${snap.workoutWeeks.count} minggu`}
            >
              <Icon name="workout" size={15} />
              {snap.workoutWeeks.count}
            </Link>
            <Link
              href="/dashboard/progress"
              className={`home-streak-item weigh${snap.weigh.todayDone ? " lit" : ""}`}
              aria-label={`Timbang ${snap.weigh.count} hari`}
            >
              <Icon name="scale" size={15} />
              {snap.weigh.count}
            </Link>
          </nav>
        )}
        <div className="home-topbar-right">
          <button
            type="button"
            className={`door-topbar-btn${isSignLit ? " is-lit" : ""}`}
            aria-label={
              isSignLit && activeVisitor
                ? `${activeVisitor.name} lagi ngintip kamu — buka pintu pasangan`
                : `Buka pintu ${primaryPartner?.displayName ?? "pasangan"}`
            }
            onClick={() => openPartnerRoom(activeVisitor?.user.id)}
          >
            <Icon name="door" size={16} />
            <span className="door-btn-label">Intip</span>
            {isSignLit && <span className="door-sign-dot" aria-hidden="true" />}
          </button>
          <Link href="/settings" className="settings-icon-btn" aria-label={`Pengaturan ${name}`}>
            <Icon name="settings" size={18} />
          </Link>
        </div>
      </header>
      {(isSignLit && activeVisitor) || latestNudge ? (
        <button
          type="button"
          className={`presence-sign-lit${isSignLit ? " active-glow" : " nudge-glow"}`}
          onClick={() =>
            openPartnerRoom(activeVisitor?.user.id ?? latestNudge?.user.id)
          }
        >
          <span className="presence-lantern" aria-hidden="true">
            {isSignLit ? "✨" : "💛"}
          </span>
          <span className="presence-sign-text">
            {isSignLit && activeVisitor ? (
              activeVisitors.length > 1 ? (
                <>
                  <strong>{activeVisitor.name}</strong> (+{activeVisitors.length - 1}) lagi
                  ngintip kamu
                </>
              ) : (
                <>
                  <strong>{activeVisitor.name}</strong> lagi ngintip kamu
                </>
              )
            ) : (
              <>
                <strong>{latestNudge?.name}</strong>: “{latestNudge?.text}”
              </>
            )}
          </span>
          <span className="presence-sign-cta">Balas →</span>
        </button>
      ) : null}
      <HeroAvatarStage
        character={settings.character}
        level={progress.level ?? 1}
        goal={settings.goal}
        currentKg={currentKg}
        energy={energy}
        snap={snap}
        waterMl={waterMl}
        onAddWater={changeWater}
        detailOpen={detailOpen}
        onToggleDetail={() => setDetailOpen((open) => !open)}
        onOpenWeigh={openWeigh}
      />
      {detailOpen && energy && (
        <div className="hero-detail-drawer">
          <EnergyBalanceCard view={energy} />
        </div>
      )}
      {snap && <HomeHud s={snap} bonus={bonus} weekOnly />}
      {action && (
        <NextActionCard action={action} onWeigh={openWeigh} onUsual={logUsual} />
      )}
      {shadows.length > 0 && (
        <ShadowRecommendations
          offers={shadows}
          variant="home"
          title="Tombol Bayangan"
          subtitle="1 ketuk ✓"
          onConfirm={handleShadowConfirm}
          onQuickEdit={(o) => setEditingShadow(o)}
          onDismiss={handleShadowDismiss}
        />
      )}
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
            celebration.kind === "meal" && undo
              ? undo.title
              : celebration.kind === "workout"
                ? workoutTitle || "Latihan tercatat"
                : celebration.weigh?.replaced != null
                  ? "Berat diperbarui"
                  : "Berat tercatat"
          }
          onClose={() => {
            setWorkoutTitle(null);
            closeCelebration();
          }}
          onUndo={celebration.kind === "meal" && undo ? undoUsual : undefined}
        />
      )}
      {editingShadow && (
        <ShadowQuickEditSheet
          offer={editingShadow}
          onClose={() => setEditingShadow(null)}
          onSaveMeal={confirmMealShadow}
          onSaveWorkout={confirmWorkoutShadow}
          onStartLiveWorkout={handleShadowStartLive}
        />
      )}
      <section className={`duo-doorway-wrap${isSignLit ? " is-lit" : ""}`}>
        <button
          type="button"
          className="duo-doorway-btn"
          onClick={() => openPartnerRoom(activeVisitor?.user.id)}
        >
          <span className={`duo-door-ico${isSignLit ? " is-lit" : ""}`} aria-hidden="true">
            <Icon name="door" size={20} />
          </span>
          <span className="duo-doorway-copy">
            <strong>
              {isSignLit && activeVisitor
                ? `✨ ${activeVisitor.name} lagi ngintip kamu`
                : primaryPartner
                  ? `Pintu ${primaryPartner.displayName}`
                  : "Pintu Pasangan (Intip)"}
            </strong>
            <small>
              {isSignLit
                ? "Lampu pintu menyala · ketuk untuk lihat ruangnya"
                : primaryPartner
                  ? "Lihat makan, latihan & kirim ketukan semangat"
                  : "Hubungkan Richie ↔ Renita untuk intip progres live"}
            </small>
          </span>
          <Icon name="heart" size={17} />
        </button>
        <Link href="/companion" className="duo-link">
          <img
            src="/avatars/v2/duo-poster.webp"
            alt="Richie dan Renita"
            width={44}
            height={44}
          />
          <span>
            <strong>Richie &amp; Renita</strong>
            <small>Progres avatar &amp; target</small>
          </span>
          <Icon name="arrow" size={17} />
        </Link>
      </section>
      <PartnerRoomSheet
        open={roomOpen}
        onClose={() => {
          setRoomOpen(false);
          void fetchPresence();
        }}
        partners={partners}
        initialPartnerId={roomPartnerId}
        presence={presence}
        dateKey={date || todayKey()}
      />
    </main>
  );
}
