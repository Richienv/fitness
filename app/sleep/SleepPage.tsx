"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import { useSheetBack } from "@/lib/backSheet";
import { SLEEP_TARGET_MIN, todayKey, weekNumber } from "@/lib/targets";
import {
  consistencyScore,
  durationFromTimes,
  getAllSleep,
  getSleep,
  getSleepForRange,
  setSleep,
  sleepDebtMin,
  sleepStreak,
  type SleepLog,
  type SleepQuality,
} from "@/lib/sleep";
import { haptic } from "@/lib/haptics";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const NIGHT = "linear-gradient(180deg,#5b6ee0,#3a3f9e 55%,#232a6b)";
const NIGHT_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#8ea0ff,#4b53c8)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};
const NIGHT_STOPS = ["#aeb8ff", "#5b6ee0", "#3a3f9e", "#7c8cf0"];

const ID_DAYS = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];
const ID_MON = [
  "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
  "JUL", "AGU", "SEP", "OKT", "NOV", "DES",
];

function bahasaDateLine(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${ID_DAYS[d.getDay()]} · ${d.getDate()} ${ID_MON[d.getMonth()]} · ${hh}:${mm}`;
}

function clockFromMin(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function minFromClock(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hoursText(mins: number): string {
  return (Math.round((mins / 60) * 10) / 10).toString();
}

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}

function weekdayOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return ID_DAYS[new Date(y, m - 1, d).getDay()];
}

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

function Ring({
  centerMin,
  hasData,
  pct,
  animate,
}: {
  centerMin: number;
  hasData: boolean;
  pct: number;
  animate: boolean;
}) {
  const size = 116;
  const stroke = 11;
  const pad = 20;
  const box = size + pad * 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = box / 2;
  const cy = box / 2;
  const gid = "sleepRing";

  const clamped = Math.max(0, Math.min(100, pct));
  const targetOff = c - (clamped / 100) * c;
  const [off, setOff] = useState(c);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOff(targetOff));
    return () => cancelAnimationFrame(raf);
  }, [targetOff]);

  const shownMin = useCountUp(centerMin, animate && hasData);
  const big = hasData ? hoursText(shownMin) : "—";

  return (
    <div style={{ position: "relative", width: size, height: size, overflow: "visible" }}>
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
              dur="6s"
              repeatCount="indefinite"
            />
            {NIGHT_STOPS.map((sc, i) => (
              <stop
                key={i}
                offset={`${Math.round((i / (NIGHT_STOPS.length - 1)) * 100)}%`}
                stopColor={sc}
              />
            ))}
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1b1d33" strokeWidth={stroke} />
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
          style={{ transition: "stroke-dashoffset .35s cubic-bezier(.16,1,.3,1)", opacity: 0.35 }}
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
            filter: "drop-shadow(0 0 6px #7c8cf0) drop-shadow(0 0 14px #7c8cf077)",
          }}
        />
      </svg>
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
            fontSize: 30,
            color: "#fff",
            lineHeight: 1,
            textShadow: "0 2px 6px rgba(0,0,0,.5)",
          }}
        >
          {big}
          {hasData && (
            <span style={{ fontSize: 15, fontWeight: 700, marginLeft: 1 }}>J</span>
          )}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: "#8a90b5",
            marginTop: 4,
            letterSpacing: ".04em",
          }}
        >
          {hasData ? `/ 8J TARGET` : "belum dicatat"}
        </div>
      </div>
    </div>
  );
}

const QUALITY: { v: SleepQuality; emoji: string; label: string }[] = [
  { v: 1, emoji: "😵", label: "BURUK" },
  { v: 2, emoji: "😐", label: "OKE" },
  { v: 3, emoji: "😌", label: "NYENYAK" },
];

export default function SleepPage() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [all, setAll] = useState<Record<string, SleepLog>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  // Hardware back closes the log sheet instead of leaving the page.
  useSheetBack(sheetOpen, () => setSheetOpen(false));
  const [bedMin, setBedMin] = useState(23 * 60);
  const [wakeMin, setWakeMin] = useState(7 * 60);
  const [quality, setQuality] = useState<SleepQuality>(2);

  const today = todayKey();

  const reload = useCallback(() => {
    setAll(getAllSleep());
  }, []);
  useSoftRefresh(reload);

  useEffect(() => {
    setMounted(true);
    reload();
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [reload]);

  const week = weekNumber();
  const lastNight = all[today] ?? null;
  const streak = useMemo(() => sleepStreak(all, today), [all, today]);

  const range = useMemo(() => {
    const from = addDays(today, -6);
    const map = new Map(getSleepForRange(from, today).map((s) => [s.date, s]));
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(today, -6 + i);
      return { key, log: map.get(key) ?? null };
    });
  }, [today, all]);

  const loggedList = useMemo(
    () => range.map((r) => r.log).filter((s): s is SleepLog => !!s),
    [range]
  );

  const debtMin = useMemo(() => sleepDebtMin(loggedList), [loggedList]);
  const consistency = useMemo(() => consistencyScore(loggedList), [loggedList]);

  const pct = lastNight ? (lastNight.durationMin / SLEEP_TARGET_MIN) * 100 : 0;

  const recovery = useMemo(() => {
    const last2 = loggedList.slice(-2);
    if (last2.length === 0) return "Catat tidur buat lihat kesiapan recovery.";
    const avg = last2.reduce((a, s) => a + s.durationMin, 0) / last2.length;
    if (avg < 360) return "Kurang tidur — pertimbangkan sesi ringan hari ini.";
    if (avg >= SLEEP_TARGET_MIN && (consistency ?? 0) >= 70)
      return "Recovery mantap — hajar latihan berat. 🔥";
    return "Recovery oke — latihan normal aman.";
  }, [loggedList, consistency]);

  const tip = useMemo(() => {
    if (debtMin >= 180)
      return `Utang tidur numpuk ${hoursText(debtMin)} jam — tidur lebih awal malam ini.`;
    if (consistency !== null && consistency < 60)
      return "Jam tidurmu berantakan — coba tidur & bangun di jam yang sama.";
    if (lastNight && lastNight.durationMin < SLEEP_TARGET_MIN)
      return `Kurang ${SLEEP_TARGET_MIN - lastNight.durationMin} menit dari target — dorong lebih awal.`;
    if (!lastNight) return "Belum catat tidur tadi malam. Tap tombol di atas.";
    return "Tidurmu on track. Pertahankan. 😌";
  }, [debtMin, consistency, lastNight]);

  function openSheet() {
    haptic("tap");
    if (lastNight && lastNight.bedtime && lastNight.wakeTime) {
      setBedMin(minFromClock(lastNight.bedtime));
      setWakeMin(minFromClock(lastNight.wakeTime));
    } else {
      setBedMin(23 * 60);
      setWakeMin(7 * 60);
    }
    setQuality(lastNight?.quality ?? 2);
    setSheetOpen(true);
  }

  function saveSleep() {
    const bedtime = clockFromMin(bedMin);
    const wakeTime = clockFromMin(wakeMin);
    const durationMin = durationFromTimes(bedtime, wakeTime);
    setSleep({ date: today, bedtime, wakeTime, durationMin, quality });
    haptic("success");
    setSheetOpen(false);
    reload();
  }

  const previewDur = durationFromTimes(clockFromMin(bedMin), clockFromMin(wakeMin));
  const maxBar = Math.max(SLEEP_TARGET_MIN, ...range.map((r) => r.log?.durationMin ?? 0));

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        minHeight: "100dvh",
        padding: "calc(20px + env(safe-area-inset-top)) 20px 26px",
        background:
          "radial-gradient(1100px 700px at 50% -8%, #12132b 0%, #0a0b16 42%, #050406 100%)",
        fontFamily: SANS,
      }}
    >
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 23,
            letterSpacing: "-.01em",
            color: "#f5f2ef",
          }}
        >
          R2<span style={{ color: "#5b6ee0" }}>·</span>
          <span style={NIGHT_TEXT}>TIDUR</span>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid rgba(91,110,224,.4)",
            background: "rgba(91,110,224,.1)",
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".08em",
            color: "#8ea0ff",
          }}
        >
          😴 {mounted ? streak : 0} MALAM
        </div>
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: ".14em",
          color: "#66688a",
          marginTop: 12,
          textTransform: "uppercase",
        }}
      >
        {bahasaDateLine(now)} · MINGGU {week} / 12
      </div>

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
        PULIH DI
        <br />
        <span style={NIGHT_TEXT}>KEGELAPAN.</span>
      </div>

      {/* hero ring */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 26 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Ring
            centerMin={lastNight?.durationMin ?? 0}
            hasData={!!lastNight}
            pct={pct}
            animate={mounted}
          />
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: ".14em",
              color: "#8a90b5",
            }}
          >
            TIDUR TADI MALAM
          </div>
        </div>
      </div>

      {/* log CTA */}
      <button
        type="button"
        onClick={openSheet}
        style={{
          position: "relative",
          overflow: "hidden",
          display: "block",
          width: "100%",
          marginTop: 24,
          padding: "18px 20px",
          borderRadius: 18,
          textAlign: "left",
          cursor: "pointer",
          background: NIGHT,
          border: "1px solid rgba(150,165,255,.55)",
          boxShadow:
            "inset 0 1.5px 1px rgba(220,225,255,.6), inset 0 -5px 10px rgba(20,25,90,.4), 0 14px 30px rgba(58,63,158,.42)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 0,
            left: "-55%",
            width: "55%",
            height: "100%",
            background: "linear-gradient(105deg,transparent,rgba(255,255,255,.35),transparent)",
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
            textShadow: "0 1px 2px rgba(15,20,90,.5)",
          }}
        >
          {lastNight ? "UBAH CATATAN" : "CATAT TIDUR"} <span style={{ fontWeight: 500 }}>↗</span>
        </span>
        <span
          style={{
            display: "block",
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: ".06em",
            color: "rgba(235,238,255,.92)",
            marginTop: 4,
          }}
        >
          {lastNight && lastNight.bedtime
            ? `${lastNight.bedtime} → ${lastNight.wakeTime} · ${hoursText(lastNight.durationMin)}j`
            : "Bedtime · bangun · kualitas"}
        </span>
      </button>

      {/* two stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <StatTile
          label="UTANG TIDUR"
          value={mounted ? `${hoursText(debtMin)}` : "0"}
          unit="jam"
          hint={debtMin > 0 ? "7 malam terakhir" : "lunas ✓"}
          pct={Math.min(100, (debtMin / (SLEEP_TARGET_MIN * 2)) * 100)}
          warn={debtMin >= 180}
        />
        <StatTile
          label="KONSISTENSI"
          value={mounted && consistency !== null ? `${consistency}` : "—"}
          unit={consistency !== null ? "/100" : ""}
          hint={
            consistency === null
              ? "butuh 3+ malam"
              : consistency >= 75
                ? "Reguler"
                : consistency >= 55
                  ? "Agak berantakan"
                  : "Berantakan"
          }
          pct={consistency ?? 0}
          warn={consistency !== null && consistency < 55}
        />
      </div>

      {/* 7-night chart */}
      <div
        style={{
          marginTop: 12,
          padding: 16,
          borderRadius: 18,
          background: "#0c0b14",
          border: "1px solid rgba(255,255,255,.08)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".16em",
            color: "#66688a",
            marginBottom: 14,
          }}
        >
          7 MALAM TERAKHIR
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 108 }}>
          {range.map(({ key, log }) => {
            const dur = log?.durationMin ?? 0;
            const h = maxBar > 0 ? (dur / maxBar) * 100 : 0;
            const hit = dur >= SLEEP_TARGET_MIN;
            const short = dur > 0 && dur < 360;
            const isToday = key === today;
            const grad = hit
              ? "linear-gradient(180deg,#7c8cf0,#3a3f9e)"
              : short
                ? "linear-gradient(180deg,#ff8a72,#ee3c30)"
                : "linear-gradient(180deg,#4b4f7a,#2c2f4d)";
            return (
              <div
                key={key}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  height: "100%",
                  justifyContent: "flex-end",
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 8, color: "#8a90b5" }}>
                  {dur > 0 ? hoursText(dur) : ""}
                </div>
                <div
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    width: "100%",
                    height: `${Math.max(dur > 0 ? 8 : 3, h)}%`,
                    borderRadius: 7,
                    background: dur > 0 ? grad : "rgba(255,255,255,.05)",
                    boxShadow: hit ? "0 0 10px rgba(124,140,240,.5)" : "none",
                  }}
                >
                  {dur > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "45%",
                        height: "100%",
                        background:
                          "linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent)",
                        animation: "barSheen 4.5s ease-in-out infinite",
                      }}
                    />
                  )}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 8,
                    letterSpacing: ".06em",
                    color: isToday ? "#8ea0ff" : "#66688a",
                  }}
                >
                  {weekdayOf(key)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* recovery line */}
      <div
        style={{
          marginTop: 12,
          padding: "14px 16px",
          borderRadius: 14,
          background: "rgba(91,110,224,.08)",
          border: "1px solid rgba(91,110,224,.28)",
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 14,
          color: "#c7ccf5",
        }}
      >
        🛌 {recovery}
      </div>

      {/* smart tip */}
      <div
        style={{
          marginTop: 10,
          padding: "13px 15px",
          borderRadius: 14,
          background: "rgba(255,255,255,.03)",
          border: "1px solid rgba(255,255,255,.09)",
          fontFamily: MONO,
          fontSize: 11,
          lineHeight: 1.5,
          color: "#9a9db8",
        }}
      >
        💡 {tip}
      </div>

      {/* log sheet */}
      {sheetOpen && (
        <div
          onClick={() => setSheetOpen(false)}
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
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "0 auto",
              borderRadius: "26px 26px 0 0",
              padding: "22px 20px calc(30px + env(safe-area-inset-bottom))",
              background: "linear-gradient(180deg,#14152b,#0c0b14 60%)",
              borderTop: "1px solid rgba(255,255,255,.1)",
              boxShadow: "0 -20px 50px rgba(0,0,0,.6)",
              animation: "riseIn .28s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 19, color: "#f5f2ef" }}>
                Tidur tadi malam
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: "#8ea0ff" }}>
                {hoursText(previewDur)} JAM
              </div>
            </div>

            <Stepper label="TIDUR JAM" value={clockFromMin(bedMin)} onMinus={() => setBedMin((v) => v - 15)} onPlus={() => setBedMin((v) => v + 15)} />
            <Stepper label="BANGUN JAM" value={clockFromMin(wakeMin)} onMinus={() => setWakeMin((v) => v - 15)} onPlus={() => setWakeMin((v) => v + 15)} />

            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: "#66688a", marginTop: 18, marginBottom: 9 }}>
              KUALITAS
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {QUALITY.map((q) => {
                const on = quality === q.v;
                return (
                  <button
                    key={q.v}
                    type="button"
                    onClick={() => setQuality(q.v)}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 5,
                      padding: "12px",
                      borderRadius: 14,
                      cursor: "pointer",
                      background: on ? "rgba(91,110,224,.16)" : "rgba(255,255,255,.03)",
                      border: on ? "1px solid rgba(150,165,255,.6)" : "1px solid rgba(255,255,255,.1)",
                      boxShadow: on ? "0 0 14px rgba(91,110,224,.35)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{q.emoji}</span>
                    <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".1em", color: on ? "#8ea0ff" : "#66688a" }}>
                      {q.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                style={{
                  flex: 1,
                  padding: 15,
                  borderRadius: 14,
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#9a938d",
                  cursor: "pointer",
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.1)",
                }}
              >
                BATAL
              </button>
              <button
                type="button"
                onClick={saveSleep}
                style={{
                  flex: 2,
                  position: "relative",
                  overflow: "hidden",
                  padding: 15,
                  borderRadius: 14,
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 14,
                  color: "#fff",
                  cursor: "pointer",
                  background: NIGHT,
                  border: "1px solid rgba(150,165,255,.6)",
                  boxShadow: "inset 0 1.5px 1px rgba(220,225,255,.6),0 10px 22px rgba(58,63,158,.42)",
                  textShadow: "0 1px 2px rgba(15,20,90,.5)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "-55%",
                    width: "55%",
                    height: "100%",
                    background: "linear-gradient(105deg,transparent,rgba(255,255,255,.4),transparent)",
                    animation: "btnSheen 5s ease-in-out infinite",
                  }}
                />
                SIMPAN ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatTile({
  label,
  value,
  unit,
  hint,
  pct,
  warn,
}: {
  label: string;
  value: string;
  unit: string;
  hint: string;
  pct: number;
  warn: boolean;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        background: "#0c0b14",
        border: "1px solid rgba(255,255,255,.08)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", color: "#66688a" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
        <span
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 28,
            color: warn ? "#ff8a72" : "#f1ede9",
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "#66688a" }}>{unit}</span>
      </div>
      <div
        style={{
          marginTop: 10,
          height: 6,
          borderRadius: 999,
          background: "rgba(255,255,255,.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.max(0, Math.min(100, pct))}%`,
            borderRadius: 999,
            background: warn
              ? "linear-gradient(90deg,#ff8a72,#ee3c30)"
              : "linear-gradient(90deg,#7c8cf0,#3a3f9e)",
            transition: "width .6s cubic-bezier(.16,1,.3,1)",
          }}
        />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: "#8a90b5", marginTop: 8 }}>{hint}</div>
    </div>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const btn: CSSProperties = {
    width: 46,
    height: 46,
    borderRadius: 14,
    fontSize: 18,
    color: "#f1ede9",
    cursor: "pointer",
    background: "rgba(255,255,255,.05)",
    border: "1px solid rgba(255,255,255,.12)",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".14em", color: "#8a90b5" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button type="button" onClick={onMinus} style={btn}>
          −
        </button>
        <span
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 26,
            color: "#fff",
            minWidth: 90,
            textAlign: "center",
          }}
        >
          {value}
        </span>
        <button type="button" onClick={onPlus} style={btn}>
          +
        </button>
      </div>
    </div>
  );
}
