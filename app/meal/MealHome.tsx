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
import { getIngredient, macrosFor, sumMacros, type Macros } from "@/lib/ingredients";
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
import { TARGETS, weekNumber } from "@/lib/targets";
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

const ID_DAYS = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];
const ID_MON = [
  "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
  "JUL", "AGU", "SEP", "OKT", "NOV", "DES",
];

function bahasaDate(dateStr: string): string {
  if (!dateStr) return "";
  const dt = parseDate(dateStr); // UTC
  return `${ID_DAYS[dt.getUTCDay()]} · ${dt.getUTCDate()} ${ID_MON[dt.getUTCMonth()]}`;
}

/** Local clock time (HH:MM) of an epoch-ms stamp — when a food was logged. */
function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** One flattened food entry from today's meals, for the home food-log timeline. */
type LoggedRow = {
  key: string;
  mealId: string;
  itemIndex: number;
  mealType: MealType;
  name: string;
  detail: string;
  kcal: number;
  at: number;
};

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
    <div style={{ position: "relative", borderRadius: 13 }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: dx < 0 ? "flex-end" : "flex-start",
          padding: "0 20px",
          borderRadius: 13,
          background: `linear-gradient(90deg,rgba(238,60,48,${0.06 + prog * 0.24}),rgba(238,60,48,${0.02 + prog * 0.08}))`,
          color: "#ff9a80",
          fontFamily: MONO,
          fontSize: 11,
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
          🗑 HAPUS
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
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: "9px 12px",
          borderRadius: 13,
          textAlign: "left",
          cursor: "pointer",
          touchAction: "pan-y",
          transform: `translateX(${dx}px)`,
          // 1:1 finger tracking while dragging (direct manipulation); on release
          // it settles back with a weighty, slightly springy decelerate.
          transition: dragging
            ? "none"
            : "transform .44s var(--ease-spring)",
          willChange: "transform",
          background:
            "linear-gradient(180deg,rgba(255,255,255,.045),transparent 40%),#0d0b0c",
          border: "1px solid rgba(255,255,255,.09)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Emoji tile on Quick Log rows, by meal time (reference: 🍳/🍛/🥜/🥩).
const QUICK_EMOJI: Record<MealType, string> = {
  breakfast: "🍳",
  lunch: "🍛",
  snack: "🥜",
  dinner: "🥩",
};

const MEAL_ID_LABEL: Record<MealType, string> = {
  breakfast: "SARAPAN",
  lunch: "SIANG",
  snack: "SNACK",
  dinner: "MALAM",
};

/** Pick the meal slot from the current clock time, so logging is one tap — no
 *  breakfast/lunch/dinner prompt. You can still change it inside the builder. */
function inferMealType(): MealType {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 15 && h < 18) return "snack";
  return "dinner";
}

