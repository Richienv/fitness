"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { foodLabel } from "@/lib/foodLabel";
import { getIngredient, macrosFor, type Macros } from "@/lib/ingredients";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import { useVTNavigate } from "@/lib/navigate";
import { PRESETS, type MealType } from "@/lib/presets";
import {
  dedupeMeals,
  getAllMeals,
  getDaily,
  isCustomItem,
  moveMealItem,
  saveMeal,
  setDaily,
  updateMealItems,
  type MealItem,
  type MealLog,
} from "@/lib/store";
import {
  addQuickLogEntry,
  deleteQuickLogEntry,
  getQuickLogEntries,
  moveQuickLogEntry,
  updateQuickLogEntry,
  type QuickLogEntry,
} from "@/lib/quicklog";
import { dayTarget } from "@/lib/dayBudgetData";
import { useActiveDate, parseDate } from "@/lib/activeDate";
import { haptic } from "@/lib/haptics";
import { toast } from "../Toast";
import DatePicker from "./DatePicker";
import FoodBuilder from "./FoodBuilder";
import Icon from "../ui/Icon";
import TodayRings from "../_motion/TodayRings";
import { useSheetBack } from "@/lib/backSheet";
import {
  addedMealType,
  celebrationDiff,
  hasChanges,
  mealSlotForHour,
  type Celebration,
} from "@/lib/motivation";
import { readSnapshot } from "@/lib/motivationData";
import {
  logUsualMeal,
  readUsualMeal,
  undoUsualMeal,
  type UsualOffer,
} from "@/lib/usualMealData";
import {
  acceptMealShadow,
  dismissShadowOffer,
  getMealShadowOffers,
  undoAcceptedMealShadow,
} from "@/lib/habitGraphData";
import type { ShadowRecommendation } from "@/lib/habitGraph";
import ProgressCelebration from "../_motion/ProgressCelebration";
import ShadowRecommendations from "../ui/ShadowRecommendations";
import ShadowQuickEditSheet, {
  type MealQuickEditResult,
} from "../ui/ShadowQuickEditSheet";
import EditMealItemSheet, {
  type LoggedItemTarget,
} from "./EditMealItemSheet";

/** A blank editor draft; may or may not carry an id (edit vs. add). */
type EditDraft = (QuickLogEntry | Omit<QuickLogEntry, "id">) & { id?: string };

// ---- shared style tokens (canonical from app/page.tsx) ----
const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-sans), sans-serif";
const FIRE = "var(--accent)";
const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const round1 = (x: number) => Math.round(x * 10) / 10;
const DAILY_SUGAR_TARGET_G = 50;

/** The right-hand numbers column. The slot total and every item's kcal share
 *  this width so the card's right edge is as straight as its left one. */
const KCAL_COL = 58;

const ID_DAYS = [
  "MINGGU",
  "SENIN",
  "SELASA",
  "RABU",
  "KAMIS",
  "JUMAT",
  "SABTU",
];
const ID_MON = [
  "JANUARI",
  "FEBRUARI",
  "MARET",
  "APRIL",
  "MEI",
  "JUNI",
  "JULI",
  "AGUSTUS",
  "SEPTEMBER",
  "OKTOBER",
  "NOVEMBER",
  "DESEMBER",
];

