"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { getIngredient, macrosFor, sumMacros, type Macros } from "@/lib/ingredients";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import { useVTNavigate } from "@/lib/navigate";
import { PRESETS, type MealType } from "@/lib/presets";
import {
  dedupeMeals,
  getAllMeals,
  getDaily,
  getQuickLogIds,
  isCustomItem,
  QUICKLOG_MAX,
  setDaily,
  type MealLog,
} from "@/lib/store";
import { TARGETS, weekNumber } from "@/lib/targets";
import { useActiveDate, parseDate } from "@/lib/activeDate";
import DatePicker from "./DatePicker";
import FoodBuilder from "./FoodBuilder";

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

type MealInfo = {
  id: MealType;
  emoji: string;
  name: string;
  expectedKcal: number;
};

const MEALS: MealInfo[] = [
  { id: "breakfast", emoji: "🌅", name: "SARAPAN", expectedKcal: 310 },
  { id: "lunch",     emoji: "☀️", name: "SIANG",   expectedKcal: 895 },
  { id: "snack",     emoji: "🍎", name: "SNACK",   expectedKcal: 250 },
  { id: "dinner",    emoji: "🌙", name: "MALAM",   expectedKcal: 900 },
];

const MEAL_ID_LABEL: Record<MealType, string> = {
  breakfast: "SARAPAN",
  lunch: "SIANG",
  snack: "SNACK",
  dinner: "MALAM",
};

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
  const [quickIds, setQuickIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mealPickOpen, setMealPickOpen] = useState(false);
  const [builderMeal, setBuilderMeal] = useState<MealType | null>(null);

  const reloadFromStore = useCallback(() => {
    dedupeMeals();
    setAllMeals(getAllMeals());
    setQuickIds(getQuickLogIds());
    setLoaded(true);
  }, []);
  useSoftRefresh(reloadFromStore);

  useEffect(() => {
    reloadFromStore();
  }, [reloadFromStore]);

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

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const wk = activeDate ? weekNumber(parseDate(activeDate)) : 1;
  const dateLine = bahasaDate(activeDate);

  // Resolve which presets show on the Quick Log grid. Defaults: pick the
  // first preset for each meal type (breakfast / lunch / snack / dinner).
  const quickResolved = useMemo(() => {
    const byId = new Map(PRESETS.map((p) => [p.id, p]));
    if (quickIds.length > 0) {
      return quickIds
        .map((id) => byId.get(id))
        .filter((p): p is (typeof PRESETS)[number] => !!p)
        .slice(0, QUICKLOG_MAX);
    }
    const seen = new Set<string>();
    const defaults: typeof PRESETS = [];
    for (const order of ["breakfast", "lunch", "snack", "dinner"] as const) {
      const p = PRESETS.find((x) => x.mealType === order && !seen.has(x.id));
      if (p) {
        defaults.push(p);
        seen.add(p.id);
      }
    }
    return defaults.slice(0, QUICKLOG_MAX);
  }, [quickIds]);

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

      {/* quick log header */}
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
          ⚡ QUICK LOG
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".12em",
            color: "#7c736e",
          }}
        >
          TAP UNTUK CATAT
        </div>
      </div>

      {/* quick tiles → real /meal/confirm logging route */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 9,
          marginTop: 11,
        }}
      >
        {quickResolved.map((p) => {
          const kcal = Math.round(sumMacros(p.items).kcal);
          const label = p.label.replace(/^[^\p{L}\p{N}]+/u, "").trim();
          const href = `/meal/confirm?preset=${p.id}&date=${activeDate}`;
          return (
            <Link
              key={p.id}
              href={href}
              className="quick-tile"
              style={
                {
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  padding: 14,
                  borderRadius: 14,
                  textAlign: "left",
                  cursor: "pointer",
                  background:
                    "linear-gradient(180deg,rgba(255,255,255,.045),transparent 40%),#0d0b0c",
                  border: "1px solid rgba(255,255,255,.09)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
                  viewTransitionName: `tile-${p.id}`,
                } as CSSProperties
              }
              onClick={(e) => {
                e.preventDefault();
                vtNavigate(href, { haptic: null });
              }}
            >
              <span
                style={{
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#f1ede9",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: ".12em",
                  color: "#ff8a72",
                }}
              >
                {MEAL_ID_LABEL[p.mealType]} · +{kcal} KKAL
              </span>
            </Link>
          );
        })}
      </div>

      {/* one-tap add-ons: protein powder / matcha with milk */}
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
              onClick={(e) => {
                e.preventDefault();
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

      {/* add-meal FAB */}
      <button
        type="button"
        aria-label="Catat makan"
        onClick={() => setMealPickOpen(true)}
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

      {/* meal-time picker */}
      {mealPickOpen && (
        <div
          onClick={() => setMealPickOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 71,
            background: "rgba(5,4,6,.72)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "0 auto",
              borderRadius: "26px 26px 0 0",
              padding: "22px 20px calc(30px + env(safe-area-inset-bottom))",
              background: "linear-gradient(180deg,#161011,#0c0a0b 60%)",
              borderTop: "1px solid rgba(255,255,255,.1)",
              boxShadow: "0 -20px 50px rgba(0,0,0,.6)",
              animation: "riseIn .28s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: "#f5f2ef" }}>
              CATAT UNTUK
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".06em", color: "#7c736e", marginTop: 5 }}>
              Pilih waktu makan
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              {MEALS.map((m) => {
                const kc = byType[m.id].macros.kcal;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMealPickOpen(false);
                      setBuilderMeal(m.id);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 2,
                      padding: 15,
                      borderRadius: 16,
                      textAlign: "left",
                      cursor: "pointer",
                      background:
                        "linear-gradient(180deg,rgba(255,255,255,.05),transparent 40%),#0d0b0c",
                      border: "1px solid rgba(255,255,255,.1)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,.06),0 8px 18px rgba(0,0,0,.4)",
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{m.emoji}</span>
                    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: "#f1ede9", marginTop: 6 }}>
                      {m.name}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: "#8a837d", marginTop: 2 }}>
                      {kc > 0 ? `${Math.round(kc)} kkal` : "belum dicatat"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
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
