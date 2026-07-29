"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  dedupeMeals,
  getDaily,
  getMealsForDate,
  setDaily,
  type MealLog,
} from "@/lib/store";
import type { MealType } from "@/lib/presets";
import { TARGETS, weekNumber } from "@/lib/targets";
import { useActiveDate, parseDate } from "@/lib/activeDate";
import { sumNutrition } from "@/lib/nutritionStats";
import { getMicroTargets, type MicroTargets } from "@/lib/nutritionTargets";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import { renderNutritionCard, shareBlob } from "@/lib/shareCards";
import { haptic } from "@/lib/haptics";
import { getProfile, getSettings, type Profile } from "@/lib/settings";
import {
  SUPPLEMENT_WHITELIST,
  SUPPLEMENT_BLOCKLIST,
  randomDont,
  weeksOnProgram,
  PROGRAM_LOCK_WEEKS,
} from "@/lib/coaching";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const ID_DAYS = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];
const ID_MON = [
  "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
  "JUL", "AGU", "SEP", "OKT", "NOV", "DES",
];

function bahasaDateLine(dateStr: string): string {
  if (!dateStr) return "";
  const d = parseDate(dateStr);
  const day = ID_DAYS[d.getUTCDay()];
  const mon = ID_MON[d.getUTCMonth()];
  return `${day} · ${d.getUTCDate()} ${mon}`;
}

/** Meal-type presentation for the stats "MAKANAN HARI INI" list. */
const MEALS: { type: MealType; label: string }[] = [
  { type: "breakfast", label: "SARAPAN" },
  { type: "lunch", label: "MAKAN SIANG" },
  { type: "snack", label: "CAMILAN" },
  { type: "dinner", label: "MAKAN MALAM" },
];

