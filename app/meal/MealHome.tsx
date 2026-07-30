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
import { uploadMealPhoto } from "@/lib/mealPhoto";
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
import { useSheetBack } from "@/lib/backSheet";

/** A blank editor draft; may or may not carry an id (edit vs. add). */
type EditDraft = (QuickLogEntry | Omit<QuickLogEntry, "id">) & { id?: string };

// ---- shared style tokens (canonical from app/page.tsx) ----
const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const round1 = (x: number) => Math.round(x * 10) / 10;
const DAILY_SUGAR_TARGET_G = 50;

/** The right-hand numbers column. The slot total and every item's kcal share
 *  this width so the card's right edge is as straight as its left one. */
const KCAL_COL = 58;

const ID_DAYS = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
const ID_MON = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
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
    if (!s.drag && Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) s.drag = true;
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
          color: "#ff9a80",
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
          background: dragging || dx !== 0 ? "#0d0b0c" : "transparent",
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
  return meal.items.reduce<Macros>((acc, it) => {
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
  }, { ...EMPTY_MACROS });
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

/** Ease a number up to its target so bars "count up" like the reference. */
function useCountUp(target: number, active: boolean): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) {
      setV(target);
      return;
    }
    let raf = 0;
    let cur = 0;
    const tick = () => {
      cur = cur + (target - cur) * 0.16;
      if (Math.abs(target - cur) < 0.4) {
        setV(target);
        return;
      }
      setV(cur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return v;
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
      : "1px solid rgba(255,255,255,.1)",
    background: active ? FIRE : "rgba(255,255,255,.03)",
    color: active ? "#fff" : "#7c736e",
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
    color: active ? "#fff" : "#7c736e",
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
    color: disabled ? "#4a4642" : "#c9c2bc",
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.1)",
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
  color: "#f1ede9",
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.12)",
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
function MiniBar({
  label,
  value,
  target,
  grad,
  cap,
  animate,
}: {
  label: string;
  value: number;
  target: number;
  grad: string;
  cap: boolean;
  animate: boolean;
}) {
  const shown = useCountUp(value, animate);
  const pct = Math.max(0, Math.min(100, target ? (shown / target) * 100 : 0));
  const over = cap && value > target;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".14em", color: "#7c736e" }}>
          {label}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: over ? "#ee3c30" : "#f1ede9" }}>
          {`${Math.round(shown)}g`}
          <span style={{ color: "#5a524e" }}>{` / ${Math.round(target)}g`}</span>
        </span>
      </div>
      <div
        style={{
          height: 6,
          marginTop: 5,
          background: "#161011",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 4,
            background: over ? "linear-gradient(90deg,#ff5a3c,#ee2f1f)" : grad,
            transition: "width .6s cubic-bezier(.22,.61,.36,1)",
          }}
        />
      </div>
    </div>
  );
}

/** The hero ring — what's LEFT to eat, because that's the number that decides
 *  the next meal. Consumed / target sits underneath as context. */
function CalorieRing({ kcal, target, animate }: { kcal: number; target: number; animate: boolean }) {
  const pct = target > 0 ? Math.min(1, kcal / target) : 0;
  const offset = Math.round(452 * (1 - pct));
  const sisa = Math.max(0, target - Math.round(kcal));
  return (
    <div style={{ position: "relative", width: 132, height: 132, flex: "none" }}>
      <svg viewBox="0 0 160 160" style={{ width: 132, height: 132, transform: "rotate(-90deg)" }}>
        <circle cx="80" cy="80" r="72" fill="none" stroke="#1c1614" strokeWidth="13" />
        <circle
          cx="80"
          cy="80"
          r="72"
          fill="none"
          stroke="url(#mk-ring)"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray="452"
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset .7s cubic-bezier(.22,.61,.36,1)",
            animation: animate ? "mk-ringdraw 1.1s cubic-bezier(.22,.61,.36,1)" : "none",
          }}
        />
        <defs>
          <linearGradient id="mk-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb454" />
            <stop offset="1" stopColor="#ee2f1f" />
          </linearGradient>
        </defs>
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 30, fontWeight: 800, color: "#ffe9d6", lineHeight: 1 }}>
          {sisa.toLocaleString("id-ID")}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 7.5,
            letterSpacing: ".1em",
            color: "#5a524e",
            marginTop: 3,
          }}
        >
          {Math.round(kcal).toLocaleString("id-ID")} / {Math.round(target).toLocaleString("id-ID")}
        </span>
      </div>
    </div>
  );
}

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
  /** The meal row a photo attaches to; null while the slot is empty. */
  meal: MealLog | null;
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
function macroLine(protein: number, carbs: number, fat: number, sugar: number): string {
  return (
    `${Math.round(protein)}g protein · ${Math.round(carbs)}g karbo` +
    ` · ${Math.round(fat)}g lemak · ${Math.round(sugar)}g gula`
  );
}

