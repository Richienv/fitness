"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
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
import { TARGETS } from "@/lib/targets";
import { useActiveDate, parseDate } from "@/lib/activeDate";
import { haptic } from "@/lib/haptics";
import { toast } from "../Toast";
import DatePicker from "./DatePicker";
import FoodBuilder from "./FoodBuilder";
import Icon from "../ui/Icon";
import NutritionSummary from "./NutritionSummary";
import MorningScene from "./MorningScene";
import { useSheetBack } from "@/lib/backSheet";

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

/** Local clock time (HH:MM) of an epoch-ms stamp — when a food was logged. */
function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** A single row that can be swiped (left or right) to *request* a delete. Below
 *  a small drag threshold a tap opens the meal; past the threshold the row snaps
 *  back and calls onRequestDelete, which opens a confirmation dialog — nothing is
 *  removed until the user confirms. The row never keeps a "flung-off" state, so
 *  after a delete the remaining rows can't inherit a stale swipe/gone state.
 *  Uses pointer events so it works on touch and mouse. */
function SwipeRow({
  onTap,
  onRequestDelete,
  children,
}: {
  onTap: () => void;
  onRequestDelete: () => void;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const st = useRef<{ x: number; y: number; drag: boolean } | null>(null);
  // Low trigger point — the confirmation dialog is the safety net, so opening it
  // should feel easy. Past this point the finger meets gentle resistance
  // (rubber-band) so the gesture has a tactile "wall", the way iOS drags feel.
  const THRESH = 64;

  /** Rubber-band: track the finger 1:1 up to THRESH, then let only a fraction of
   *  further travel through, so the row resists like it has weight. */
  const damp = (raw: number) => {
    const a = Math.abs(raw);
    if (a <= THRESH) return raw;
    const over = a - THRESH;
    const eased = THRESH + over * (1 - over / (over + 220));
    return raw < 0 ? -eased : eased;
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    st.current = { x: e.clientX, y: e.clientY, drag: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s) return;
    const ddx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (!s.drag && Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy))
      s.drag = true;
    if (s.drag) setDx(damp(ddx));
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (!s) return;
    if (!s.drag) {
      onTap();
      return;
    }
    // Always settle back with weight; open the confirmation if dragged far enough.
    const trigger = Math.abs(dx) > THRESH;
    setDx(0);
    if (trigger) onRequestDelete();
  };

  const dragging = st.current?.drag ?? false;
  const prog = Math.min(1, Math.abs(dx) / THRESH);
  return (
    <div style={{ position: "relative", borderRadius: 12 }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: dx < 0 ? "flex-end" : "flex-start",
          padding: "0 14px",
          borderRadius: 12,
          background: `linear-gradient(90deg,rgba(238,60,48,${0.06 + prog * 0.24}),rgba(238,60,48,${0.02 + prog * 0.08}))`,
          color: "var(--text)",
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: ".12em",
          opacity: prog,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            // The label eases in and nudges toward the swiped edge as you pass
            // the trigger, so the gesture confirms itself before you let go.
            transform: `translateX(${(dx < 0 ? 1 : -1) * (1 - prog) * 10}px) scale(${0.86 + prog * 0.14})`,
            transition: dragging ? "none" : "transform .34s var(--ease-ios)",
            fontWeight: prog >= 1 ? 700 : 400,
          }}
        >
          HAPUS
        </span>
      </div>
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          st.current = null;
          setDx(0);
        }}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderRadius: 12,
          textAlign: "left",
          cursor: "pointer",
          touchAction: "pan-y",
          transform: `translateX(${dx}px)`,
          // 1:1 finger tracking while dragging (direct manipulation); on release
          // it settles back with a weighty, slightly springy decelerate.
          transition: dragging ? "none" : "transform .44s var(--ease-spring)",
          willChange: "transform",
          // Rows sit *inside* a slot card, so they carry no card chrome of their
          // own — only the swipe background behind them reads as a surface.
          background: dragging || dx !== 0 ? "var(--surface)" : "transparent",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const MEAL_ID_LABEL: Record<MealType, string> = {
  breakfast: "SARAPAN",
  lunch: "SIANG",
  snack: "SNACK",
  dinner: "MALAM",
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
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 15 && h < 18) return "snack";
  return "dinner";
}

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
    padding: "11px",
    borderRadius: 12,
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: ".06em",
    cursor: "pointer",
    border: active
      ? "1px solid rgba(255,150,120,.6)"
      : "1px solid rgba(84,119,93,.1)",
    background: active ? FIRE : "rgba(84,119,93,.03)",
    color: active ? "var(--text)" : "#7c736e",
    boxShadow: active
      ? "inset 0 1.5px 1px rgba(255,225,205,.6),0 6px 16px rgba(238,60,48,.35)"
      : "none",
    textShadow: active ? "0 1px 2px rgba(120,15,5,.5)" : "none",
  };
}

