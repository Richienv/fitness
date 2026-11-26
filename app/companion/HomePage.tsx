"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getMealsForDate, getAllMeals, getDaily, isCustomItem, type MealLog } from "@/lib/store";
import { getIngredient, macrosFor } from "@/lib/ingredients";
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
import { TARGETS, todayKey } from "@/lib/targets";
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
import { addWaterMl, getAllWater, getWaterMl } from "@/lib/water";
import { evaluateHealthAchievements } from "@/lib/healthAchievements";
import {
  readEarnedAchievementKeys,
  readSelectedStageId,
  recordEarnedAchievementKeys,
  saveSelectedStageId,
  syncAchievementsToServer,
} from "@/lib/stagePrefs";
import { STAGE_BACKGROUNDS, type StageBackgroundId } from "@/lib/stageBackgrounds";
import { scopedKey } from "@/lib/userScope";
import { useAccountSetup } from "../SetupProvider";
import EnergyBalanceCard from "./EnergyBalanceCard";
import HeroAvatarStage from "./HeroAvatarStage";
import MetabolicCalibrationSheet from "./MetabolicCalibrationSheet";
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
import StreakFlame from "../ui/StreakFlame";
import { getStreakTier } from "@/lib/streakTiers";
export default function HomePage() {
  const { data: session } = useSession();
  const account = useAccountSetup();
  const router = useRouter();
  const [meals, setMeals] = useState<MealLog[]>([]),
    [measurements, setMeasurements] = useState<Measurement[]>([]),
    [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [stageId, setStageId] = useState<StageBackgroundId>(() =>
    readSelectedStageId(account?.setup?.stageBackgroundId),
  );
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
      todayWeighedAt: string | null;
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
    [workoutTitle, setWorkoutTitle] = useState<string | null>(null),
    [calibrateOpen, setCalibrateOpen] = useState(false);
  const seenCheerIdRef = useRef<string | null>(null);
  const presenceSigRef = useRef<string | null>(null);
  const refreshSigRef = useRef<string | null>(null);

  const fetchPresence = useCallback(async () => {
    try {
      const res = await fetch("/api/social/presence", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.ok && json?.data) {
        const next = json.data as PresenceData;
        try {
          window.localStorage.setItem(
            scopedKey("r2.presence.cache.v1"),
            JSON.stringify(next),
          );
        } catch {
          /* ignore */
        }
        const latestCheer = next.unreadCheers?.[0];
        if (latestCheer && latestCheer.id !== seenCheerIdRef.current) {
          const hadPrev = seenCheerIdRef.current !== null;
          seenCheerIdRef.current = latestCheer.id;
          if (hadPrev || (next.unreadCount ?? 0) > 0) {
            haptic("success");
            if (hadPrev) {
              toast(latestCheer.formatted.banner, "success");
            }
          }
        }
        const sig = JSON.stringify(next);
        if (sig !== presenceSigRef.current) {
          presenceSigRef.current = sig;
          setPresence(next);
        }
      }
    } catch {
      // non-fatal when offline or unauthenticated
    }
  }, []);

  useEffect(() => {
    try {
      const cachedRaw = window.localStorage.getItem(scopedKey("r2.presence.cache.v1"));
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw) as PresenceData;
        if (parsed && Array.isArray(parsed.partners)) {
          setPresence((prev) => prev ?? parsed);
        }
      }
    } catch {
      /* ignore */
    }
    void fetchPresence();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchPresence();
      }
    }, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchPresence();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchPresence]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("couple") === "1") {
      setRoomOpen(true);
      params.delete("couple");
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      window.history.replaceState(null, "", nextUrl);
    }
  }, []);
  const refresh = useCallback(() => {
    const d = todayKey();
    const h = new Date().getHours();
    let nextUsual: UsualOffer | null = null;
    try {
      nextUsual = readUsualMeal(mealSlotForHour(h), d);
    } catch {
      nextUsual = null;
    }
    // If a record is malformed the HUD steps aside; the quiet links remain.
    let nextSnap: Snapshot | null = null;
    let nextBonus: number | null = null;
    try {
      nextSnap = readSnapshot({ today: d });
      nextBonus = dayTarget(d).bonusKcal;
    } catch {
      nextSnap = null;
    }
    const activeId = getActiveWorkoutId();
    const nextMeals = getMealsForDate(d);
    const nextWater = getWaterMl(d);
    const nextMeasurements = getAllMeasurements();
    const nextWorkouts = getAllWorkouts();
    const nextSettings = readCompanion(session?.user?.name);
    let nextShadows: ShadowRecommendation[] = [];
    try {
      nextShadows = getHomeShadowOffers({ date: d, hour: h, activeWorkoutId: activeId });
    } catch {
      nextShadows = [];
    }
    const sig = JSON.stringify({
      d,
      h,
      nextUsual,
      nextSnap,
      nextBonus,
      activeId,
      nextMeals,
      nextWater,
      nextMeasurements,
      nextWorkouts,
      nextSettings,
      nextShadows,
    });
    if (sig === refreshSigRef.current) return;
    refreshSigRef.current = sig;
    setDate(d);
    setHour(h);
    setUsual(nextUsual);
    setSnap(nextSnap);
    if (nextBonus !== null) setBonus(nextBonus);
    setMeals(nextMeals);
    setWaterMl(nextWater);
    setMeasurements(nextMeasurements);
    setWorkouts(nextWorkouts);
    setActive(activeId);
    setSettings(nextSettings);
    setShadows(nextShadows);
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
    const all = getAllMeasurements();
    const c = weighContext(all, d);
    const todayRow = all.filter((r) => r.date === d && typeof r.weightKg === "number").at(-1);
    setWeigh({
      today: d,
      todayKg: c.today,
      todayWeighedAt: todayRow?.weighedAt ?? null,
      previous: c.previous,
    });
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
      saveMeasurement({ date: d, weightKg: kg, weighedAt: new Date().toISOString() });
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
            settings.goal,
          );
      } catch {}
      if (c && hasChanges(c)) setCelebration(c);
      else toast("Berat tersimpan", "success");
    },
    [weigh?.today, refresh, settings.goal],
  );
  const progress = date
    ? companionProgress(settings.goal, measurements, workouts, date)
    : {
        level: null,
        fraction: null,
        highestLevel: null,
        previousLevel: null,
        demoted: false,
        demotedFrom: null,
      };
  const weightInfo = date ? weightSummary(measurements, date) : null;
  const fallbackBaselineKg = useMemo(() => {
    const valid = measurements
      .filter((m) => typeof m.weightKg === "number" && m.weightKg > 0 && (!date || m.date <= date))
      .sort((a, b) => a.date.localeCompare(b.date));
    return valid[0]?.weightKg ?? null;
  }, [measurements, date]);
  const rawUserFirst = (account?.displayName || session?.user?.name || "").trim().split(" ")[0] || "";
  const name =
    rawUserFirst.toLowerCase() === "ren" && settings.character === "renita"
      ? "Renita"
      : rawUserFirst || (settings.character === "renita" ? "Renita" : "Richie");

  const achievementSummary = useMemo(() => {
    const d = date || todayKey();
    const byDate = new Map<
      string,
      { date: string; kcal: number; protein: number; fat: number; sugar: number; hasFood: boolean }
    >();
    if (typeof window !== "undefined") {
      for (const m of getAllMeals()) {
        if (!m.items?.length) continue;
        let row = byDate.get(m.date);
        if (!row) {
          row = { date: m.date, kcal: 0, protein: 0, fat: 0, sugar: 0, hasFood: true };
          byDate.set(m.date, row);
        }
        for (const it of m.items) {
          if (isCustomItem(it)) {
            row.kcal += Number(it.kcal) || 0;
            row.protein += Number(it.protein) || 0;
            row.fat += Number(it.fat) || 0;
            row.sugar += Number(it.sugar) || 0;
          } else {
            const mac = macrosFor(it.id, it.qty);
            row.kcal += mac.kcal;
            row.protein += mac.protein;
            row.fat += mac.fat;
            row.sugar += (getIngredient(it.id)?.sugar ?? 0) * it.qty;
          }
        }
      }
    }
    const targetDay =
      typeof window !== "undefined" && getDaily(d).gymDay
        ? TARGETS.gymDay
        : TARGETS.restDay;
    return evaluateHealthAchievements({
      today: d,
      dailyNutrition: Array.from(byDate.values()),
      workouts,
      waterByDate: typeof window !== "undefined" ? getAllWater() : {},
      kcalTarget: targetDay.kcal,
      proteinTarget: targetDay.protein,
      fatTarget: targetDay.fat,
      hasPartnerActivity:
        (presence?.partners?.length ?? 0) > 0 &&
        (Boolean(presence?.recentNudges?.length) || meals.length > 0),
      previouslyEarnedKeys: readEarnedAchievementKeys(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, meals, workouts, waterMl, presence?.partners?.length]);

  useEffect(() => {
    setStageId(readSelectedStageId(account?.setup?.stageBackgroundId));
  }, [account?.setup?.stageBackgroundId]);

  useEffect(() => {
    const unlockedItems = achievementSummary.items.filter((x) => x.unlocked);
    if (unlockedItems.length === 0) return;
    const stageNames = new Map(STAGE_BACKGROUNDS.map((s) => [s.id, s.name]));
    const newlyLocal = recordEarnedAchievementKeys(unlockedItems.map((x) => x.key));
    if (newlyLocal.length > 0) {
      const first = unlockedItems.find((x) => x.key === newlyLocal[0]);
      if (first) {
        const stageName = stageNames.get(first.stageId) ?? "";
        toast(
          `✨ Pencapaian terbuka: ${first.title}${stageName ? ` · Latar ${stageName}` : ""}`,
          "success",
        );
      }
    }
    syncAchievementsToServer(achievementSummary.items, stageNames);
  }, [achievementSummary]);

  const handleSelectStage = useCallback(
    (nextId: StageBackgroundId) => {
      setStageId(nextId);
      saveSelectedStageId(nextId);
      if (account?.setup) {
        account.accept({ ...account.setup, stageBackgroundId: nextId }, account.displayName);
      }
    },
    [account],
  );
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
  const unreadCheers = presence?.unreadCheers ?? [];
  const unreadCount = presence?.unreadCount ?? unreadCheers.length;
  const latestCheer = unreadCheers[0] ?? null;
  const activeVisitor = activeVisitors[0] ?? null;
  const isSignLit = activeVisitors.length > 0 || unreadCount > 0;
  const latestNudge = !activeVisitor && !latestCheer ? (recentNudges[0] ?? null) : null;
  const primaryPartner = useMemo(() => {
    const id = pickDefaultPartnerId(partners);
    return partners.find((p) => p.id === id) ?? partners[0] ?? null;
  }, [partners]);

  const toggleDetail = useCallback(() => {
    setDetailOpen((open) => !open);
  }, []);

  const closeEditingShadow = useCallback(() => {
    setEditingShadow(null);
  }, []);

  const quickEditShadow = useCallback((o: ShadowRecommendation) => {
    setEditingShadow(o);
  }, []);

  const closeRoom = useCallback(() => {
    setRoomOpen(false);
    void fetchPresence();
  }, [fetchPresence]);

  const clearUnread = useCallback(() => {
    void fetchPresence();
  }, [fetchPresence]);

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
            {(() => {
              const mealTier = getStreakTier(snap.meal.count);
              const wkTier = getStreakTier(snap.workoutWeeks.count);
              const weighTier = getStreakTier(snap.weigh.count);
              return (
                <>
                  <Link
                    href="/meal"
                    className={`home-streak-item meal${snap.meal.todayDone ? " lit" : ""}`}
                    style={
                      snap.meal.count >= 3
                        ? { color: mealTier.accent }
                        : undefined
                    }
                    aria-label={`Catat makan ${snap.meal.count} hari (${mealTier.title})`}
                    title={`Streak Makan: ${snap.meal.count} hari (${mealTier.title})`}
                  >
                    <StreakFlame count={snap.meal.count} size={15} />
                    <span>{snap.meal.count}</span>
                  </Link>
                  <Link
                    href="/workout"
                    className={`home-streak-item workout${snap.workoutWeeks.todayDone ? " lit" : ""}`}
                    style={
                      snap.workoutWeeks.count >= 3
                        ? { color: wkTier.accent }
                        : undefined
                    }
                    aria-label={`Latihan ${snap.workoutWeeks.count} minggu (${wkTier.title})`}
                    title={`Streak Latihan: ${snap.workoutWeeks.count} minggu (${wkTier.title})`}
                  >
                    <StreakFlame count={snap.workoutWeeks.count} size={15} />
                    <span>{snap.workoutWeeks.count}</span>
                  </Link>
                  <Link
                    href="/dashboard/progress"
                    className={`home-streak-item weigh${snap.weigh.todayDone ? " lit" : ""}`}
                    style={
                      snap.weigh.count >= 3
                        ? { color: weighTier.accent }
                        : undefined
                    }
                    aria-label={`Timbang ${snap.weigh.count} hari (${weighTier.title})`}
                    title={`Streak Timbang: ${snap.weigh.count} hari (${weighTier.title})`}
                  >
                    <StreakFlame count={snap.weigh.count} size={15} />
                    <span>{snap.weigh.count}</span>
                  </Link>
                </>
              );
            })()}
          </nav>
        )}
        <div className="home-topbar-right">
          <button
            type="button"
            className={`door-topbar-btn${isSignLit ? " is-lit" : ""}`}
            aria-label={
              latestCheer
                ? `${latestCheer.formatted.banner} — buka Arena Berdua`
                : activeVisitor
                  ? `${activeVisitor.name} lagi ngintip kamu — buka Arena Berdua`
                  : `Buka Arena Berdua (${primaryPartner?.displayName ?? "Richie & Renita"})`
            }
            onClick={() => openPartnerRoom(latestCheer?.senderId ?? activeVisitor?.user.id)}
          >
            <Icon name="door" size={15} />
            <span className="door-btn-label">Arena</span>
            {isSignLit && <span className="door-sign-dot" aria-hidden="true" />}
          </button>
          <Link href="/settings" className="settings-icon-btn" aria-label={`Pengaturan ${name}`}>
            <Icon name="settings" size={16} />
          </Link>
        </div>
      </header>
      {latestCheer ? (
        <button
          type="button"
          className="presence-sign-lit active-glow"
          onClick={() => openPartnerRoom(latestCheer.senderId)}
        >
          <span className="presence-lantern" aria-hidden="true">
            💌
          </span>
          <span className="presence-sign-text">
            <strong>{latestCheer.formatted.title}:</strong> “{latestCheer.message}”
          </span>
          <span className="presence-sign-cta">
            {unreadCount > 1 ? `Buka (+${unreadCount}) →` : "Balas →"}
          </span>
        </button>
      ) : (activeVisitor || latestNudge) ? (
        <button
          type="button"
          className={`presence-sign-lit${activeVisitor ? " active-glow" : " nudge-glow"}`}
          onClick={() =>
            openPartnerRoom(activeVisitor?.user.id ?? latestNudge?.user.id)
          }
        >
          <span className="presence-lantern" aria-hidden="true">
            {activeVisitor ? "✨" : "💛"}
          </span>
          <span className="presence-sign-text">
            {activeVisitor ? (
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
      <div className="home-desktop-grid">
        <div className="home-col-hero">
          <HeroAvatarStage
            character={settings.character}
            level={progress.level ?? 1}
            highestLevel={progress.highestLevel}
            demoted={progress.demoted}
            demotedFrom={progress.demotedFrom}
            weighedAt={weightInfo?.latest?.weighedAt ?? null}
            fallbackBaselineKg={fallbackBaselineKg}
            goal={settings.goal}
            currentKg={currentKg}
            energy={energy}
            snap={snap}
            waterMl={waterMl}
            onAddWater={changeWater}
            detailOpen={detailOpen}
            onToggleDetail={toggleDetail}
            onOpenWeigh={openWeigh}
            stageId={stageId}
            onSelectStage={handleSelectStage}
            achievements={achievementSummary.items}
            unlockedStageIds={achievementSummary.unlockedStageIds}
            accuracyScore={energy?.status === "ok" ? energy.metabolic?.accuracyScore ?? null : null}
            accuracyAlert={energy?.status === "ok" ? energy.metabolic?.alerts?.[0] ?? null : null}
            onOpenCalibrate={() => setCalibrateOpen(true)}
          />
          {detailOpen && energy && (
            <div className="hero-detail-drawer">
              <EnergyBalanceCard
                view={energy}
                onOpenCalibrate={() => setCalibrateOpen(true)}
              />
            </div>
          )}
          {snap && <HomeHud s={snap} bonus={bonus} weekOnly />}
        </div>
        <div className="home-col-feed">
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
              onQuickEdit={quickEditShadow}
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
          <section className={`duo-doorway-wrap${isSignLit ? " is-lit" : ""}`}>
            <button
              type="button"
              className="duo-doorway-btn is-couple-arena"
              onClick={() => openPartnerRoom(latestCheer?.senderId ?? activeVisitor?.user.id)}
            >
              <img
                src="/avatars/v2/duo-poster.webp"
                alt="Richie dan Renita"
                width={48}
                height={48}
                className="duo-arena-thumb"
              />
              <span className="duo-doorway-copy">
                <strong>
                  Richie &amp; Renita · Live berdua
                </strong>
                <small>
                  {unreadCount > 0
                    ? `${unreadCount} pesan baru · ketuk untuk balas`
                    : activeVisitor
                      ? `✨ ${activeVisitor.name} lagi ngintip kamu · lihat kondisi berdua`
                      : primaryPartner
                        ? `Bandingkan level avatar, kalori & makan ${primaryPartner.displayName} real-time`
                        : "Buka Arena Berdua & hubungkan Richie ↔ Renita"}
                </small>
              </span>
              {unreadCount > 0 ? (
                <span className="duo-unread-badge">{unreadCount}</span>
              ) : (
                <Icon name="heart" size={18} />
              )}
            </button>
            <Link href="/companion" className="duo-link">
              <span>
                <strong>Target &amp; avatar saya</strong>
                <small>Atur target berat, koleksi 12 level &amp; grafik</small>
              </span>
              <Icon name="arrow" size={16} />
            </Link>
          </section>
        </div>
      </div>
      {weigh && (
        <WeighInSheet
          today={weigh.today}
          todayKg={weigh.todayKg}
          todayWeighedAt={weigh.todayWeighedAt}
          character={settings.character}
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
          onClose={closeEditingShadow}
          onSaveMeal={confirmMealShadow}
          onSaveWorkout={confirmWorkoutShadow}
          onStartLiveWorkout={handleShadowStartLive}
        />
      )}
      <PartnerRoomSheet
        open={roomOpen}
        onClose={closeRoom}
        partners={partners}
        initialPartnerId={roomPartnerId}
        presence={presence}
        dateKey={date || todayKey()}
        onUnreadCleared={clearUnread}
      />
      <MetabolicCalibrationSheet
        open={calibrateOpen}
        onClose={() => setCalibrateOpen(false)}
        dateKey={date || todayKey()}
      />
    </main>
  );
}