function describeItem(it: MealItem): { name: string; detail: string; kcal: number } {
  if (isCustomItem(it)) {
    const portion = it.grams > 0 ? `${Math.round(it.grams)} g` : "1 porsi";
    return {
      name: it.name,
      kcal: it.kcal,
      detail: `${portion} · ${macroLine(it.protein, it.carbs, it.fat, it.sugar ?? 0)}`,
    };
  }
  const ing = getIngredient(it.id);
  const m = macrosFor(it.id, it.qty);
  const portion = ing?.gramsPerUnit
    ? `${Math.round(ing.gramsPerUnit * it.qty)} g`
    : `${round1(it.qty)}×`;
  const sugar = (ing?.sugar ?? 0) * it.qty;
  return {
    name: ing?.name ?? it.id,
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
  const [builderMeal, setBuilderMeal] = useState<MealType | null>(initialBuilder ?? null);
  // Which slot the clock is in right now. Resolved after mount so the server
  // render and the first client render agree.
  const [nowSlot, setNowSlot] = useState<MealType | null>(null);
  // Full-screen view of a meal photo.
  const [photoView, setPhotoView] = useState<string | null>(null);
  // Meal id whose photo is uploading, so its slot can show a spinner.
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Which logged food is pending deletion (drives the confirmation dialog).
  const [pendingDelete, setPendingDelete] = useState<{
    mealId: string;
    itemIndex: number;
    name: string;
  } | null>(null);
  // True while the dialog is playing its exit animation, so it glides out
  // (backdrop fade + card drop) instead of snapping to nothing.
  const [deleteClosing, setDeleteClosing] = useState(false);

  // One file input serves all four slots; pendingPhotoMeal says which one asked.
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingPhotoMeal = useRef<string | null>(null);

  // Hardware back closes the top-most open sheet instead of leaving the page.
  // (FoodBuilder wires its own step-aware handler internally.)
  useSheetBack(pickerOpen, () => setPickerOpen(false));
  useSheetBack(manageOpen, () => setManageOpen(false));
  useSheetBack(!!editDraft, () => setEditDraft(null));
  useSheetBack(!!photoView, () => setPhotoView(null));

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
    [allMeals, activeDate]
  );

  const totals = useMemo<Macros>(
    () => dayMeals.reduce((a, m) => addMacros(a, sumMealMacros(m)), { ...EMPTY_MACROS }),
    [dayMeals]
  );

  const sugarTotal = useMemo(
    () => dayMeals.reduce((acc, m) => acc + sumMealSugar(m), 0),
    [dayMeals]
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
      // Prefer a row that already carries a photo, so re-shooting replaces it.
      const meal = meals.find((m) => m.photoUrl) ?? meals[0] ?? null;
      return { key: def.key, label: def.label, window: def.window, meal, items, kcal, lastAt };
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
    [dayMeals, reloadFromStore]
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
    [pendingDelete, deleteClosing, deleteLoggedItem]
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
    [activeDate, reloadFromStore]
  );

  /** Ask for a picture for this meal. Empty slots have nothing to attach to. */
  const askForPhoto = useCallback((slot: Slot) => {
    if (!slot.meal) {
      haptic("warn");
      toast("Catat makanannya dulu, baru fotonya", "warn");
      return;
    }
    if (slot.meal.photoUrl) {
      setPhotoView(slot.meal.photoUrl);
      return;
    }
    pendingPhotoMeal.current = slot.meal.id;
    fileRef.current?.click();
  }, []);

  const onPhotoPicked = useCallback(
    async (file: File | undefined) => {
      const mealId = pendingPhotoMeal.current;
      pendingPhotoMeal.current = null;
      if (!file || !mealId) return;
      setUploadingId(mealId);
      const res = await uploadMealPhoto(mealId, file);
      setUploadingId(null);
      if (res.ok) {
        haptic("success");
        toast("Foto tersimpan", "success");
        reloadFromStore();
      } else {
        haptic("warn");
        toast(res.message, "warn");
      }
    },
    [reloadFromStore]
  );

  const macros = [
    {
      label: "PROTEIN",
      value: totals.protein,
      target: target.protein,
      grad: "linear-gradient(90deg,#6ff0a4,#22c55e)",
      cap: false,
    },
    {
      label: "KARBO",
      value: totals.carbs,
      target: target.carbs,
      grad: "linear-gradient(90deg,#5ac8f5,#229ed9)",
      cap: false,
    },
    {
      label: "LEMAK",
      value: totals.fat,
      target: target.fat,
      grad: "linear-gradient(90deg,#ffd25a,#eab308)",
      cap: false,
    },
    {
      label: "GULA",
      value: sugarTotal,
      target: DAILY_SUGAR_TARGET_G,
      grad: "linear-gradient(90deg,#ff8a72,#ee3c30)",
      cap: true,
    },
  ];

  return (
    <main
      // No page-rise here. Its animation resolves `transform` to an identity
      // matrix rather than `none`, which makes this element a containing block
      // — and every position:fixed child (FoodBuilder's full-screen overlay,
      // the delete dialog, DatePicker) then sizes to the page instead of the
      // viewport. The entrance flourish isn't worth that.
      style={{
        maxWidth: 460,
        margin: "0 auto",
        minHeight: "100dvh",
        position: "relative",
        fontFamily: SANS,
        background:
          "radial-gradient(1100px 700px at 50% -8%, #17100f 0%, #0a0809 42%, #050406 100%)",
      }}
    >
      {/* Bottom padding clears the nav AND the FAB (which tops out 148px up),
          so the last slot card is never partly hidden behind the ＋. */}
      <div style={{ padding: "calc(16px + env(safe-area-inset-top)) 18px 170px" }}>
        {/* header — wordmark + date, with the day type as a compact segment */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: ".3px",
                color: "#f1ede9",
                lineHeight: 1,
              }}
            >
              Makan<span style={{ color: "#ee3c30" }}>.</span>
            </h1>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label="Pilih tanggal"
              style={{
                display: "block",
                marginTop: 6,
                padding: 0,
                border: "none",
                background: "transparent",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: ".15em",
                color: "#f1ede9",
              }}
            >
              {dateLine}
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              flex: "none",
              padding: 3,
              borderRadius: 12,
              background: "rgba(255,255,255,.05)",
              border: "1px solid rgba(255,255,255,.09)",
            }}
          >
            <button type="button" className="tap-press" onClick={() => toggleGym(true)} style={segStyle(gymDay)}>
              GYM
            </button>
            <button type="button" className="tap-press" onClick={() => toggleGym(false)} style={segStyle(!gymDay)}>
              REST
            </button>
          </div>
        </div>

        {/* hero — sisa kalori + the four macros */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginTop: 18,
            padding: 18,
            borderRadius: 22,
            background: "rgba(255,255,255,.035)",
            border: "1px solid rgba(255,255,255,.09)",
          }}
        >
          <CalorieRing kcal={totals.kcal} target={target.kcal} animate={loaded} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {macros.map((m) => (
              <MiniBar key={m.label} {...m} animate={loaded} />
            ))}
          </div>
        </div>

        {/* quick rail — always visible, one tap logs */}
        <div
          className="mk-rail"
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            margin: "22px -18px 0",
            padding: "2px 18px 4px",
          }}
        >
          {quickEntries.map((e) => {
            const [first, ...rest] = e.label.split(" ");
            return (
              <button
                key={e.id}
                type="button"
                className="tap-press"
                onClick={() => logQuick(e)}
                style={{
                  flex: "none",
                  width: 104,
                  padding: "11px 13px",
                  borderRadius: 15,
                  textAlign: "left",
                  cursor: "pointer",
                  background:
                    "linear-gradient(180deg,rgba(255,255,255,.05),transparent 60%),#0d0b0c",
                  border: "1px solid rgba(255,255,255,.1)",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontFamily: SANS,
                    fontSize: 12.5,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    color: "#f1ede9",
                  }}
                >
                  {first}
                  <br />
                  {rest.join(" ") || " "}
                </span>
              </button>
            );
          })}

          {/* one-tap add-ons — these open the confirm step instead of logging
              straight away, so they carry a fire edge to read as different */}
          {ADDONS.map((a) => {
            const preset = PRESETS.find((p) => p.id === a.id);
            if (!preset) return null;
            const href = `/meal/confirm?preset=${preset.id}&date=${activeDate}`;
            const [first, ...rest] = a.label.split(" ");
            return (
              <Link
                key={a.id}
                href={href}
                className="tap-press"
                onClick={(ev) => {
                  ev.preventDefault();
                  vtNavigate(href, { haptic: null });
                }}
                style={{
                  flex: "none",
                  width: 104,
                  padding: "11px 13px",
                  borderRadius: 15,
                  textDecoration: "none",
                  cursor: "pointer",
                  background:
                    "linear-gradient(180deg,rgba(255,138,60,.1),rgba(255,138,60,.02) 55%),#0d0b0c",
                  border: "1px solid rgba(255,138,60,.32)",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontFamily: SANS,
                    fontSize: 12.5,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    color: "#f1ede9",
                  }}
                >
                  {first}
                  <br />
                  {rest.join(" ") || " "}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            className="tap-press"
            onClick={() => {
              haptic("tap");
              setManageOpen(true);
            }}
            aria-label="Atur catat cepat"
            style={{
              flex: "none",
              width: 60,
              borderRadius: 15,
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: ".1em",
              color: "#7c736e",
              background: "rgba(255,255,255,.03)",
              border: "1px dashed rgba(255,255,255,.14)",
            }}
          >
            ✎<br />ATUR
          </button>
        </div>

        {/* the day, as four slots */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
          {slots.map((s) => {
            const empty = s.items.length === 0;
            // Only an empty slot glows: once it's logged there's nothing to nag about.
            const isNow = s.key === nowSlot && empty;
            const photoUrl = s.meal?.photoUrl ?? null;
            const busy = !!s.meal && uploadingId === s.meal.id;
            return (
              <div
                key={s.key}
                style={{
                  padding: "15px 16px",
                  borderRadius: 18,
                  background: isNow
                    ? "linear-gradient(180deg,rgba(238,60,48,.1),transparent 70%),#0d0b0c"
                    : "rgba(255,255,255,.035)",
                  border: isNow
                    ? "1px solid rgba(255,150,120,.4)"
                    : "1px solid rgba(255,255,255,.09)",
                  opacity: empty && !isNow ? 0.72 : 1,
                  animation: isNow ? "wo-cardglow 2.8s ease-in-out infinite" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <button
                    type="button"
                    className="tap-press"
                    onClick={() => askForPhoto(s)}
                    aria-label={photoUrl ? `Lihat foto ${s.label}` : `Foto ${s.label}`}
                    style={{
                      flex: "none",
                      width: 44,
                      height: 44,
                      borderRadius: 13,
                      display: "grid",
                      placeItems: "center",
                      overflow: "hidden",
                      fontSize: 16,
                      cursor: "pointer",
                      padding: 0,
                      background: "radial-gradient(circle at 50% 38%,#1c1517,#0b090a)",
                      border: photoUrl
                        ? "1px solid rgba(255,150,120,.5)"
                        : `1px dashed rgba(255,150,120,${empty ? ".22" : ".38"})`,
                      color: "#6a6660",
                      opacity: empty ? 0.6 : 1,
                    }}
                  >
                    {busy ? (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 15,
                          height: 15,
                          borderRadius: "50%",
                          border: "2px solid rgba(255,150,120,.28)",
                          borderTopColor: "#ff8a5c",
                          animation: "fbSpin .8s linear infinite",
                        }}
                      />
                    ) : photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      "FOTO"
                    )}
                  </button>

                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: ".2em",
                        color: empty ? "#7c736e" : "#f1ede9",
                      }}
                    >
                      {s.label}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontFamily: MONO,
                        fontSize: 9,
                        color: "#7c736e",
                        marginTop: 4,
                      }}
                    >
                      {empty
                        ? s.window
                        : `${s.items.length} item · ${fmtTime(s.lastAt ?? Date.now())}`}
                    </span>
                  </span>

                  <span style={{ flex: "none", width: KCAL_COL, textAlign: "right" }}>
                    <span
                      style={{
                        display: "block",
                        fontFamily: MONO,
                        fontSize: empty ? 13 : 18,
                        fontWeight: 700,
                        lineHeight: 1,
                        color: empty ? "#5a524e" : "#f1ede9",
                      }}
                    >
                      {empty ? "—" : Math.round(s.kcal)}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontFamily: MONO,
                        fontSize: 7.5,
                        letterSpacing: ".18em",
                        color: "#6a6660",
                        marginTop: 3,
                      }}
                    >
                      KKAL
                    </span>
                  </span>
                </div>

                {!empty && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid rgba(255,255,255,.07)",
                    }}
                  >
                    {s.items.map((it) => (
                      <SwipeRow
                        key={it.key}
                        onTap={() => {
                          haptic("tap");
                          setBuilderMeal(s.key);
                        }}
                        onRequestDelete={() => {
                          haptic("tap");
                          setPendingDelete({
                            mealId: it.mealId,
                            itemIndex: it.itemIndex,
                            name: it.name,
                          });
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              display: "block",
                              fontFamily: SANS,
                              fontSize: 13.5,
                              fontWeight: 700,
                              color: "#f1ede9",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {it.name}
                          </span>
                          <span
                            style={{
                              display: "block",
                              fontFamily: MONO,
                              fontSize: 8.5,
                              lineHeight: 1.5,
                              color: "#8a837d",
                              marginTop: 3,
                            }}
                          >
                            {it.detail}
                          </span>
                        </span>
                        <span style={{ flex: "none", width: KCAL_COL, textAlign: "right" }}>
                          <span
                            style={{
                              display: "block",
                              fontFamily: MONO,
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#f1ede9",
                              lineHeight: 1,
                            }}
                          >
                            {Math.round(it.kcal)}
                          </span>
                          <span
                            style={{
                              display: "block",
                              fontFamily: MONO,
                              fontSize: 8.5,
                              color: "#6a6660",
                              marginTop: 3,
                            }}
                          >
                            {fmtTime(it.at)}
                          </span>
                        </span>
                      </SwipeRow>
                    ))}
                  </div>
                )}

                {empty && (
                  <button
                    type="button"
                    className="tap-press"
                    onClick={() => {
                      haptic("tap");
                      setBuilderMeal(s.key);
                    }}
                    style={{
                      width: "100%",
                      marginTop: 11,
                      padding: 11,
                      borderRadius: 12,
                      cursor: "pointer",
                      fontFamily: MONO,
                      fontSize: 9.5,
                      letterSpacing: ".15em",
                      color: isNow ? "#ff9a80" : "#7c736e",
                      background: "rgba(255,255,255,.03)",
                      border: isNow
                        ? "1px dashed rgba(255,150,120,.4)"
                        : "1px dashed rgba(255,255,255,.14)",
                    }}
                  >
                    ＋ CATAT {s.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* the camera input every slot shares */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        // No `capture` attribute on purpose: iOS then offers "Ambil Foto" AND
        // "Pilih dari Album", so a picture taken earlier can still be attached.
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = ""; // re-picking the same file must still fire
          void onPhotoPicked(file);
        }}
        style={{ display: "none" }}
      />

      {/* add-meal FAB — sits clear of the kcal column rather than pushing it in */}
      <button
        type="button"
        aria-label="Catat makan"
        className="tap-press"
        onClick={() => setBuilderMeal(inferMealType())}
        style={{
          position: "fixed",
          // Hugs the 460px column on wide screens, the screen edge on phones.
          right: "max(14px, calc(50vw - 216px))",
          bottom: "calc(96px + env(safe-area-inset-bottom))",
          zIndex: 44,
          width: 52,
          height: 52,
          borderRadius: "50%",
          fontSize: 27,
          lineHeight: 1,
          color: "#fff",
          cursor: "pointer",
          background: FIRE,
          border: "1px solid rgba(255,150,120,.6)",
          animation: "wo-firepulse 2.6s ease-in-out infinite",
        }}
      >
        ＋
      </button>

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

      {/* meal photo, full size */}
      {photoView && (
        <div
          onClick={() => setPhotoView(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 250,
            background: "rgba(5,4,6,.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            animation: "dlgBackdropIn .3s var(--ease-out) both",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoView}
            alt="Foto makanan"
            style={{
              maxWidth: "100%",
              maxHeight: "82dvh",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,.12)",
            }}
          />
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              const id = slots.find((s) => s.meal?.photoUrl === photoView)?.meal?.id;
              setPhotoView(null);
              if (id) {
                pendingPhotoMeal.current = id;
                fileRef.current?.click();
              }
            }}
            style={{
              position: "absolute",
              bottom: "calc(34px + env(safe-area-inset-bottom))",
              left: "50%",
              transform: "translateX(-50%)",
              padding: "12px 20px",
              borderRadius: 999,
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".1em",
              color: "#fff",
              cursor: "pointer",
              background: FIRE,
              border: "1px solid rgba(255,150,120,.6)",
            }}
          >
            GANTI FOTO
          </button>
        </div>
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
              background: "linear-gradient(180deg,#161011,#0c0a0b 60%)",
              border: "1px solid rgba(255,255,255,.12)",
              boxShadow: "0 30px 70px rgba(0,0,0,.62), 0 2px 0 rgba(255,255,255,.05) inset",
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
                color: "#f5f2ef",
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
                color: "#ff9a80",
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
                  color: "#cfc8c2",
                  cursor: "pointer",
                  background: "rgba(255,255,255,.05)",
                  border: "1px solid rgba(255,255,255,.14)",
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
                  color: "#fff",
                  cursor: "pointer",
                  background: "linear-gradient(180deg,#ee5140,#c01f12)",
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
              background: "linear-gradient(180deg,#161011,#0c0a0b 60%)",
              borderTop: "1px solid rgba(255,255,255,.1)",
              boxShadow: "0 -20px 50px rgba(0,0,0,.6)",
              animation: "sheetCardIn .44s var(--ease-ios) both",
              maxHeight: "80dvh",
              overflowY: "auto",
            }}
          >
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: "#f5f2ef" }}>
              ATUR CATAT CEPAT
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".06em", color: "#7c736e", marginTop: 5 }}>
              Yang muncul di baris atas — tambah, ubah, atau hapus
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              {quickEntries.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 13,
                    background: "linear-gradient(180deg,rgba(255,255,255,.04),transparent 40%),#0d0b0c",
                    border: "1px solid rgba(255,255,255,.09)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontWeight: 700,
                        fontSize: 13,
                        color: "#f1ede9",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {e.label}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".08em", color: "#8a837d", marginTop: 2 }}>
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
                setEditDraft({ label: "", mealType: "snack", kcal: 0, protein: 0, carbs: 0, fat: 0 })
              }
              style={{
                width: "100%",
                marginTop: 14,
                padding: "12px",
                borderRadius: 13,
                fontFamily: MONO,
                fontSize: 12,
                letterSpacing: ".08em",
                color: "#fff",
                cursor: "pointer",
                background: FIRE,
                border: "1px solid rgba(255,150,120,.6)",
                boxShadow: "inset 0 1.5px 1px rgba(255,225,205,.6),0 6px 16px rgba(238,60,48,.35)",
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
                background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,255,255,.1)",
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
              background: "linear-gradient(180deg,#161011,#0c0a0b 60%)",
              borderTop: "1px solid rgba(255,255,255,.1)",
              boxShadow: "0 -20px 50px rgba(0,0,0,.6)",
              animation: "sheetCardIn .44s var(--ease-ios) both",
              maxHeight: "88dvh",
              overflowY: "auto",
            }}
          >
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: "#f5f2ef" }}>
              {editDraft.id ? "UBAH ENTRI" : "ENTRI BARU"}
            </div>

            <label style={editLabelStyle}>NAMA</label>
            <input
              type="text"
              value={editDraft.label}
              onChange={(ev) => setEditDraft({ ...editDraft, label: ev.target.value })}
              placeholder="mis. Oatmeal + Pisang"
              style={editInputStyle}
            />

            <label style={editLabelStyle}>WAKTU</label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {(["breakfast", "lunch", "snack", "dinner"] as const).map((mt) => (
                <button
                  key={mt}
                  type="button"
                  onClick={() => setEditDraft({ ...editDraft, mealType: mt })}
                  style={toggleStyle(editDraft.mealType === mt)}
                >
                  {MEAL_ID_LABEL[mt]}
                </button>
              ))}
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
                  color: lockRatio ? "#fff" : "#9a938d",
                  background: lockRatio ? FIRE : "rgba(255,255,255,.04)",
                  border: lockRatio
                    ? "1px solid rgba(255,150,120,.6)"
                    : "1px solid rgba(255,255,255,.12)",
                }}
              >
                {lockRatio ? "KUNCI RASIO" : "BEBAS"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
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
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid rgba(255,255,255,.1)",
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
                  color: "#fff",
                  cursor: "pointer",
                  background: FIRE,
                  border: "1px solid rgba(255,150,120,.6)",
                  boxShadow: "inset 0 1.5px 1px rgba(255,225,205,.6),0 6px 16px rgba(238,60,48,.35)",
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