/** The compact GYM / REST segment in the header — same job as the old
 *  full-width toggle row, a fraction of the space. */
function segStyle(active: boolean): CSSProperties {
  return {
    padding: "8px 13px",
    borderRadius: 9,
    fontFamily: MONO,
    fontSize: 9.5,
    fontWeight: active ? 700 : 400,
    letterSpacing: ".1em",
    cursor: "pointer",
    color: active ? "var(--text)" : "#7c736e",
    background: active ? FIRE : "transparent",
    border: active ? "1px solid rgba(255,150,120,.5)" : "1px solid transparent",
    textShadow: active ? "0 1px 2px rgba(120,15,5,.5)" : "none",
  };
}

/** Small round icon button used in the manage-sheet rows. */
function manageIconStyle(disabled: boolean): CSSProperties {
  return {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 9,
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 1,
    cursor: disabled ? "default" : "pointer",
    color: disabled ? "#4a4642" : "var(--text)",
    background: "rgba(84,119,93,.04)",
    border: "1px solid rgba(84,119,93,.1)",
    opacity: disabled ? 0.4 : 1,
  };
}

const editLabelStyle: CSSProperties = {
  display: "block",
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: ".12em",
  color: "#7c736e",
  marginTop: 16,
};

const editInputStyle: CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "11px 12px",
  borderRadius: 12,
  fontFamily: SANS,
  fontSize: 16, // ≥16 avoids iOS focus zoom
  color: "var(--text)",
  background: "rgba(84,119,93,.04)",
  border: "1px solid rgba(84,119,93,.12)",
  outline: "none",
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
function macroLine(
  protein: number,
  carbs: number,
  fat: number,
  sugar: number | null | undefined,
): string {
  return (
    `${Math.round(protein)}g protein · ${Math.round(carbs)}g karbo` +
    ` · ${Math.round(fat)}g lemak` +
    (sugar == null ? " · gula belum tersedia" : ` · ${Math.round(sugar)}g gula`)
  );
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
      detail: `${portion} · ${macroLine(it.protein, it.carbs, it.fat, it.sugar)}`,
    };
  }
  const ing = getIngredient(it.id);
  const m = macrosFor(it.id, it.qty);
  const portion = ing?.gramsPerUnit
    ? `${Math.round(ing.gramsPerUnit * it.qty)} g`
    : `${round1(it.qty)}×`;
  const sugar = ing?.sugar == null ? null : ing.sugar * it.qty;
  return {
    name: ing ? foodLabel(ing) : it.id,
    kcal: m.kcal,
    detail: `${portion} · ${macroLine(m.protein, m.carbs, m.fat, sugar)}`,
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
  const [barcodeMeal, setBarcodeMeal] = useState<MealType | null>(null);
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

  // Hardware back closes the top-most open sheet instead of leaving the page.
  // (FoodBuilder wires its own step-aware handler internally.)
  useSheetBack(pickerOpen, () => setPickerOpen(false));
  useSheetBack(manageOpen, () => setManageOpen(false));
  useSheetBack(!!editDraft, () => setEditDraft(null));

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

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const dateLine = bahasaDate(activeDate);

  // Log a configured quick-log entry straight into the day (no navigation).
  const logQuick = useCallback(
    (e: QuickLogEntry) => {
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
      toast(`✓ ${e.label} · +${Math.round(e.kcal)} kkal`, "success");
      reloadFromStore();
    },
    [activeDate, reloadFromStore],
  );

  const mealNames: Record<MealType, string> = {
    breakfast: "Sarapan",
    lunch: "Makan siang",
    snack: "Camilan",
    dinner: "Makan malam",
  };
  return (
    <main className="friendly-page meal-page">
      <header className="page-top">
        <div>
          <p className="eyebrow">Catatan harian</p>
          <h1>Makan</h1>
        </div>
        <button className="soft-button" onClick={() => setPickerOpen(true)}>
          {activeDate === todayStr ? "Hari ini" : activeDate}
          <Icon name="sun" size={18} />
        </button>
      </header>
      <p className="quiet date-caption">
        {dateLine.toLocaleLowerCase("id-ID")}
      </p>
      <section className="daily-nutrition">
        <div className="row-between">
          <h2>Nutrisi hari ini</h2>
          <div className="segment">
            <button aria-pressed={gymDay} onClick={() => toggleGym(true)}>
              Latihan
            </button>
            <button aria-pressed={!gymDay} onClick={() => toggleGym(false)}>
              Istirahat
            </button>
          </div>
        </div>
        <NutritionSummary values={totals} />
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
            aria-label="Kalori dari target harian"
          />
        </div>
        <details className="nutrition-targets">
          <summary>Target dan detail nutrisi</summary>
          <p>
            Protein {round1(totals.protein)} / {target.protein} g · Karbohidrat{" "}
            {round1(totals.carbs)} / {target.carbs} g · Lemak{" "}
            {round1(totals.fat)} / {target.fat} g · Gula tercatat{" "}
            {round1(sugarTotal)} g
          </p>
        </details>
      </section>
      <div className="food-actions">
        <button
          className="primary-button"
          onClick={() => setBuilderMeal(nowSlot ?? inferMealType())}
        >
          <Icon name="search" />
          Cari makanan
        </button>
        <button
          className="secondary-button"
          onClick={() => setRacikMeal(nowSlot ?? inferMealType())}
        >
          <Icon name="pot" />
          Racik masakan
        </button>
        <button
          className="secondary-button"
          onClick={() => setBarcodeMeal(nowSlot ?? inferMealType())}
        >
          <Icon name="barcode" />
          Scan barcode
        </button>
      </div>
      <div className="meal-slots">
        {slots.map((s) => (
          <section
            key={s.key}
            className={`meal-slot ${s.key === "breakfast" ? "breakfast-slot" : ""}${s.key === nowSlot && activeDate === todayStr ? " current" : ""}`}
          >
            {s.key === "breakfast" && <MorningScene />}
            <header className="row-between">
              <div>
                <h2>{mealNames[s.key]}</h2>
                <p className="quiet">
                  {s.window}
                  {s.key === nowSlot && activeDate === todayStr
                    ? " · Sekarang"
                    : ""}
                </p>
              </div>
              <span className="slot-kcal">
                {Math.round(s.kcal)} <small>kkal</small>
              </span>
            </header>
            {s.items.length ? (
              s.items.map((it) => (
                <div className="logged-food" key={it.key}>
                  <button
                    className="logged-food-main"
                    onClick={() => setBuilderMeal(s.key)}
                  >
                    <strong>{it.name}</strong>
                    <small>{it.detail}</small>
                  </button>
                  <span>{Math.round(it.kcal)} kkal</span>
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
                    <Icon name="close" />
                  </button>
                </div>
              ))
            ) : (
              <p className="empty-note">Belum ada makanan dicatat.</p>
            )}
            <button className="slot-add" onClick={() => setBuilderMeal(s.key)}>
              <Icon name="plus" />
              Catat {mealNames[s.key].toLowerCase()}
            </button>
          </section>
        ))}
      </div>
      <details className="quick-log">
        <summary>Menu cepat tersimpan ({quickEntries.length})</summary>
        <div className="quick-log-grid">
          {quickEntries.map((e) => (
            <button
              className="soft-button"
              key={e.id}
              onClick={() => logQuick(e)}
            >
              <span>
                {e.label}
                <small>{Math.round(e.kcal)} kkal</small>
              </span>
              <Icon name="plus" />
            </button>
          ))}
        </div>
        <button className="text-button" onClick={() => setManageOpen(true)}>
          Kelola menu cepat
        </button>
      </details>
      {barcodeMeal && (
        <FoodBuilder
          meal={barcodeMeal}
          dateKey={activeDate}
          startInBarcode
          onClose={() => setBarcodeMeal(null)}
          onSaved={() => {
            setBarcodeMeal(null);
            reloadFromStore();
          }}
        />
      )}
      {builderMeal && (
        <FoodBuilder
          meal={builderMeal}
          dateKey={activeDate}
          onClose={() => setBuilderMeal(null)}
          onSaved={() => {
            setBuilderMeal(null);
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
          onSaved={() => {
            setRacikMeal(null);
            reloadFromStore();
          }}
        />
      )}

      {/* delete confirmation — nothing is removed on the swipe itself; the
          user must confirm here, so an accidental slide can't wipe a food. */}
      {pendingDelete && (
        <div
          onClick={() => closeDelete(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 240,
            background: "rgba(5,4,6,.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            animation: deleteClosing
              ? "dlgBackdropOut .23s var(--ease-standard) both"
              : "dlgBackdropIn .32s var(--ease-out) both",
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              width: "100%",
              maxWidth: 360,
              borderRadius: 24,
              padding: "24px 22px 20px",
              background: "var(--surface)",
              border: "1px solid rgba(84,119,93,.12)",
              boxShadow: "none",
              transformOrigin: "center bottom",
              willChange: "transform, opacity",
              animation: deleteClosing
                ? "dlgCardOut .23s var(--ease-standard) both"
                : "dlgCardIn .46s var(--ease-ios) both",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                fontSize: 22,
                margin: "0 auto 14px",
                background: "rgba(238,60,48,.1)",
                border: "1px solid rgba(238,60,48,.3)",
              }}
            >
              HAPUS
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 17,
                color: "var(--text)",
                textAlign: "center",
              }}
            >
              Hapus makanan ini?
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 14,
                color: "var(--text)",
                textAlign: "center",
                marginTop: 6,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {pendingDelete.name}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: ".04em",
                color: "#7c736e",
                textAlign: "center",
                marginTop: 8,
                lineHeight: 1.4,
              }}
            >
              Nggak bisa dibatalin setelah dihapus.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="dlg-btn"
                onClick={() => closeDelete(false)}
                style={{
                  flex: 1,
                  padding: "13px 0",
                  borderRadius: 14,
                  fontFamily: MONO,
                  fontSize: 12,
                  letterSpacing: ".1em",
                  color: "var(--text)",
                  cursor: "pointer",
                  background: "rgba(84,119,93,.05)",
                  border: "1px solid rgba(84,119,93,.14)",
                }}
              >
                BATAL
              </button>
              <button
                type="button"
                className="dlg-btn"
                onClick={() => closeDelete(true)}
                style={{
                  flex: 1,
                  padding: "13px 0",
                  borderRadius: 14,
                  fontFamily: MONO,
                  fontSize: 12,
                  letterSpacing: ".1em",
                  fontWeight: 700,
                  color: "var(--text)",
                  cursor: "pointer",
                  background: "var(--surface)",
                  border: "1px solid rgba(255,150,120,.5)",
                }}
              >
                HAPUS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* manage quick-log sheet */}
      {manageOpen && (
        <div
          onClick={() => setManageOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(5,4,6,.72)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "0 auto",
              borderRadius: "26px 26px 0 0",
              padding: "22px 20px calc(30px + env(safe-area-inset-bottom))",
              background: "var(--surface)",
              borderTop: "1px solid rgba(84,119,93,.1)",
              boxShadow: "none",
              animation: "sheetCardIn .44s var(--ease-ios) both",
              maxHeight: "80dvh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 18,
                color: "var(--text)",
              }}
            >
              ATUR CATAT CEPAT
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: ".06em",
                color: "#7c736e",
                marginTop: 5,
              }}
            >
              Yang muncul di baris atas — tambah, ubah, atau hapus
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 16,
              }}
            >
              {quickEntries.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 13,
                    background:
                      "linear-gradient(180deg,rgba(84,119,93,.04),transparent 40%),#0d0b0c",
                    border: "1px solid rgba(84,119,93,.09)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontWeight: 700,
                        fontSize: 13,
                        color: "var(--text)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {e.label}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: ".08em",
                        color: "#8a837d",
                        marginTop: 2,
                      }}
                    >
                      {MEAL_ID_LABEL[e.mealType]} · {Math.round(e.kcal)} kkal
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Naik"
                    disabled={i === 0}
                    onClick={() => setQuickEntries(moveQuickLogEntry(e.id, -1))}
                    style={manageIconStyle(i === 0)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Turun"
                    disabled={i === quickEntries.length - 1}
                    onClick={() => setQuickEntries(moveQuickLogEntry(e.id, 1))}
                    style={manageIconStyle(i === quickEntries.length - 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Ubah"
                    onClick={() => setEditDraft(e)}
                    style={manageIconStyle(false)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label="Hapus"
                    onClick={() => setQuickEntries(deleteQuickLogEntry(e.id))}
                    style={manageIconStyle(false)}
                  >
                    HAPUS
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
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
              style={{
                width: "100%",
                marginTop: 14,
                padding: "12px",
                borderRadius: 13,
                fontFamily: MONO,
                fontSize: 12,
                letterSpacing: ".08em",
                color: "var(--text)",
                cursor: "pointer",
                background: FIRE,
                border: "1px solid rgba(255,150,120,.6)",
                boxShadow: "none",
              }}
            >
              ＋ TAMBAH
            </button>
            <button
              type="button"
              onClick={() => setManageOpen(false)}
              style={{
                width: "100%",
                marginTop: 9,
                padding: "11px",
                borderRadius: 13,
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: ".1em",
                color: "#9a938d",
                cursor: "pointer",
                background: "rgba(84,119,93,.03)",
                border: "1px solid rgba(84,119,93,.1)",
              }}
            >
              TUTUP
            </button>
          </div>
        </div>
      )}

      {/* quick-log entry editor (layered above manage sheet) */}
      {editDraft && (
        <div
          onClick={() => setEditDraft(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 215,
            background: "rgba(5,4,6,.72)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "0 auto",
              borderRadius: "26px 26px 0 0",
              padding: "22px 20px calc(30px + env(safe-area-inset-bottom))",
              background: "var(--surface)",
              borderTop: "1px solid rgba(84,119,93,.1)",
              boxShadow: "none",
              animation: "sheetCardIn .44s var(--ease-ios) both",
              maxHeight: "88dvh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 18,
                color: "var(--text)",
              }}
            >
              {editDraft.id ? "UBAH ENTRI" : "ENTRI BARU"}
            </div>

            <label style={editLabelStyle}>NAMA</label>
            <input
              type="text"
              value={editDraft.label}
              onChange={(ev) =>
                setEditDraft({ ...editDraft, label: ev.target.value })
              }
              placeholder="mis. Oatmeal + Pisang"
              style={editInputStyle}
            />

            <label style={editLabelStyle}>WAKTU</label>
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
                PORSI (g) &amp; RASIO
              </label>
              <button
                type="button"
                onClick={() => setLockRatio((v) => !v)}
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".08em",
                  padding: "6px 11px",
                  borderRadius: 10,
                  cursor: "pointer",
                  color: lockRatio ? "var(--text)" : "#9a938d",
                  background: lockRatio ? FIRE : "rgba(84,119,93,.04)",
                  border: lockRatio
                    ? "1px solid rgba(255,150,120,.6)"
                    : "1px solid rgba(84,119,93,.12)",
                }}
              >
                {lockRatio ? "KUNCI RASIO" : "BEBAS"}
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
                label="PORSI (g)"
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
                label="KKAL"
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
                label="PROTEIN (g)"
                value={editDraft.protein}
                onChange={(n) => setEditDraft({ ...editDraft, protein: n })}
              />
              <NumField
                label="KARBO (g)"
                value={editDraft.carbs}
                onChange={(n) => setEditDraft({ ...editDraft, carbs: n })}
              />
              <NumField
                label="LEMAK (g)"
                value={editDraft.fat}
                onChange={(n) => setEditDraft({ ...editDraft, fat: n })}
              />
              <NumField
                label="GULA (g)"
                value={editDraft.sugar ?? 0}
                onChange={(n) => setEditDraft({ ...editDraft, sugar: n })}
              />
            </div>

            <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setEditDraft(null)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 13,
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: ".1em",
                  color: "#9a938d",
                  cursor: "pointer",
                  background: "rgba(84,119,93,.03)",
                  border: "1px solid rgba(84,119,93,.1)",
                }}
              >
                BATAL
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
                    toast("KKAL harus ≥ 0", "warn");
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
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 13,
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: ".1em",
                  color: "var(--text)",
                  cursor: "pointer",
                  background: FIRE,
                  border: "1px solid rgba(255,150,120,.6)",
                  boxShadow: "none",
                }}
              >
                SIMPAN ✓
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
    </main>
  );
}