/** Eases a 0→1 reveal factor on mount so bars/rings animate up like the ref. */
function useReveal(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let cur = 0;
    const tick = () => {
      cur = cur + (1 - cur) * 0.12;
      if (1 - cur < 0.005) {
        setT(1);
        return;
      }
      setT(cur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
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

const cardStyle: CSSProperties = {
  marginTop: 14,
  padding: 16,
  borderRadius: 18,
  background: "#0c0a0b",
  border: "1px solid rgba(255,255,255,.08)",
};

const cardLabelStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: ".16em",
  color: "#6a6660",
};

/* ---------------------------------------------------------------- macro bar */

function BarRow({
  label,
  value,
  target,
  unit,
  grad,
  glow,
  cap,
  delay,
  t,
  last,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  grad: string;
  glow: string;
  cap: boolean;
  delay: number;
  t: number;
  last?: boolean;
}) {
  const shown = value * t;
  const safeTarget = target || 1;
  const pct = Math.max(0, Math.min(100, (shown / safeTarget) * 100));
  const over = cap && shown > target;
  const hot = pct >= 88 || over;
  return (
    <div style={{ marginBottom: last ? 0 : 13 }}>
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

/* --------------------------------------------------------------- micro ring */

function MicroRing({
  code,
  value,
  target,
  color,
  color2,
  idx,
  t,
}: {
  code: string;
  value: number;
  target: number;
  color: string;
  color2: string;
  idx: number;
  t: number;
}) {
  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pctFull = Math.min(100, (value / (target || 1)) * 100);
  const pct = pctFull * t;
  const off = c - (pct / 100) * c;
  const gid = "mr" + code;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <div
          style={{
            position: "absolute",
            inset: 5,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${color}30, transparent 68%)`,
            filter: "blur(2px)",
            opacity: t,
          }}
        />
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient
              id={gid}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={0}
              x2={size}
              y2={size}
            >
              <animateTransform
                attributeName="gradientTransform"
                type="rotate"
                from={`0 ${size / 2} ${size / 2}`}
                to={`360 ${size / 2} ${size / 2}`}
                dur={`${3 + idx * 0.35}s`}
                repeatCount="indefinite"
              />
              <stop offset="0%" stopColor={color2} />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#211b1b"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={off}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 4px ${color}bb)` }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 11,
            color: "#fff",
            textShadow: "0 1px 3px rgba(0,0,0,.6)",
          }}
        >
          {Math.round(pct)}
        </div>
      </div>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 8,
          letterSpacing: ".08em",
          color,
        }}
      >
        {code}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Dashboard() {
  const { activeDate } = useActiveDate();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDay] = useState(true);
  const [microTargets, setMicroTargets] = useState<MicroTargets>(getMicroTargets);
  const [sharing, setSharing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const t = useReveal();

  useEffect(() => {
    setProfile(getProfile());
    setStartDate(getSettings().startDate);
  }, []);

  const isFemale = profile?.sex === "female";

  const reloadDay = useCallback(() => {
    if (!activeDate) return;
    dedupeMeals();
    setMeals(getMealsForDate(activeDate));
    setGymDay(getDaily(activeDate).gymDay);
    setMicroTargets(getMicroTargets());
  }, [activeDate]);

  useSoftRefresh(reloadDay);
  useEffect(() => {
    reloadDay();
  }, [reloadDay]);

  // Full nutrient picture for the active day: macros + real micronutrients.
  const today = useMemo(() => sumNutrition(meals), [meals]);

  const kcalByType = useMemo(() => {
    const map: Record<MealType, number> = {
      breakfast: 0,
      lunch: 0,
      snack: 0,
      dinner: 0,
    };
    for (const m of meals) map[m.mealType] += sumNutrition([m]).kcal;
    return map;
  }, [meals]);

  const week = activeDate ? weekNumber(parseDate(activeDate)) : 1;
  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const dateLine = bahasaDateLine(activeDate);
  const dayType = gymDay ? "HARI GYM" : "HARI REST";

  function toggleGym(next: boolean) {
    if (next === gymDay || !activeDate) return;
    haptic("tap");
    setGymDay(next);
    const cur = getDaily(activeDate);
    setDaily({ date: activeDate, gymDay: next, checklist: cur.checklist ?? {} });
  }

  // Smart tip — computed from real remaining protein / kcal (Bahasa).
  const pLeft = Math.round(target.protein - today.protein);
  const kLeft = Math.round(target.kcal - today.kcal);
  let tip: string;
  if (today.kcal === 0) tip = "Catat makanan pertamamu buat dapet rekomendasi.";
  else if (today.kcal > target.kcal + 100)
    tip = "Kalori kelewat target — lebih ringan di makan berikutnya.";
  else if (pLeft > 20) tip = `Sisa ${pLeft}g protein — masih bisa kejar target.`;
  else tip = `Sisa ${kLeft} kkal buat hari ini. Habiskan dengan bijak.`;

  // Macro-split segmented bar (protein / carbs / fat proportion).
  const pg = today.protein * t;
  const cg = today.carbs * t;
  const fg = today.fat * t;
  const totMacro = Math.max(1, pg + cg + fg);
  const pEnd = (pg / totMacro) * 100;
  const cEnd = ((pg + cg) / totMacro) * 100;
  const gCol = "#3ad97d";
  const bCol = "#2aa5e0";
  const amCol = "#f0c341";
  const bl = 6;
  const s1 = Math.max(0, pEnd - bl);
  const s2 = Math.min(100, pEnd + bl);
  const s3 = Math.max(s2, cEnd - bl);
  const s4 = Math.min(100, cEnd + bl);
  const splitGrad = `linear-gradient(90deg, ${gCol} 0%, ${gCol} ${s1}%, ${bCol} ${s2}%, ${bCol} ${s3}%, ${amCol} ${s4}%, ${amCol} 100%)`;

  const microData = [
    { code: "K", value: today.k, target: microTargets.k, color: "#ff8a3d", color2: "#ffd08a" },
    { code: "MG", value: today.mg, target: microTargets.mg, color: "#eab308", color2: "#ffe488" },
    { code: "FE", value: today.fe, target: microTargets.fe, color: "#ff6a4c", color2: "#ffb39e" },
    { code: "ZN", value: today.zn, target: microTargets.zn, color: "#229ed9", color2: "#84d2f6" },
    { code: "CA", value: today.ca, target: microTargets.ca, color: "#d7d8da", color2: "#ffffff" },
    { code: "FIB", value: today.fiber, target: microTargets.fiber, color: "#22c55e", color2: "#84f0b3" },
  ];

  async function handleShare() {
    if (!activeDate || sharing) return;
    haptic("tap");
    setSharing(true);
    try {
      const dl =
        parseDate(activeDate)
          .toLocaleDateString("en", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
          .toUpperCase() + " · HANGZHOU";
      const blob = await renderNutritionCard({
        kcal: today.kcal,
        protein: today.protein,
        carbs: today.carbs,
        fat: today.fat,
        proteinTarget: target.protein,
        kcalTarget: target.kcal,
        mealsLogged: meals.length,
        week,
        dateLine: dl,
        gymDay,
      });
      await shareBlob(blob, `r2fit-day-${activeDate}.png`, "Day locked in.");
    } finally {
      setSharing(false);
    }
  }

  const legendDot = (color: string) => (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 6px ${color}88`,
      }}
    />
  );

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
      {/* header */}
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 26,
          color: "#f1ede9",
          letterSpacing: "-.01em",
        }}
      >
        STATISTIK <span style={FIRE_TEXT}>HARI INI</span>
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: ".12em",
          color: "#6a6660",
          marginTop: 9,
          textTransform: "uppercase",
        }}
      >
        {dateLine} · {dayType} · MINGGU {week} / 12
      </div>

      {/* day toggle */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button type="button" onClick={() => toggleGym(true)} style={toggleStyle(gymDay)}>
          GYM
        </button>
        <button type="button" onClick={() => toggleGym(false)} style={toggleStyle(!gymDay)}>
          REST
        </button>
      </div>

      {/* macro bars */}
      <div
        style={{
          ...cardStyle,
          marginTop: 20,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
        }}
      >
        <BarRow
          label="KALORI"
          value={today.kcal}
          target={target.kcal}
          unit=""
          grad="linear-gradient(90deg,#ff8a3d,#ee2f1f)"
          glow="rgba(238,60,48,.6)"
          cap={false}
          delay={0}
          t={t}
        />
        <BarRow
          label="PROTEIN"
          value={today.protein}
          target={target.protein}
          unit="g"
          grad="linear-gradient(90deg,#6ff0a4,#22c55e)"
          glow="rgba(34,197,94,.5)"
          cap={false}
          delay={0.5}
          t={t}
        />
        <BarRow
          label="KARBO"
          value={today.carbs}
          target={target.carbs}
          unit="g"
          grad="linear-gradient(90deg,#5ac8f5,#229ed9)"
          glow="rgba(34,158,217,.5)"
          cap={false}
          delay={1}
          t={t}
        />
        <BarRow
          label="LEMAK"
          value={today.fat}
          target={target.fat}
          unit="g"
          grad="linear-gradient(90deg,#ffd25a,#eab308)"
          glow="rgba(234,179,8,.5)"
          cap={false}
          delay={1.5}
          t={t}
        />
        <BarRow
          label="GULA"
          value={today.sugar}
          target={microTargets.sugar}
          unit="g"
          grad="linear-gradient(90deg,#ff8a72,#ee3c30)"
          glow="rgba(238,60,48,.6)"
          cap
          delay={2}
          t={t}
          last
        />
      </div>

      {/* macro split */}
      <div style={cardStyle}>
        <div style={{ ...cardLabelStyle, marginBottom: 12 }}>SPLIT MAKRO</div>
        <div
          style={{
            position: "relative",
            height: 16,
            borderRadius: 9,
            overflow: "hidden",
            background: splitGrad,
            boxShadow:
              "inset 0 1px 2px rgba(0,0,0,.4), inset 0 -3px 6px rgba(0,0,0,.25)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,.04) 46%,transparent 62%)",
              pointerEvents: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          {[
            { c: gCol, l: "PROTEIN", g: today.protein },
            { c: bCol, l: "KARBO", g: today.carbs },
            { c: amCol, l: "LEMAK", g: today.fat },
          ].map((x) => (
            <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {legendDot(x.c)}
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#9a938d" }}>
                {x.l} {Math.round(x.g)}g
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* micronutrients */}
      <div style={cardStyle}>
        <div style={{ ...cardLabelStyle, marginBottom: 14 }}>MIKRONUTRIEN</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: 8,
          }}
        >
          {microData.map((m, i) => (
            <MicroRing
              key={m.code}
              code={m.code}
              value={m.value}
              target={m.target}
              color={m.color}
              color2={m.color2}
              idx={i}
              t={t}
            />
          ))}
        </div>
      </div>

      {/* smart tip */}
      <div
        style={{
          marginTop: 14,
          padding: "13px 15px",
          borderRadius: 14,
          background: "rgba(238,60,48,.07)",
          border: "1px solid rgba(238,60,48,.28)",
          fontFamily: MONO,
          fontSize: 11,
          lineHeight: 1.5,
          color: "#ffb39e",
        }}
      >
        {tip}
      </div>

      {/* meals today */}
      <div style={{ ...cardLabelStyle, marginTop: 22 }}>// MAKANAN HARI INI</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginTop: 11,
        }}
      >
        {MEALS.map((m) => {
          const kc = kcalByType[m.type];
          const logged = kc > 0;
          return (
            <div
              key={m.type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "12px 14px",
                borderRadius: 13,
                background: "#0a0809",
                border: "1px solid rgba(255,255,255,.06)",
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: ".1em",
                  color: "#cfc8c2",
                  flex: 1,
                }}
              >
                {m.label}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: logged ? "#f1ede9" : "#6a6660",
                }}
              >
                {logged ? `${Math.round(kc)} kkal` : "—"}
              </span>
              {!logged && (
                <Link
                  href={`/meal/${m.type}?date=${activeDate}`}
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: ".08em",
                    color: "#ff8a72",
                    textDecoration: "none",
                    padding: "0 0 0 8px",
                  }}
                >
                  CATAT →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* share */}
      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        style={{
          position: "relative",
          overflow: "hidden",
          width: "100%",
          marginTop: 18,
          padding: 15,
          borderRadius: 14,
          cursor: sharing ? "default" : "pointer",
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 14,
          color: "#fff",
          background: FIRE,
          border: "1px solid rgba(255,150,120,.6)",
          boxShadow:
            "inset 0 1.5px 1px rgba(255,225,205,.7),0 12px 26px rgba(238,60,48,.42)",
          textShadow: "0 1px 2px rgba(120,15,5,.5)",
          opacity: sharing ? 0.75 : 1,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 0,
            left: "-55%",
            width: "55%",
            height: "100%",
            background:
              "linear-gradient(105deg,transparent,rgba(255,255,255,.35),transparent)",
            animation: "btnSheen 6s ease-in-out infinite",
          }}
        />
        {sharing ? "MENYIAPKAN…" : "BAGIKAN HARI INI"}
      </button>

      {/* recommendations — female-aware coaching (supplements, don'ts, lock) */}
      {isFemale && (
        <>
          <div style={{ ...cardLabelStyle, marginTop: 24 }}>// REKOMENDASI</div>

          <div style={{ ...cardStyle, marginTop: 11 }}>
            <div style={{ ...cardLabelStyle, marginBottom: 12 }}>
              SUPLEMEN · WORTH IT
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SUPPLEMENT_WHITELIST.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 10 }}>
                  <span
                    style={{
                      marginTop: 5,
                      width: 8,
                      height: 8,
                      flex: "0 0 auto",
                      borderRadius: "50%",
                      background: "#3ad97d",
                      boxShadow: "0 0 6px rgba(58,217,125,.55)",
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontWeight: 700,
                        fontSize: 12.5,
                        color: "#f1ede9",
                      }}
                    >
                      {s.name}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        lineHeight: 1.5,
                        color: "#9a938d",
                        marginTop: 2,
                      }}
                    >
                      {s.note}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                ...cardLabelStyle,
                marginTop: 16,
                marginBottom: 12,
                color: "#7c6a66",
              }}
            >
              SUPLEMEN · BUANG DUIT
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SUPPLEMENT_BLOCKLIST.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 10, opacity: 0.6 }}>
                  <span
                    style={{
                      marginTop: 5,
                      width: 8,
                      height: 8,
                      flex: "0 0 auto",
                      borderRadius: "50%",
                      background: "#5a534f",
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontWeight: 700,
                        fontSize: 12.5,
                        color: "#8a827c",
                        textDecoration: "line-through",
                        textDecorationColor: "rgba(238,60,48,.5)",
                      }}
                    >
                      {s.name}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        lineHeight: 1.5,
                        color: "#6a6660",
                        marginTop: 2,
                      }}
                    >
                      {s.note}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* rotating "don't" tip — seeded by day-of-month, no Math.random */}
          <div
            style={{
              marginTop: 14,
              padding: "13px 15px",
              borderRadius: 14,
              background: "rgba(238,60,48,.07)",
              border: "1px solid rgba(238,60,48,.28)",
              fontFamily: MONO,
              fontSize: 11,
              lineHeight: 1.5,
              color: "#ffb39e",
            }}
          >
            {randomDont(parseDate(activeDate).getUTCDate())}
          </div>

          {/* program-lock encouragement */}
          <div
            style={{
              marginTop: 14,
              padding: "13px 15px",
              borderRadius: 14,
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.1)",
              fontFamily: MONO,
              fontSize: 11,
              lineHeight: 1.5,
              color: "#cfc8c2",
            }}
          >
            MINGGU KE-{startDate ? weeksOnProgram(startDate) : 0} /{" "}
            {PROGRAM_LOCK_WEEKS} — tahan di program yang sama, konsistensi
            &gt; gonta-ganti.
          </div>
        </>
      )}

      {/* secondary nav — preserves the existing dashboard sub-routes */}
      <div style={{ ...cardLabelStyle, marginTop: 24 }}>// SELENGKAPNYA</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,1fr)",
          gap: 8,
          marginTop: 11,
        }}
      >
        {[
          { href: "/dashboard/today", label: "HARI INI" },
          { href: "/dashboard/week", label: "MINGGUAN" },
          { href: "/dashboard/gym", label: "SESI GYM" },
          { href: "/dashboard/progress", label: "PROGRES" },
          { href: "/dashboard/checklist", label: "CHECKLIST" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "13px 15px",
              borderRadius: 13,
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.1)",
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".08em",
              color: "#cfc8c2",
              textDecoration: "none",
            }}
          >
            {l.label}
            <span style={{ color: "#6a6660" }}>›</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