// One-tap add-ons surfaced under Quick Log (preset ids from lib/presets).
const ADDONS: { id: string; emoji: string; label: string }[] = [
  { id: "protein-scoop", emoji: "🥄", label: "Protein Powder" },
  { id: "matcha-milk",   emoji: "🍵", label: "Matcha + Milk" },
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

type BarSpec = {
  label: string;
  value: number;
  target: number;
  unit: string;
  grad: string;
  glow: string;
  cap: boolean;
  delay: number;
};

function Bar({
  label,
  value,
  target,
  unit,
  grad,
  glow,
  cap,
  delay,
  animate,
}: BarSpec & { animate: boolean }) {
  const shown = useCountUp(value, animate);
  const pct = Math.max(0, Math.min(100, target ? (shown / target) * 100 : 0));
  const over = cap && value > target;
  const hot = pct >= 88 || over;
  return (
    <div style={{ marginBottom: 13 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".14em",
            color: "#7c736e",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: over ? "#ee3c30" : "#f1ede9",
          }}
        >
          {`${Math.round(shown)}${unit} `}
          <span style={{ color: "#6a6660" }}>{`/ ${target}${unit}`}</span>
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 9,
          borderRadius: 999,
          background: "rgba(255,255,255,.05)",
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,.6)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: `${pct}%`,
            borderRadius: 999,
            overflow: "hidden",
            background: over ? "linear-gradient(90deg,#ff5a3c,#ee2f1f)" : grad,
            transition: "width .6s cubic-bezier(.16,1,.3,1)",
            boxShadow: hot ? `0 0 10px ${glow}` : "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "45%",
              height: "100%",
              background:
                "linear-gradient(100deg,transparent,rgba(255,255,255,.6),transparent)",
              animation: `barSheen 4.2s ${delay}s ease-in-out infinite`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

type MealBucket = { macros: Macros; items: number };

export default function MealHome() {
  const vtNavigate = useVTNavigate();
  const {
    activeDate,
    setActiveDate,
    todayStr,
  } = useActiveDate();

  const [allMeals, setAllMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDay] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickEntries, setQuickEntries] = useState<QuickLogEntry[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [lockRatio, setLockRatio] = useState(true);
  const [aturPressed, setAturPressed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [quickPickOpen, setQuickPickOpen] = useState(false);
  const [builderMeal, setBuilderMeal] = useState<MealType | null>(null);
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
  useSheetBack(quickPickOpen, () => setQuickPickOpen(false));

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
    setGymDay(next);
    const d = getDaily(activeDate);
    setDaily({ date: activeDate, gymDay: next, checklist: d.checklist ?? {} });
  }

  const dayMeals = useMemo(
    () => allMeals.filter((m) => m.date === activeDate),
    [allMeals, activeDate]
  );

  const byType = useMemo(() => {
    const m: Record<MealType, MealBucket> = {
      breakfast: { macros: { ...EMPTY_MACROS }, items: 0 },
      lunch:     { macros: { ...EMPTY_MACROS }, items: 0 },
      snack:     { macros: { ...EMPTY_MACROS }, items: 0 },
      dinner:    { macros: { ...EMPTY_MACROS }, items: 0 },
    };
    for (const meal of dayMeals) {
      m[meal.mealType].macros = addMacros(m[meal.mealType].macros, sumMealMacros(meal));
      m[meal.mealType].items += meal.items.length;
    }
    return m;
  }, [dayMeals]);

  const totals = useMemo<Macros>(() => {
    return (Object.values(byType) as MealBucket[]).reduce(
      (a, b) => addMacros(a, b.macros),
      { ...EMPTY_MACROS }
    );
  }, [byType]);

  const sugarTotal = useMemo(
    () => dayMeals.reduce((acc, m) => acc + sumMealSugar(m), 0),
    [dayMeals]
  );

  // Today's actually-logged foods, flattened across meal types into a single
  // time-ordered timeline (most recent first) so you can see what — and when —
  // you ate today. Per-item `addedAt` drives the time; legacy items without one
  // fall back to the meal's loggedAt.
  const loggedItems = useMemo<LoggedRow[]>(() => {
    const rows: LoggedRow[] = [];
    for (const meal of dayMeals) {
      meal.items.forEach((it, idx) => {
        const at = it.addedAt ?? meal.loggedAt;
        const label = MEAL_ID_LABEL[meal.mealType];
        if (isCustomItem(it)) {
          const g = it.grams > 0 ? `${Math.round(it.grams)}g · ` : "";
          rows.push({
            key: `${meal.id}:${idx}`,
            mealId: meal.id,
            itemIndex: idx,
            mealType: meal.mealType,
            name: it.name,
            detail: `${g}${label}`,
            kcal: it.kcal,
            at,
          });
        } else {
          const ing = getIngredient(it.id);
          const m = macrosFor(it.id, it.qty);
          const g = ing?.gramsPerUnit
            ? `${Math.round(ing.gramsPerUnit * it.qty)}g · `
            : it.qty > 1
              ? `${it.qty}× · `
              : "";
          rows.push({
            key: `${meal.id}:${idx}`,
            mealId: meal.id,
            itemIndex: idx,
            mealType: meal.mealType,
            name: ing?.name ?? it.id,
            detail: `${g}${label}`,
            kcal: m.kcal,
            at,
          });
        }
      });
    }
    rows.sort((a, b) => b.at - a.at);
    return rows;
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
  const wk = activeDate ? weekNumber(parseDate(activeDate)) : 1;
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

  const bars: BarSpec[] = [
    {
      label: "KALORI", value: totals.kcal, target: target.kcal, unit: "",
      grad: "linear-gradient(90deg,#ff8a3d,#ee2f1f)", glow: "rgba(238,60,48,.6)",
      cap: false, delay: 0,
    },
    {
      label: "PROTEIN", value: totals.protein, target: target.protein, unit: "g",
      grad: "linear-gradient(90deg,#6ff0a4,#22c55e)", glow: "rgba(34,197,94,.5)",
      cap: false, delay: 0.5,
    },
    {
      label: "KARBO", value: totals.carbs, target: target.carbs, unit: "g",
      grad: "linear-gradient(90deg,#5ac8f5,#229ed9)", glow: "rgba(34,158,217,.5)",
      cap: false, delay: 1,
    },
    {
      label: "LEMAK", value: totals.fat, target: target.fat, unit: "g",
      grad: "linear-gradient(90deg,#ffd25a,#eab308)", glow: "rgba(234,179,8,.5)",
      cap: false, delay: 1.5,
    },
    {
      label: "GULA", value: sugarTotal, target: DAILY_SUGAR_TARGET_G, unit: "g",
      grad: "linear-gradient(90deg,#ff8a72,#ee3c30)", glow: "rgba(238,60,48,.6)",
      cap: true, delay: 2,
    },
  ];

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        minHeight: "100dvh",
        padding: "calc(20px + env(safe-area-inset-top)) 20px 26px",
        background:
          "radial-gradient(1100px 700px at 50% -8%, #17100f 0%, #0a0809 42%, #050406 100%)",
        fontFamily: SANS,
      }}
    >
      {/* header: wordmark + date chip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: "-.01em",
            color: "#f1ede9",
          }}
        >
          🍽️ <span style={FIRE_TEXT}>MAKAN</span>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Pilih tanggal"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".06em",
            color: "#9a938d",
            padding: "7px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.1)",
            background: "rgba(255,255,255,.03)",
            cursor: "pointer",
          }}
        >
          {dateLine} ▾
        </button>
      </div>

      {/* day toggle */}
      <div style={{ display: "flex", gap: 8, marginTop: 26 }}>
        <button type="button" onClick={() => toggleGym(true)} style={toggleStyle(gymDay)}>
          🏋️ GYM
        </button>
        <button type="button" onClick={() => toggleGym(false)} style={toggleStyle(!gymDay)}>
          🌙 REST
        </button>
      </div>

      {/* macro bars */}
      <div
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 18,
          background: "#0c0a0b",
          border: "1px solid rgba(255,255,255,.08)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
        }}
      >
        {bars.map((b) => (
          <Bar key={b.label} {...b} animate={loaded} />
        ))}
      </div>

      {/* today's food-log header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 22,
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: ".02em",
            color: "#f1ede9",
          }}
        >
          🍽️ HARI INI
        </div>
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setQuickPickOpen(true);
          }}
          onPointerDown={() => setAturPressed(true)}
          onPointerUp={() => setAturPressed(false)}
          onPointerLeave={() => setAturPressed(false)}
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".12em",
            color: aturPressed ? "#ff8a72" : "#7c736e",
            padding: "6px 10px",
            borderRadius: 9,
            border: aturPressed
              ? "1px solid rgba(255,150,120,.5)"
              : "1px solid rgba(255,255,255,.1)",
            background: "rgba(255,255,255,.03)",
            cursor: "pointer",
          }}
        >
          ⚡ QUICK
        </button>
      </div>

      {/* count · total kcal logged today */}
      {loggedItems.length > 0 ? (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".06em",
            color: "#7c736e",
            marginTop: 6,
          }}
        >
          {loggedItems.length} item · {Math.round(totals.kcal)} kkal · geser untuk hapus
        </div>
      ) : null}

      {/* today's food log — what (and when) you ate today. Tap a row to open
          that meal in the builder. Empty until you log something. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 7,
          marginTop: 10,
        }}
      >
        {loggedItems.length === 0 ? (
          <div
            style={{
              padding: "22px 16px",
              borderRadius: 14,
              textAlign: "center",
              background: "#0d0b0c",
              border: "1px dashed rgba(255,255,255,.12)",
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 13.5,
                color: "#cfc8c2",
              }}
            >
              Belum ada yang dicatat hari ini
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: ".06em",
                color: "#7c736e",
                marginTop: 6,
              }}
            >
              Tap ＋ untuk catat makan · ⚡ QUICK buat cepat
            </div>
          </div>
        ) : (
          loggedItems.map((row) => (
            <SwipeRow
              key={row.key}
              onTap={() => {
                haptic("tap");
                setBuilderMeal(row.mealType);
              }}
              onRequestDelete={() => {
                haptic("tap");
                setPendingDelete({
                  mealId: row.mealId,
                  itemIndex: row.itemIndex,
                  name: row.name,
                });
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 38,
                  flex: "none",
                  borderRadius: 11,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 18,
                  background: "rgba(238,60,48,.08)",
                  border: "1px solid rgba(238,60,48,.22)",
                }}
              >
                {QUICK_EMOJI[row.mealType]}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: SANS,
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#f1ede9",
                    lineHeight: 1.15,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name}
                </span>
                <span
                  style={{
                    display: "block",
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: ".04em",
                    color: "#8a837d",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.detail}
                </span>
              </span>
              <span style={{ flex: "none", textAlign: "right" }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: MONO,
                    fontWeight: 700,
                    fontSize: 18,
                    color: "#ff8a5c",
                    lineHeight: 1,
                  }}
                >
                  {Math.round(row.kcal)}
                </span>
                <span
                  style={{
                    display: "block",
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: ".08em",
                    color: "#7c736e",
                    marginTop: 3,
                  }}
                >
                  {fmtTime(row.at)}
                </span>
              </span>
            </SwipeRow>
          ))
        )}
      </div>

      {/* add-meal FAB */}
      <button
        type="button"
        aria-label="Catat makan"
        onClick={() => setBuilderMeal(inferMealType())}
        style={{
          position: "fixed",
          right: "max(18px, env(safe-area-inset-right))",
          bottom: "calc(88px + env(safe-area-inset-bottom))",
          zIndex: 44,
          width: 58,
          height: 58,
          borderRadius: "50%",
          fontSize: 28,
          lineHeight: 1,
          color: "#fff",
          cursor: "pointer",
          background: "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)",
          border: "1px solid rgba(255,150,120,.6)",
          boxShadow:
            "inset 0 1.5px 1px rgba(255,225,205,.7),0 12px 26px rgba(238,60,48,.5)",
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
              🗑
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

      {/* quick-log picker — one-tap presets + add-ons (kept behind ⚡ QUICK
          now that the home surface shows today's food log instead). */}
      {quickPickOpen && (
        <div
          onClick={() => setQuickPickOpen(false)}
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: "#f5f2ef" }}>
                ⚡ QUICK LOG
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuickPickOpen(false);
                  setManageOpen(true);
                }}
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: ".12em",
                  color: "#7c736e",
                  padding: "6px 10px",
                  borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "rgba(255,255,255,.03)",
                  cursor: "pointer",
                }}
              >
                ✎ ATUR
              </button>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".06em", color: "#7c736e", marginTop: 5 }}>
              Catat cepat — sekali tap
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 16 }}>
              {quickEntries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    logQuick(e);
                    setQuickPickOpen(false);
                  }}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: 13,
                    textAlign: "left",
                    cursor: "pointer",
                    background:
                      "linear-gradient(180deg,rgba(255,255,255,.045),transparent 40%),#0d0b0c",
                    border: "1px solid rgba(255,255,255,.09)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 38,
                      height: 38,
                      flex: "none",
                      borderRadius: 11,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 18,
                      background: "rgba(238,60,48,.08)",
                      border: "1px solid rgba(238,60,48,.22)",
                    }}
                  >
                    {QUICK_EMOJI[e.mealType]}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontFamily: SANS,
                        fontWeight: 700,
                        fontSize: 14,
                        color: "#f1ede9",
                        lineHeight: 1.15,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.label}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontFamily: MONO,
                        fontSize: 9.5,
                        letterSpacing: ".04em",
                        color: "#8a837d",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.sub ||
                        `${Math.round(e.protein)}p · ${Math.round(e.carbs)}c · ${Math.round(e.fat)}f`}
                    </span>
                  </span>
                  <span style={{ flex: "none", textAlign: "right" }}>
                    <span
                      style={{
                        display: "block",
                        fontFamily: MONO,
                        fontWeight: 700,
                        fontSize: 18,
                        color: "#ff8a5c",
                        lineHeight: 1,
                      }}
                    >
                      {Math.round(e.kcal)}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontFamily: MONO,
                        fontSize: 8,
                        letterSpacing: ".16em",
                        color: "#7c736e",
                        marginTop: 2,
                      }}
                    >
                      KKAL
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {/* one-tap add-ons */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 9,
                marginTop: 9,
              }}
            >
              {ADDONS.map((a) => {
                const preset = PRESETS.find((p) => p.id === a.id);
                if (!preset) return null;
                const kcal = Math.round(sumMacros(preset.items).kcal);
                const href = `/meal/confirm?preset=${preset.id}&date=${activeDate}`;
                return (
                  <Link
                    key={a.id}
                    href={href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "12px 14px",
                      borderRadius: 14,
                      cursor: "pointer",
                      textDecoration: "none",
                      background:
                        "linear-gradient(180deg,rgba(255,138,60,.1),rgba(255,138,60,.02) 40%),#0d0b0c",
                      border: "1px solid rgba(255,138,60,.32)",
                      boxShadow: "inset 0 1px 0 rgba(255,205,175,.16)",
                    }}
                    onClick={(ev) => {
                      ev.preventDefault();
                      setQuickPickOpen(false);
                      vtNavigate(href, { haptic: null });
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{a.emoji}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span
                        style={{
                          fontFamily: SANS,
                          fontWeight: 700,
                          fontSize: 13,
                          color: "#f1ede9",
                        }}
                      >
                        {a.label}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 9,
                          letterSpacing: ".1em",
                          color: "#ff8a72",
                        }}
                      >
                        +{kcal} KKAL
                      </span>
                    </span>
                  </Link>
                );
              })}
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
              ATUR QUICK LOG
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".06em", color: "#7c736e", marginTop: 5 }}>
              Tambah, ubah, atau hapus
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
                    🗑
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
                {lockRatio ? "🔒 KUNCI RASIO" : "🔓 BEBAS"}
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