/** "KAMIS · 24 JULI 2026" — the header line under the wordmark. */
function bahasaDate(dateStr: string): string {
  if (!dateStr) return "";
  const dt = parseDate(dateStr); // UTC
  return `${ID_DAYS[dt.getUTCDay()]} · ${dt.getUTCDate()} ${ID_MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");
const ID_DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const ID_MON_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
/** "Jum, 20 Nov" — the date chip when the page shows another day. */
function shortDate(dateStr: string): string {
  if (!dateStr) return "";
  const dt = parseDate(dateStr);
  return `${ID_DAY_SHORT[dt.getUTCDay()]}, ${dt.getUTCDate()} ${ID_MON_SHORT[dt.getUTCMonth()]}`;
}

/** Local clock time (HH:MM) of an epoch-ms stamp — when a food was logged. */
function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}


const MEAL_ID_LABEL: Record<MealType, string> = {
  breakfast: "Sarapan",
  lunch: "Siang",
  snack: "Camilan",
  dinner: "Malam",
};

/** The four cards, in the order they happen. Windows match inferMealType(). */
const SLOT_DEFS: { key: MealType; label: string; window: string }[] = [
  { key: "breakfast", label: "SARAPAN", window: "04:00 – 11:00" },
  { key: "lunch", label: "SIANG", window: "11:00 – 15:00" },
  { key: "snack", label: "SNACK", window: "15:00 – 18:00" },
  { key: "dinner", label: "MALAM", window: "18:00 – 23:00" },
];

/** Pick the meal slot from the current clock time, so logging is one tap — no
 *  breakfast/lunch/dinner prompt. You can still change it inside the builder. */
function inferMealType(): MealType {
  // Shared with Home's next action, so both point at the same slot.
  return mealSlotForHour(new Date().getHours());
}

const MEAL_TITLE: Record<MealType, string> = {
  breakfast: "Sarapan",
  lunch: "Makan siang",
  snack: "Camilan",
  dinner: "Makan malam",
};

// One-tap add-ons, shown at the end of the quick rail (preset ids from lib/presets).
const ADDONS: { id: string; label: string }[] = [
  { id: "protein-scoop", label: "Protein Powder" },
  { id: "matcha-milk", label: "Matcha + Milk" },
];

function sumMealMacros(meal: MealLog): Macros {
  return meal.items.reduce<Macros>(
    (acc, it) => {
      if (isCustomItem(it)) {
        return {
          kcal: acc.kcal + it.kcal,
          protein: acc.protein + it.protein,
          carbs: acc.carbs + it.carbs,
          fat: acc.fat + it.fat,
        };
      }
      const m = macrosFor(it.id, it.qty);
      return {
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      };
    },
    { ...EMPTY_MACROS },
  );
}

function sumMealSugar(meal: MealLog): number {
  return meal.items.reduce<number>((acc, it) => {
    if (isCustomItem(it)) return acc + (it.sugar ?? 0);
    const ing = getIngredient(it.id);
    return acc + (ing?.sugar ?? 0) * it.qty;
  }, 0);
}

function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

function toggleStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    minHeight: 44,
    padding: "10px 6px",
    borderRadius: 12,
    fontFamily: SANS,
    fontSize: 14,
    fontWeight: active ? 650 : 500,
    cursor: "pointer",
    border: active
      ? "1px solid var(--calm-accent)"
      : "1px solid var(--calm-border)",
    background: active ? "var(--calm-accent-soft)" : "#fff",
    color: active ? "var(--calm-accent)" : "var(--calm-text)",
  };
}


const editLabelStyle: CSSProperties = {
  display: "block",
  fontFamily: SANS,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--calm-muted)",
  marginTop: 16,
};

const editInputStyle: CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "11px 12px",
  borderRadius: 12,
  fontFamily: SANS,
  fontSize: 16, // ≥16 avoids iOS focus zoom
  color: "var(--calm-text)",
  background: "#fff",
  border: "1px solid var(--calm-border)",
  boxSizing: "border-box",
};

/** Numeric editor field (KKAL / macros). fontSize 16 to avoid iOS zoom. */
function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label style={editLabelStyle}>{label}</label>
      <input
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : 0}
        min={0}
        onChange={(ev) => {
          const n = parseFloat(ev.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        style={editInputStyle}
      />
    </div>
  );
}

/** One macro line beside the ring: label, value / target, and a 6px bar.
 *  `cap` marks a ceiling (gula) — past it the bar and the number go red. */
/** One food inside a slot card. */
type SlotItem = {
  key: string;
  mealId: string;
  itemIndex: number;
  mealType: MealType;
  rawItem: MealItem;
  name: string;
  detail: string;
  kcal: number;
  at: number;
};

type Slot = {
  key: MealType;
  label: string;
  window: string;
  items: SlotItem[];
  kcal: number;
  lastAt: number | null;
};

/** "150 g · 4g protein · 41g karbo · 2g lemak · 0g gula" — the macro line in
 *  words, so it reads without a legend.
 *
 *  On a 393 px iPhone the line lands within a few pixels of the available
 *  width, so it sometimes wraps. Each amount is glued to its label with a
 *  non-breaking space: a wrap can then only happen at a "·", which moves
 *  "0g gula" down as one piece instead of stranding the word on its own. */
function macroLine(protein: number): string {
  return `${Math.round(protein)} g protein`;
}

function describeItem(it: MealItem): {
  name: string;
  detail: string;
  kcal: number;
} {
  if (isCustomItem(it)) {
    const portion =
      it.grams > 0 ? `${Math.round(it.grams)} g` : it.portionLabel || "1 porsi";
    return {
      name: it.name,
      kcal: it.kcal,
      detail: `${portion} · ${macroLine(it.protein)}`,
    };
  }
  const ing = getIngredient(it.id);
  const m = macrosFor(it.id, it.qty);
  const portion = ing?.gramsPerUnit
    ? `${Math.round(ing.gramsPerUnit * it.qty)} g`
    : `${round1(it.qty)}×`;
  return {
    name: ing ? foodLabel(ing) : it.id,
    kcal: m.kcal,
    detail: `${portion} · ${macroLine(m.protein)}`,
  };
}

/**
 * `initialBuilder` opens the food builder straight away for that slot.
 *
 * It exists so /meal/[type] can render THIS screen. That route used to render
 * a second, older food logger — English ("STEP 1 / 5", "Search food…"), its own
 * search box, emoji still in it — reachable from the dashboard's LOG NOW,
 * ADD MORE and EDIT MEAL, and from the confirm flow. Two different food UIs
 * depending on which button you pressed. Pointing the route here retires it
 * without breaking a single existing link.
 */
export default function MealHome({
  initialBuilder,
  initialDate,
}: { initialBuilder?: MealType; initialDate?: string } = {}) {
  const vtNavigate = useVTNavigate();
  const { activeDate, setActiveDate, todayStr } = useActiveDate();

  // The dashboard links to /meal/lunch?date=2026-07-28 to edit a past day. The
  // route this replaced honoured that param; dropping it would have logged
  // yesterday's edit onto today, silently and irreversibly.
  useEffect(() => {
    if (initialDate && initialDate !== activeDate) setActiveDate(initialDate);
  }, [initialDate, activeDate, setActiveDate]);

  const [allMeals, setAllMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDay] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickEntries, setQuickEntries] = useState<QuickLogEntry[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [lockRatio, setLockRatio] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [builderMeal, setBuilderMeal] = useState<MealType | null>(
    initialBuilder ?? null,
  );
  /** Same builder, opened straight into the ingredient composer. */
  const [racikMeal, setRacikMeal] = useState<MealType | null>(null);
  const [labelMeal, setLabelMeal] = useState<MealType | null>(null);
  // Which slot the clock is in right now. Resolved after mount so the server
  // render and the first client render agree.
  const [nowSlot, setNowSlot] = useState<MealType | null>(null);
  // Which logged food is pending deletion (drives the confirmation dialog).
  const [pendingDelete, setPendingDelete] = useState<{
    mealId: string;
    itemIndex: number;
    name: string;
  } | null>(null);
  // True while the dialog is playing its exit animation, so it glides out
  // (backdrop fade + card drop) instead of snapping to nothing.
  const [deleteClosing, setDeleteClosing] = useState(false);
  // What the last save changed, counted up in a sheet (today's logs only).
  const [celebration, setCelebration] = useState<{
    c: Celebration;
    title: string;
  } | null>(null);
  const [usualUndo, setUsualUndo] = useState<{
    mealId: string;
    stamp: number;
  } | null>(null);
  const [shadowTick, setShadowTick] = useState(0);
  const [editingShadow, setEditingShadow] = useState<ShadowRecommendation | null>(null);
  const [editingLogged, setEditingLogged] = useState<LoggedItemTarget | null>(null);
  const closeCelebration = useCallback(() => {
    setCelebration(null);
    setUsualUndo(null);
  }, []);

  // Hardware back closes the top-most open sheet instead of leaving the page.
  // (FoodBuilder wires its own step-aware handler internally.)
  useSheetBack(pickerOpen, () => setPickerOpen(false));
  useSheetBack(manageOpen, () => setManageOpen(false));
  useSheetBack(!!editDraft, () => setEditDraft(null));
  useSheetBack(!!editingLogged, () => setEditingLogged(null));
  useSheetBack(!!celebration, closeCelebration);

  const reloadFromStore = useCallback(() => {
    dedupeMeals();
    setAllMeals(getAllMeals());
    setQuickEntries(getQuickLogEntries());
    setLoaded(true);
  }, []);
  useSoftRefresh(reloadFromStore);

  useEffect(() => {
    reloadFromStore();
  }, [reloadFromStore]);

  useEffect(() => {
    setNowSlot(inferMealType());
  }, []);

  // Deep-link from the iPhone widget: /meal?add=1 opens the food builder right
  // away at the time-inferred meal — one tap from the home screen to logging.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("add")) {
      setBuilderMeal(inferMealType());
      // Strip the param so a later refresh/back doesn't re-open the builder.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    setGymDay(getDaily(activeDate).gymDay);
  }, [activeDate]);

  function toggleGym(next: boolean) {
    if (!activeDate || next === gymDay) return;
    haptic("tap");
    setGymDay(next);
    const d = getDaily(activeDate);
    setDaily({ date: activeDate, gymDay: next, checklist: d.checklist ?? {} });
  }

  const dayMeals = useMemo(
    () => allMeals.filter((m) => m.date === activeDate),
    [allMeals, activeDate],
  );

  const totals = useMemo<Macros>(
    () =>
      dayMeals.reduce((a, m) => addMacros(a, sumMealMacros(m)), {
        ...EMPTY_MACROS,
      }),
    [dayMeals],
  );

  const sugarTotal = useMemo(
    () => dayMeals.reduce((acc, m) => acc + sumMealSugar(m), 0),
    [dayMeals],
  );

  // The day as four slots rather than one flat stream, so an empty SNACK is as
  // visible as a logged SARAPAN. saveMeal merges by (date, mealType), so a slot
  // normally holds one meal row — extra rows are still folded in defensively.
  const slots = useMemo<Slot[]>(() => {
    return SLOT_DEFS.map((def) => {
      const meals = dayMeals.filter((m) => m.mealType === def.key);
      const items: SlotItem[] = [];
      let kcal = 0;
      let lastAt: number | null = null;
      for (const meal of meals) {
        meal.items.forEach((it, idx) => {
          const d = describeItem(it);
          const at = it.addedAt ?? meal.loggedAt;
          kcal += d.kcal;
          if (lastAt === null || at > lastAt) lastAt = at;
          items.push({
            key: `${meal.id}:${idx}`,
            mealId: meal.id,
            itemIndex: idx,
            mealType: def.key,
            rawItem: it,
            name: d.name,
            detail: d.detail,
            kcal: d.kcal,
            at,
          });
        });
      }
      items.sort((a, b) => a.at - b.at);
      return {
        key: def.key,
        label: def.label,
        window: def.window,
        items,
        kcal,
        lastAt,
      };
    });
  }, [dayMeals]);

  // Remove one logged food (from the swipe gesture). Drops the item from its
  // meal — updateMealItems deletes the whole meal if it was the last item and
  // syncs the change to the server.
  const deleteLoggedItem = useCallback(
    (mealId: string, itemIndex: number, name: string) => {
      const meal = dayMeals.find((m) => m.id === mealId);
      if (!meal) return;
      const items = meal.items.filter((_, i) => i !== itemIndex);
      updateMealItems(meal.id, items);
      haptic("warn");
      toast(`Dihapus · ${name}`, "success");
      reloadFromStore();
    },
    [dayMeals, reloadFromStore],
  );

  // Close the confirmation with its exit animation, then optionally delete once
  // the card has glided away (so the removal doesn't jump under the dialog).
  const closeDelete = useCallback(
    (confirm: boolean) => {
      if (deleteClosing) return; // ignore re-taps during the exit animation
      const p = pendingDelete;
      setDeleteClosing(true);
      window.setTimeout(() => {
        setPendingDelete(null);
        setDeleteClosing(false);
        if (confirm && p) deleteLoggedItem(p.mealId, p.itemIndex, p.name);
      }, 230);
    },
    [pendingDelete, deleteClosing, deleteLoggedItem],
  );

  // The day's target plus what training earned today (lib/dayBudget); the
  // burn is read from this device, so a save or sync elsewhere nudges a re-read.
  const [burnTick, setBurnTick] = useState(0);
  useSoftRefresh(() => setBurnTick((t) => t + 1));
  const adj = useMemo(
    () => dayTarget(activeDate, { gymDay }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeDate, gymDay, burnTick],
  );
  const target = adj.target;
  const dateLine = bahasaDate(activeDate);

  // Compare the stored records right before this save with the stored ones
  // after it. Past days, and logs that move nothing (water, creatine), keep
  // the plain feedback: streaks and rings are about today.
  const celebrateMeal = useCallback(
    (before: MealLog[]): boolean => {
      if (!activeDate || activeDate !== todayStr) return false;
      try {
        const after = getAllMeals();
        const slot = addedMealType(before, after, activeDate);
        if (!slot) return false;
        const c = celebrationDiff(
          readSnapshot({ meals: before, today: activeDate }),
          readSnapshot({ meals: after, today: activeDate }),
          "meal",
        );
        if (!hasChanges(c)) return false;
        setCelebration({ c, title: `${MEAL_TITLE[slot]} tercatat` });
        return true;
      } catch {
        return false;
      }
    },
    [activeDate, todayStr],
  );

  // Log a configured quick-log entry straight into the day (no navigation).
  const logQuick = useCallback(
    (e: QuickLogEntry) => {
      const before = getAllMeals();
      saveMeal({
        date: activeDate,
        mealType: e.mealType,
        items: [
          {
            custom: true,
            name: e.label,
            grams: e.baseGrams ?? 0,
            kcal: e.kcal,
            protein: e.protein,
            fat: e.fat,
            carbs: e.carbs,
            ...(e.sugar != null ? { sugar: e.sugar } : {}),
          },
        ],
      });
      haptic("success");
      if (!celebrateMeal(before))
        toast(`✓ ${e.label} · +${Math.round(e.kcal)} kkal`, "success");
      reloadFromStore();
    },
    [activeDate, celebrateMeal, reloadFromStore],
  );

  // "Makan biasa" for the current main meal, when it is still empty today.
  const usualOffer = useMemo<UsualOffer | null>(() => {
    if (!activeDate || activeDate !== todayStr) return null;
    if (!nowSlot || nowSlot === "snack") return null;
    if (slots.find((x) => x.key === nowSlot)?.items.length) return null;
    try {
      return readUsualMeal(nowSlot, activeDate);
    } catch {
      return null;
    }
  }, [activeDate, todayStr, nowSlot, slots]);
  const logUsual = useCallback(() => {
    if (!usualOffer) return;
    const before = getAllMeals();
    const logged = logUsualMeal(usualOffer, activeDate);
    haptic("success");
    if (celebrateMeal(before)) setUsualUndo(logged);
    else toast(`${usualOffer.label} tercatat`, "success");
    reloadFromStore();
  }, [usualOffer, activeDate, celebrateMeal, reloadFromStore]);
  const undoUsual = useCallback(() => {
    if (usualUndo) {
      undoUsualMeal(usualUndo.mealId, usualUndo.stamp);
      undoAcceptedMealShadow(usualUndo.mealId, usualUndo.stamp);
    }
    setCelebration(null);
    setUsualUndo(null);
    haptic("tap");
    reloadFromStore();
    setShadowTick((t) => t + 1);
    toast(`${celebration?.title.replace(" tercatat", "") ?? "Catatan"} dibatalkan`, "success");
  }, [usualUndo, celebration, reloadFromStore]);

  const mealShadows = useMemo<ShadowRecommendation[]>(() => {
    if (!loaded || !activeDate) return [];
    try {
      return getMealShadowOffers({
        date: activeDate,
        mealSlot: nowSlot ?? inferMealType(),
        limit: 3,
      });
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, activeDate, nowSlot, allMeals, gymDay, shadowTick]);

  const confirmMealShadow = useCallback(
    (offer: ShadowRecommendation, edit?: MealQuickEditResult) => {
      if (!activeDate) return;
      const before = getAllMeals();
      const res = acceptMealShadow(offer, {
        date: activeDate,
        mealType: edit?.slot,
        customCombo: edit?.combo,
      });
      setEditingShadow(null);
      if (!res) return;
      haptic("success");
      if (celebrateMeal(before)) {
        setUsualUndo({ mealId: res.mealId, stamp: res.stamp });
      } else {
        toast(`✓ ${res.label} · +${res.kcal} kkal`, "success");
      }
      reloadFromStore();
      setShadowTick((t) => t + 1);
    },
    [activeDate, celebrateMeal, reloadFromStore],
  );

  const dismissMealShadow = useCallback((offer: ShadowRecommendation) => {
    dismissShadowOffer(offer.targetNodeId);
    setShadowTick((t) => t + 1);
  }, []);

  const mealNames: Record<MealType, string> = {
    breakfast: "Sarapan",
    lunch: "Makan siang",
    snack: "Camilan",
    dinner: "Makan malam",
  };
  return (
    <main className="friendly-page meal-page">
      <header className="mk-head">
        <h1>Makan</h1>
        <button
          className="mk-date"
          aria-haspopup="dialog"
          onClick={() => setPickerOpen(true)}
        >
          {activeDate === todayStr ? "Hari ini" : shortDate(activeDate)}
          <Icon name="chevron" size={16} />
        </button>
      </header>

      <section className="mk-summary" aria-label="Nutrisi hari ini">
        <div className="mk-summary-main">
          <TodayRings
            kcal={totals.kcal}
            kcalTarget={target.kcal}
            protein={totals.protein}
            proteinTarget={target.protein}
            size={112}
          />
          <div className="hud-legend">
            <div className="kcal">
              <span>Kalori</span>
              <strong>
                {fmt(totals.kcal)}
                <small> / {fmt(target.kcal)} kkal</small>
              </strong>
              <small>
                {target.kcal - totals.kcal >= 0
                  ? `${fmt(target.kcal - totals.kcal)} kkal tersisa`
                  : `${fmt(totals.kcal - target.kcal)} kkal di atas target`}
              </small>
              {adj.bonusKcal > 0 && (
                <small className="mk-bonus">
                  Termasuk +{fmt(adj.bonusKcal)} kkal dari latihan
                </small>
              )}
            </div>
            <div className="protein">
              <span>Protein</span>
              <strong>
                {fmt(totals.protein)}
                <small> / {fmt(target.protein)} g</small>
              </strong>
              <small>
                {target.protein - totals.protein > 0
                  ? `${fmt(target.protein - totals.protein)} g lagi`
                  : "Target tercapai"}
              </small>
            </div>
            <p className="mk-macros">
              {`Karbo\u00a0${fmt(totals.carbs)}\u00a0/\u00a0${target.carbs}\u00a0g`}
              {` · Lemak\u00a0${fmt(totals.fat)}\u00a0/\u00a0${target.fat}\u00a0g`}
              {sugarTotal > 0 ? ` · Gula ${round1(sugarTotal)}\u00a0g` : ""}
            </p>
          </div>
        </div>
        <div className="mk-daytype">
          <span id="mk-daytype-label">Target hari</span>
          <div
            className="segment"
            role="group"
            aria-labelledby="mk-daytype-label"
          >
            <button aria-pressed={gymDay} onClick={() => toggleGym(true)}>
              Latihan
            </button>
            <button aria-pressed={!gymDay} onClick={() => toggleGym(false)}>
              Istirahat
            </button>
          </div>
        </div>
      </section>

      <section className="mk-quick" aria-labelledby="mk-quick-title">
        <h2 className="mk-section-title" id="mk-quick-title">
          Catat cepat
        </h2>
        {mealShadows.length > 0 && (
          <ShadowRecommendations
            offers={mealShadows}
            variant="meal"
            title="Tombol Bayangan"
            subtitle="Habit Graph"
            onConfirm={(o) => confirmMealShadow(o)}
            onQuickEdit={(o) => setEditingShadow(o)}
            onDismiss={dismissMealShadow}
          />
        )}
        <div className="mk-chips">
          {usualOffer && (
            <button className="mk-chip usual" onClick={logUsual}>
              <Icon name="meal" size={18} />
              <span>
                <strong>{MEAL_TITLE[usualOffer.slot]} biasa</strong>
                <small>
                  {usualOffer.label} · {fmt(usualOffer.kcal)} kkal
                </small>
              </span>
            </button>
          )}
          {quickEntries.map((e) => (
            <button className="mk-chip" key={e.id} onClick={() => logQuick(e)}>
              <Icon name="plus" size={18} />
              <span>
                <strong>{e.label}</strong>
                <small>{fmt(e.kcal)} kkal</small>
              </span>
            </button>
          ))}
          <button
            className="mk-chip manage"
            onClick={() => setManageOpen(true)}
          >
            {quickEntries.length ? "Atur" : "Atur menu cepat"}
          </button>
        </div>
      </section>

      <section className="mk-day" aria-labelledby="mk-day-title">
        <h2 className="mk-section-title" id="mk-day-title">
          {activeDate === todayStr
            ? "Hari ini"
            : dateLine.toLocaleLowerCase("id-ID")}
        </h2>
        <div className="mk-day-list">
          {slots.map((s) => {
            const isNow = s.key === nowSlot && activeDate === todayStr;
            return (
              <section
                key={s.key}
                className={`mk-slot${isNow ? " now" : ""}`}
                aria-labelledby={`mk-slot-${s.key}`}
              >
                <header className="mk-slot-head">
                  <h3 id={`mk-slot-${s.key}`}>
                    {mealNames[s.key]}
                    {isNow && <span className="mk-now">Sekarang</span>}
                  </h3>
                  <span className="mk-slot-kcal">
                    {fmt(s.kcal)} <small>kkal</small>
                  </span>
                </header>
                {s.items.length ? (
                  <ul className="mk-items">
                    {s.items.map((it) => (
                      <li className="mk-item" key={it.key}>
                        <button
                          type="button"
                          className="mk-item-trigger"
                          aria-label={`Edit ${it.name}`}
                          onClick={() => {
                            haptic("tap");
                            setEditingLogged({
                              mealId: it.mealId,
                              itemIndex: it.itemIndex,
                              date: activeDate,
                              mealType: it.mealType,
                              item: it.rawItem,
                            });
                          }}
                        >
                          <span className="mk-item-name">
                            <strong>{it.name}</strong>
                            <small>
                              {it.detail} <span className="mk-item-edit-hint">· edit</span>
                            </small>
                          </span>
                          <span className="mk-item-kcal">
                            {fmt(it.kcal)} kkal
                          </span>
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Hapus ${it.name}`}
                          onClick={() =>
                            setPendingDelete({
                              mealId: it.mealId,
                              itemIndex: it.itemIndex,
                              name: it.name,
                            })
                          }
                        >
                          <Icon name="close" size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mk-empty">Belum ada</p>
                )}
                <button
                  className="mk-add"
                  onClick={() => setBuilderMeal(s.key)}
                >
                  <Icon name="plus" size={16} />
                  Tambah ke {mealNames[s.key].toLowerCase()}
                </button>
              </section>
            );
          })}
        </div>
      </section>

      <div className="food-actions">
        <button
          className="primary-button"
          onClick={() => setBuilderMeal(nowSlot ?? inferMealType())}
        >
          <Icon name="search" />
          <span className="dock-label">
            Cari makanan
            <small>{mealNames[nowSlot ?? inferMealType()].toLowerCase()}</small>
          </span>
        </button>
        <button
          className="secondary-button"
          onClick={() => setRacikMeal(nowSlot ?? inferMealType())}
        >
          <Icon name="pot" />
          Racik
        </button>
        <button
          className="secondary-button"
          onClick={() => setLabelMeal(nowSlot ?? inferMealType())}
        >
          <Icon name="scan" />
          Scan label
        </button>
      </div>
      {labelMeal && (
        <FoodBuilder
          meal={labelMeal}
          dateKey={activeDate}
          startInLabel
          onClose={() => setLabelMeal(null)}
          onSaved={(before) => {
            setLabelMeal(null);
            celebrateMeal(before);
            reloadFromStore();
          }}
        />
      )}
      {builderMeal && (
        <FoodBuilder
          meal={builderMeal}
          dateKey={activeDate}
          onClose={() => setBuilderMeal(null)}
          onSaved={(before) => {
            setBuilderMeal(null);
            celebrateMeal(before);
            reloadFromStore();
          }}
        />
      )}

      {racikMeal && (
        <FoodBuilder
          meal={racikMeal}
          dateKey={activeDate}
          startInRacik
          onClose={() => setRacikMeal(null)}
          onSaved={(before) => {
            setRacikMeal(null);
            celebrateMeal(before);
            reloadFromStore();
          }}
        />
      )}

      {celebration && (
        <ProgressCelebration
          c={celebration.c}
          title={celebration.title}
          onClose={closeCelebration}
          onUndo={usualUndo ? undoUsual : undefined}
        />
      )}

      {/* delete confirmation — nothing is removed on the swipe itself; the
          user must confirm here, so an accidental slide can't wipe a food. */}
      {pendingDelete && (
        <div
          className={`mk-dlg-backdrop${deleteClosing ? " closing" : ""}`}
          onClick={() => closeDelete(false)}
        >
          <div
            className="mk-dlg"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mk-dlg-title"
            aria-describedby="mk-dlg-desc"
            onClick={(ev) => ev.stopPropagation()}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") closeDelete(false);
            }}
          >
            <h2 id="mk-dlg-title">Hapus {pendingDelete.name}?</h2>
            <p id="mk-dlg-desc">
              Makanan ini hilang dari catatan dan totalnya ikut berkurang.
              Tidak bisa dibatalkan.
            </p>
            <div className="mk-dlg-actions">
              <button
                type="button"
                className="secondary-button"
                autoFocus
                onClick={() => closeDelete(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="mk-danger"
                onClick={() => closeDelete(true)}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* manage quick-log sheet */}
      {manageOpen && (
        <div
          className="mk-sheet-backdrop"
          onClick={() => setManageOpen(false)}
        >
          <div
            className="mk-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mk-manage-title"
            onClick={(ev) => ev.stopPropagation()}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") setManageOpen(false);
            }}
          >
            <h2 id="mk-manage-title">Atur catat cepat</h2>
            <p>Menu yang muncul di "Catat cepat". Urutkan, ubah, atau hapus.</p>
            {quickEntries.length === 0 ? (
              <p className="mk-empty">
                Belum ada. Tambahkan makanan yang sering kamu catat.
              </p>
            ) : (
              <ul className="mk-manage-list">
                {quickEntries.map((e, i) => (
                  <li key={e.id}>
                    <span className="mk-item-name">
                      <strong>{e.label}</strong>
                      <small>
                        {MEAL_TITLE[e.mealType]} · {fmt(e.kcal)} kkal
                      </small>
                    </span>
                    <span className="mk-manage-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Naikkan ${e.label}`}
                        disabled={i === 0}
                        onClick={() =>
                          setQuickEntries(moveQuickLogEntry(e.id, -1))
                        }
                      >
                        <Icon
                          name="chevron"
                          size={18}
                          style={{ transform: "rotate(180deg)" }}
                        />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Turunkan ${e.label}`}
                        disabled={i === quickEntries.length - 1}
                        onClick={() =>
                          setQuickEntries(moveQuickLogEntry(e.id, 1))
                        }
                      >
                        <Icon name="chevron" size={18} />
                      </button>
                      <button
                        type="button"
                        className="mk-text-btn"
                        onClick={() => setEditDraft(e)}
                      >
                        Ubah
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Hapus ${e.label}`}
                        onClick={() =>
                          setQuickEntries(deleteQuickLogEntry(e.id))
                        }
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="secondary-button mk-sheet-wide"
              onClick={() =>
                setEditDraft({
                  label: "",
                  mealType: "snack",
                  kcal: 0,
                  protein: 0,
                  carbs: 0,
                  fat: 0,
                })
              }
            >
              <Icon name="plus" size={18} />
              Tambah menu cepat
            </button>
            <button
              type="button"
              className="primary-button mk-sheet-wide"
              onClick={() => setManageOpen(false)}
            >
              Selesai
            </button>
          </div>
        </div>
      )}

      {/* quick-log entry editor (layered above manage sheet) */}
      {editDraft && (
        <div
          className="mk-sheet-backdrop editor"
          onClick={() => setEditDraft(null)}
        >
          <div
            className="mk-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mk-edit-title"
            onClick={(ev) => ev.stopPropagation()}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") setEditDraft(null);
            }}
          >
            <h2 id="mk-edit-title">
              {editDraft.id ? "Ubah menu cepat" : "Menu cepat baru"}
            </h2>

            <label style={editLabelStyle}>Nama</label>
            <input
              type="text"
              value={editDraft.label}
              onChange={(ev) =>
                setEditDraft({ ...editDraft, label: ev.target.value })
              }
              placeholder="mis. Oatmeal + Pisang"
              style={editInputStyle}
            />

            <label style={editLabelStyle}>Waktu makan</label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {(["breakfast", "lunch", "snack", "dinner"] as const).map(
                (mt) => (
                  <button
                    key={mt}
                    type="button"
                    onClick={() => setEditDraft({ ...editDraft, mealType: mt })}
                    style={toggleStyle(editDraft.mealType === mt)}
                  >
                    {MEAL_ID_LABEL[mt]}
                  </button>
                ),
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 14,
              }}
            >
              <label style={{ ...editLabelStyle, marginTop: 0 }}>
                Porsi dan nilai gizi
              </label>
              <button
                type="button"
                onClick={() => setLockRatio((v) => !v)}
                style={{
                  fontFamily: SANS,
                  fontSize: 13,
                  fontWeight: 600,
                  minHeight: 36,
                  padding: "6px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  color: lockRatio ? "var(--calm-accent)" : "var(--calm-muted)",
                  background: lockRatio ? "var(--calm-accent-soft)" : "#fff",
                  border: lockRatio
                    ? "1px solid var(--calm-accent)"
                    : "1px solid var(--calm-border)",
                }}
              >
                {lockRatio ? "Rasio terkunci" : "Ubah bebas"}
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginTop: 8,
              }}
            >
              <NumField
                label="Porsi (g)"
                value={editDraft.baseGrams ?? 0}
                onChange={(n) =>
                  setEditDraft((d) => {
                    if (!d) return d;
                    const old = d.baseGrams ?? 0;
                    if (lockRatio && old > 0) {
                      const s = n / old;
                      return {
                        ...d,
                        baseGrams: n,
                        kcal: Math.round(d.kcal * s),
                        protein: round1(d.protein * s),
                        carbs: round1(d.carbs * s),
                        fat: round1(d.fat * s),
                      };
                    }
                    return { ...d, baseGrams: n };
                  })
                }
              />
              <NumField
                label="Kalori (kkal)"
                value={editDraft.kcal}
                onChange={(n) =>
                  setEditDraft((d) => {
                    if (!d) return d;
                    if (lockRatio && d.kcal > 0) {
                      const s = n / d.kcal;
                      return {
                        ...d,
                        kcal: n,
                        protein: round1(d.protein * s),
                        carbs: round1(d.carbs * s),
                        fat: round1(d.fat * s),
                        ...(d.baseGrams
                          ? { baseGrams: Math.round(d.baseGrams * s) }
                          : {}),
                      };
                    }
                    return { ...d, kcal: n };
                  })
                }
              />
              <NumField
                label="Protein (g)"
                value={editDraft.protein}
                onChange={(n) => setEditDraft({ ...editDraft, protein: n })}
              />
              <NumField
                label="Karbo (g)"
                value={editDraft.carbs}
                onChange={(n) => setEditDraft({ ...editDraft, carbs: n })}
              />
              <NumField
                label="Lemak (g)"
                value={editDraft.fat}
                onChange={(n) => setEditDraft({ ...editDraft, fat: n })}
              />
              <NumField
                label="Gula (g)"
                value={editDraft.sugar ?? 0}
                onChange={(n) => setEditDraft({ ...editDraft, sugar: n })}
              />
            </div>

            <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setEditDraft(null)}
                className="secondary-button"
                style={{ flex: 1, minHeight: 48 }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = editDraft;
                  const label = d.label.trim();
                  if (!label) {
                    toast("Nama tidak boleh kosong", "warn");
                    return;
                  }
                  if (d.kcal < 0) {
                    toast("Kalori tidak boleh negatif", "warn");
                    return;
                  }
                  const payload = {
                    label,
                    mealType: d.mealType,
                    kcal: d.kcal,
                    protein: d.protein,
                    carbs: d.carbs,
                    fat: d.fat,
                    ...(d.sugar != null ? { sugar: d.sugar } : {}),
                    ...(d.baseGrams ? { baseGrams: d.baseGrams } : {}),
                  };
                  const next = d.id
                    ? updateQuickLogEntry(d.id, payload)
                    : addQuickLogEntry(payload);
                  setQuickEntries(next);
                  haptic("success");
                  setEditDraft(null);
                }}
                className="primary-button"
                style={{ flex: 1, minHeight: 48 }}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerOpen && activeDate && (
        <DatePicker
          activeDate={activeDate}
          todayStr={todayStr}
          onPick={(d) => {
            setActiveDate(d);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {editingShadow && (
        <ShadowQuickEditSheet
          offer={editingShadow}
          onClose={() => setEditingShadow(null)}
          onSaveMeal={confirmMealShadow}
        />
      )}
      <EditMealItemSheet
        target={editingLogged}
        onClose={() => setEditingLogged(null)}
        onSave={(mealId, itemIndex, updatedItem, targetDate, targetSlot) => {
          moveMealItem(mealId, itemIndex, updatedItem, targetDate, targetSlot);
          setEditingLogged(null);
          haptic("success");
          toast("Catatan makanan diperbarui", "success");
          reloadFromStore();
        }}
        onDelete={(mealId, itemIndex, itemName) => {
          setPendingDelete({ mealId, itemIndex, name: itemName });
        }}
      />
    </main>
  );
}
