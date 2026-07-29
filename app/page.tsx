"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { macrosFor, type Macros } from "@/lib/ingredients";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import {
  dedupeMeals,
  getAllMeals,
  getDaily,
  getMealsForDate,
  isCustomItem,
  setDaily,
  type MealItem,
  type MealLog,
} from "@/lib/store";
import { TARGETS, todayKey, weekNumber } from "@/lib/targets";
import {
  getSession,
  getTodaysWorkout,
  recommendedSessionFor,
  type WorkoutSession,
} from "@/lib/workouts";
import { haptic } from "@/lib/haptics";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

const ID_DAYS = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];
const ID_MON = [
  "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
  "JUL", "AGU", "SEP", "OKT", "NOV", "DES",
];

function bahasaDateLine(d: Date): string {
  const day = ID_DAYS[d.getDay()];
  const mon = ID_MON[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} · ${d.getDate()} ${mon} · ${hh}:${mm}`;
}

function greetingForHour(h: number): { top: string; hot: string } {
  if (h >= 6 && h < 11) return { top: "BANGKIT &", hot: "TETAP PANAS." };
  if (h >= 11 && h < 17) return { top: "LANJUT", hot: "TERUS." };
  if (h >= 17 && h < 21) return { top: "DORONG", hot: "SAMPAI TUNTAS." };
  return { top: "TUTUP HARI", hot: "DENGAN GAS." };
}

function sumMealItems(items: MealItem[]): Macros {
  return items.reduce<Macros>(
    (a, it) => {
      const m = isCustomItem(it)
        ? { kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat }
        : macrosFor(it.id, it.qty);
      return {
        kcal: a.kcal + m.kcal,
        protein: a.protein + m.protein,
        carbs: a.carbs + m.carbs,
        fat: a.fat + m.fat,
      };
    },
    { ...EMPTY }
  );
}

/** Consecutive days (back from today) with at least one meal logged.
 *  Today with nothing logged yet doesn't break the streak (grace). */
function dayStreak(allMeals: MealLog[], todayStr: string): number {
  const logged = new Set(allMeals.map((m) => m.date));
  const [y, mo, d] = todayStr.split("-").map(Number);
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    dt.setUTCDate(dt.getUTCDate() - i);
    const key = dt.toISOString().slice(0, 10);
    if (logged.has(key)) streak++;
    else if (i === 0) continue; // today not logged yet — grace
    else break;
  }
  return streak;
}

/** Exercise-level progress for today's push/pull/etc session. */
function sessionProgress(
  workout: WorkoutSession | null,
  fallbackId: string
): { done: number; total: number; complete: boolean } {
  const def = getSession(workout?.sessionType ?? fallbackId);
  if (!workout) {
    return { done: 0, total: def?.exercises.length ?? 6, complete: false };
  }
  const total = def?.exercises.length ?? workout.exercises.length;
  let done = 0;
  workout.exercises.forEach((ex, i) => {
    const need = def?.exercises[i]?.sets ?? 0;
    if (need > 0 ? ex.sets.length >= need : ex.sets.length > 0) done++;
  });
  return { done, total, complete: workout.completed };
}

/** Ease a number up to its target so ring figures "count up" like the ref. */
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
      if (Math.abs(target - cur) < 0.5) {
        setV(target);
        return;
      }
      setV(cur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return Math.round(v);
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

function Ring({
  num,
  unit,
  textOverride,
  pct,
  stops,
  color,
  bigSize,
  sub,
  label,
  animate,
}: {
  num: number;
  unit?: string;
  textOverride?: string;
  pct: number;
  stops: string[];
  color: string;
  bigSize: number;
  sub: string;
  label: string;
  animate: boolean;
}) {
  const size = 104;
  const stroke = 10;
  const pad = 20;
  const box = size + pad * 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = box / 2;
  const cy = box / 2;
  const gid = "rg" + label.replace(/[^A-Za-z]/g, "");

  const clamped = Math.max(0, Math.min(100, pct));
  const targetOff = c - (clamped / 100) * c;
  const [off, setOff] = useState(c);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOff(targetOff));
    return () => cancelAnimationFrame(raf);
  }, [targetOff]);

  const shown = useCountUp(num, animate && textOverride === undefined);
  const bigText =
    textOverride !== undefined ? textOverride : `${shown}${unit ?? ""}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{ position: "relative", width: size, height: size, overflow: "visible" }}
      >
        <svg
          width={box}
          height={box}
          viewBox={`0 0 ${box} ${box}`}
          style={{ position: "absolute", top: -pad, left: -pad, overflow: "visible" }}
        >
          <defs>
            <linearGradient
              id={gid}
              gradientUnits="userSpaceOnUse"
              x1={cx - r}
              y1={cy - r}
              x2={cx + r}
              y2={cy + r}
            >
              <animateTransform
                attributeName="gradientTransform"
                type="rotate"
                from={`0 ${cx} ${cy}`}
                to={`360 ${cx} ${cy}`}
                dur="5s"
                repeatCount="indefinite"
              />
              {stops.map((sc, i) => (
                <stop
                  key={i}
                  offset={`${Math.round((i / (stops.length - 1)) * 100)}%`}
                  stopColor={sc}
                />
              ))}
            </linearGradient>
          </defs>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#221b1b" strokeWidth={stroke} />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(0,0,0,.5)"
            strokeWidth={stroke + 3}
            strokeDasharray={c}
            strokeDashoffset={off}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: "stroke-dashoffset .35s cubic-bezier(.16,1,.3,1)",
              opacity: 0.35,
            }}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={off}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: "stroke-dashoffset .35s cubic-bezier(.16,1,.3,1)",
              filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 14px ${color}77)`,
            }}
          />
        </svg>
        {/* glassy 3D glare */}
        <div
          style={{
            position: "absolute",
            inset: stroke + 1,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 34% 26%, rgba(255,255,255,.16), rgba(255,255,255,.03) 40%, transparent 62%)",
            pointerEvents: "none",
          }}
        />
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
          <div
            style={{
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: bigSize,
              color: "#fff",
              lineHeight: 1,
              textShadow: "0 2px 6px rgba(0,0,0,.5)",
            }}
          >
            {bigText}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 8.5,
              color: "#8a837d",
              marginTop: 3,
              letterSpacing: ".04em",
            }}
          >
            {sub}
          </div>
        </div>
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: ".14em",
          color: "#8a837d",
        }}
      >
        {label}
      </div>
    </div>
  );
}

const KCAL_STOPS = ["#ffce8a", "#ff8a3d", "#ee2f1f", "#ff6a4c"];
const PROT_STOPS = ["#c4f9d8", "#5fe39a", "#1fae5a", "#5fe39a"];
const SESS_STOPS = ["#ffd98a", "#ff9a3d", "#ee5a2f", "#ff8a3d"];
const REST_STOPS = ["#6a6560", "#454140", "#6a6560"];

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [gymDay, setGymDay] = useState(true);
  const [streak, setStreak] = useState(0);

  const reloadFromStore = useCallback(() => {
    dedupeMeals();
    const today = todayKey();
    setMeals(getMealsForDate(today));
    setWorkout(getTodaysWorkout(today));
    setGymDay(getDaily(today).gymDay);
    setStreak(dayStreak(getAllMeals(), today));
  }, []);
  useSoftRefresh(reloadFromStore);

  useEffect(() => {
    setMounted(true);
    reloadFromStore();
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [reloadFromStore]);

  const week = weekNumber();
  const hour = now.getHours();
  const greet = greetingForHour(hour);

  const totals: Macros = useMemo(
    () =>
      meals.reduce<Macros>(
        (a, m) => {
          const s = sumMealItems(m.items);
          return {
            kcal: a.kcal + s.kcal,
            protein: a.protein + s.protein,
            carbs: a.carbs + s.carbs,
            fat: a.fat + s.fat,
          };
        },
        { ...EMPTY }
      ),
    [meals]
  );

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;

  const recommendedId = useMemo(() => recommendedSessionFor(now), [now]);
  const sess = sessionProgress(workout, recommendedId);
  const sessName =
    getSession(workout?.sessionType ?? recommendedId)?.name ?? "LATIHAN";

  function toggleGym(next: boolean) {
    if (next === gymDay) return;
    haptic("tap");
    setGymDay(next);
    const today = todayKey();
    const cur = getDaily(today);
    setDaily({ date: today, gymDay: next, checklist: cur.checklist ?? {} });
  }

  const dateLine = bahasaDateLine(now);

  const workoutSub = !gymDay
    ? "Hari rest · pemulihan aktif"
    : `${sessName} · ${sess.done}/${sess.total} gerakan · ${
        sess.complete ? "selesai" : "lanjut"
      }`;
  const mealSub = `${Math.round(totals.kcal).toLocaleString()} kkal dicatat · ${Math.round(
    totals.protein
  )}g protein`;

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
      {/* header row: wordmark + streak pill */}
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
            fontWeight: 800,
            fontSize: 23,
            letterSpacing: "-.01em",
            color: "#f5f2ef",
          }}
        >
          R2<span style={{ color: "#ee3c30" }}>·</span>
          <span style={FIRE_TEXT}>FIT</span>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid rgba(238,60,48,.4)",
              background: "rgba(238,60,48,.08)",
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".08em",
              color: "#ff8a72",
            }}
          >
            🔥 {mounted ? streak : 0} HARI
          </div>
          {/* Settings moved out of the bottom nav (nav now carries the daily
              loop: Makan / Latihan / Stats). */}
          <Link
            href="/settings"
            aria-label="Pengaturan"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(255,255,255,.05)",
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            ⚙️
          </Link>
        </div>
      </div>

      {/* meta line */}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: ".14em",
          color: "#6a6660",
          marginTop: 12,
          textTransform: "uppercase",
        }}
      >
        {dateLine} · MINGGU {week} / 12
      </div>

      {/* hero heading */}
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 34,
          lineHeight: 1.05,
          color: "#f1ede9",
          marginTop: 20,
          letterSpacing: "-.02em",
        }}
      >
        {greet.top}
        <br />
        <span style={FIRE_TEXT}>{greet.hot}</span>
      </div>

      {/* rings */}
      <div
        style={{
          marginTop: 26,
          display: "flex",
          justifyContent: "space-around",
          alignItems: "flex-start",
        }}
      >
        <Ring
          num={Math.round(totals.kcal)}
          pct={(totals.kcal / target.kcal) * 100}
          stops={KCAL_STOPS}
          color="#ff6a4c"
          bigSize={22}
          sub={`/ ${target.kcal.toLocaleString()}`}
          label="KKAL"
          animate={mounted}
        />
        <Ring
          num={Math.round(totals.protein)}
          unit="g"
          pct={(totals.protein / target.protein) * 100}
          stops={PROT_STOPS}
          color="#5fe39a"
          bigSize={21}
          sub={`/ ${target.protein}g`}
          label="PROTEIN"
          animate={mounted}
        />
        {gymDay ? (
          <Ring
            num={sess.done}
            textOverride={sess.complete ? "✓" : `${sess.done}/${sess.total}`}
            pct={sess.total ? (sess.done / sess.total) * 100 : 0}
            stops={SESS_STOPS}
            color="#ff8a3d"
            bigSize={22}
            sub={sess.complete ? "kelar" : "gerakan"}
            label="SESI"
            animate={mounted}
          />
        ) : (
          <Ring
            num={0}
            textOverride="REST"
            pct={100}
            stops={REST_STOPS}
            color="#5a5551"
            bigSize={20}
            sub="pemulihan"
            label="SESI"
            animate={mounted}
          />
        )}
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

      {/* primary fire CTA */}
      <Link
        href="/workout"
        style={{
          position: "relative",
          overflow: "hidden",
          display: "block",
          width: "100%",
          marginTop: 14,
          padding: "18px 20px",
          borderRadius: 18,
          textAlign: "left",
          cursor: "pointer",
          background: "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)",
          border: "1px solid rgba(255,150,120,.6)",
          boxShadow:
            "inset 0 1.5px 1px rgba(255,225,205,.7), inset 0 -5px 10px rgba(150,20,5,.4), 0 14px 30px rgba(238,60,48,.42)",
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
        <span
          style={{
            display: "block",
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 20,
            color: "#fff",
            textShadow: "0 1px 2px rgba(120,15,5,.5)",
          }}
        >
          MULAI LATIHAN <span style={{ fontWeight: 500 }}>↗</span>
        </span>
        <span
          style={{
            display: "block",
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: ".06em",
            color: "rgba(255,240,235,.92)",
            marginTop: 4,
          }}
        >
          {workoutSub}
        </span>
      </Link>

      {/* co-primary CTA — logging food is a top daily action, so it gets the
          same weight as the workout (warm amber, distinct from the red). */}
      <Link
        href="/meal"
        style={{
          position: "relative",
          overflow: "hidden",
          display: "block",
          width: "100%",
          marginTop: 10,
          padding: "18px 20px",
          borderRadius: 18,
          textAlign: "left",
          cursor: "pointer",
          background: "linear-gradient(180deg,#ffb154,#ff861f 55%,#ef6a12)",
          border: "1px solid rgba(255,196,130,.6)",
          boxShadow:
            "inset 0 1.5px 1px rgba(255,240,215,.7), inset 0 -5px 10px rgba(170,80,5,.35), 0 14px 30px rgba(255,130,40,.4)",
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
            animationDelay: "3s",
          }}
        />
        <span
          style={{
            display: "block",
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 20,
            color: "#fff",
            textShadow: "0 1px 2px rgba(140,60,5,.5)",
          }}
        >
          🍽 CATAT MAKAN <span style={{ fontWeight: 500 }}>↗</span>
        </span>
        <span
          style={{
            display: "block",
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: ".06em",
            color: "rgba(255,242,232,.92)",
            marginTop: 4,
          }}
        >
          {mealSub}
        </span>
      </Link>

      {/* secondary — sleep is a supporting habit, so it's a quiet row that
          doesn't compete with the food + workout priorities above. */}
      <Link
        href="/sleep"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          marginTop: 14,
          padding: "12px 16px",
          borderRadius: 13,
          textAlign: "left",
          cursor: "pointer",
          background: "rgba(255,255,255,.03)",
          border: "1px solid rgba(255,255,255,.08)",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 15, opacity: 0.75 }}>
          😴
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".1em",
            fontWeight: 700,
            color: "#9a938d",
          }}
        >
          CATAT TIDUR
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".06em",
            color: "#6a6660",
            whiteSpace: "nowrap",
          }}
        >
          target 8 jam ↗
        </span>
      </Link>

    </main>
  );
}
