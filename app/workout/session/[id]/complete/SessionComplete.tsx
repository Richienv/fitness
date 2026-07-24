"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  getDefForWorkout,
  getWorkout,
  getLastSessionOfType,
  weekNumber,
  workoutVolume,
  type WorkoutSession,
} from "@/lib/workouts";
import { MUSCLE_TO_GROUP, type MuscleKey } from "@/lib/muscles";
import { renderWorkoutCard, shareBlob } from "@/lib/shareCards";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const MLABEL: Record<MuscleKey, string> = {
  chest: "DADA",
  frontDelt: "DELT DEPAN",
  sideDelt: "DELT SAMPING",
  rearDelt: "DELT BELAKANG",
  tricep: "TRICEP",
  bicep: "BICEP",
  lats: "PUNGGUNG",
  midBack: "PUNGGUNG TENGAH",
  traps: "TRAP",
  quad: "QUADS",
  hamstring: "HAMSTRING",
  glute: "GLUTES",
  calf: "BETIS",
  abs: "PERUT",
};

const CONFETTI = [
  { left: "12%", w: 7, h: 12, color: "#ff8a3d", dur: 2.6, delay: 0.1 },
  { left: "28%", w: 6, h: 11, color: "#22c55e", dur: 3.0, delay: 0.5 },
  { left: "46%", w: 8, h: 13, color: "#ee3c30", dur: 2.3, delay: 0.2 },
  { left: "64%", w: 6, h: 10, color: "#ffd08a", dur: 2.8, delay: 0.7 },
  { left: "82%", w: 7, h: 12, color: "#ff8a72", dur: 3.2, delay: 0.35 },
  { left: "90%", w: 6, h: 11, color: "#22c55e", dur: 2.5, delay: 0.9 },
];

export default function SessionComplete({ workoutId }: { workoutId: string }) {
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [prev, setPrev] = useState<WorkoutSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const w = getWorkout(workoutId);
    setWorkout(w);
    if (w) setPrev(getLastSessionOfType(w.sessionType, w.id));
    setLoaded(true);
  }, [workoutId]);

  const def = workout ? getDefForWorkout(workout) : null;

  const volume = workout ? workout.totalVolume ?? workoutVolume(workout) : 0;
  const setsLogged = workout
    ? workout.exercises.reduce((a, e) => a + e.sets.length, 0)
    : 0;

  // Personal records vs the last session of this type.
  const prs = useMemo(() => {
    if (!workout || !prev || !def) return [];
    const out: { name: string; value: string }[] = [];
    for (let i = 0; i < workout.exercises.length; i++) {
      const nowEx = workout.exercises[i];
      const name = def.exercises[i]?.name ?? nowEx.exerciseName;
      const prevEx = prev.exercises.find((e) => e.exerciseName === name);
      if (!nowEx || nowEx.sets.length === 0) continue;
      const nowBest = nowEx.sets.reduce((a, b) => (b.weight * b.reps > a.weight * a.reps ? b : a));
      if (!prevEx || prevEx.sets.length === 0) continue;
      const prevBest = prevEx.sets.reduce((a, b) => (b.weight * b.reps > a.weight * a.reps ? b : a));
      if (nowBest.weight * nowBest.reps > prevBest.weight * prevBest.reps) {
        out.push({ name: nowEx.swappedTo ?? name, value: `${nowBest.weight}kg × ${nowBest.reps}` });
      }
    }
    return out;
  }, [workout, prev, def]);

  // Muscle split for the animated bars.
  const muscleBars = useMemo(() => {
    if (!workout || !def) return [];
    const map = new Map<MuscleKey, number>();
    for (let i = 0; i < workout.exercises.length; i++) {
      const log = workout.exercises[i];
      const d = def.exercises[i];
      if (!d) continue;
      let vol = 0;
      for (const s of log.sets) vol += s.weight * s.reps;
      if (vol <= 0) continue;
      for (const m of d.primary) map.set(m, (map.get(m) ?? 0) + vol);
      for (const m of d.secondary) map.set(m, (map.get(m) ?? 0) + vol * 0.5);
    }
    const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = arr[0]?.[1] ?? 1;
    return arr.map(([m, v]) => ({ m, pct: Math.max(8, Math.round((v / max) * 100)) }));
  }, [workout, def]);

  async function handleShare() {
    if (!workout || !def) return;
    setSharing(true);
    try {
      const started = new Date(workout.startedAt);
      const sessionType = def.name.toLowerCase().includes("push")
        ? "push"
        : def.name.toLowerCase().includes("pull")
        ? "pull"
        : def.name.toLowerCase().includes("kaki") || def.name.toLowerCase().includes("leg")
        ? "legs"
        : "other";
      const dateLine =
        started
          .toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
          .toUpperCase() + " · HANGZHOU";
      const blob = await renderWorkoutCard({
        sessionName: def.name,
        sessionType,
        isPR: prs.length > 0,
        prCount: prs.length,
        volumeKg: Math.round(volume),
        durationMin: workout.durationMin ?? 0,
        exerciseCount: def.exercises.length,
        week: weekNumber(started),
        dateLine,
      });
      await shareBlob(blob, `r2fit-${def.name.replace(/\s+/g, "-").toLowerCase()}.png`, `${def.name} done.`);
    } finally {
      setSharing(false);
    }
  }

  if (!loaded)
    return <main style={{ maxWidth: 460, margin: "0 auto", minHeight: "100dvh", background: "#050406" }} />;
  if (!workout || !def) {
    return (
      <main style={{ maxWidth: 460, margin: "0 auto", minHeight: "100dvh", background: "#050406", padding: 20, fontFamily: SANS }}>
        <Link href="/workout" className="mono" style={{ fontSize: 11, letterSpacing: "2px", color: "#7c736e", textDecoration: "none" }}>
          ✕ TUTUP
        </Link>
        <div style={{ fontWeight: 700, fontSize: 26, color: "#f1ede9", marginTop: 20 }}>SESI TIDAK DITEMUKAN</div>
      </main>
    );
  }

  const started = new Date(workout.startedAt);
  const dateLabel = started
    .toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <main
      style={{
        maxWidth: 460,
        margin: "0 auto",
        minHeight: "100dvh",
        fontFamily: SANS,
        position: "relative",
        background: "radial-gradient(900px 620px at 50% -4%,#221210,#0a0708 46%,#050406 100%)",
      }}
    >
      {/* Confetti */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
        {CONFETTI.map((c, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: c.left,
              top: 0,
              width: c.w,
              height: c.h,
              borderRadius: 2,
              background: c.color,
              animation: `wo-conf ${c.dur}s ease-in ${c.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <div style={{ position: "relative", zIndex: 2, padding: "calc(18px + env(safe-area-inset-top)) 22px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Link href="/workout" className="mono" style={{ fontSize: 11, letterSpacing: "2px", color: "#7c736e", textDecoration: "none" }}>
            ✕ TUTUP
          </Link>
          <div className="mono" style={{ fontSize: 10, letterSpacing: "1.5px", color: "#7c736e" }}>{dateLabel}</div>
        </div>

        {/* Hero */}
        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <div
            style={{
              margin: "0 auto",
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: "linear-gradient(180deg,#4ade80,#22c55e 60%,#16a34a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              color: "#062611",
              boxShadow: "0 14px 44px rgba(34,197,94,.5)",
              animation: "wo-badgepop .6s cubic-bezier(.34,1.56,.64,1) both",
            }}
          >
            ✓
          </div>
          <div className="mono rise-1" style={{ fontSize: 10, letterSpacing: "2px", color: "#22c55e", marginTop: 16 }}>
            SESI SELESAI
          </div>
          <div className="rise-1" style={{ fontSize: 38, fontWeight: 800, letterSpacing: ".5px", lineHeight: 1, marginTop: 6, ...FIRE_TEXT }}>
            {def.name}
          </div>
          <div className="mono rise-1" style={{ fontSize: 11, letterSpacing: "1px", color: "#8a837d", marginTop: 8 }}>
            {def.focus} · MINGGU {weekNumber(started)} / 12
          </div>
        </div>

        {/* Stat grid */}
        <div className="rise-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 24 }}>
          <StatCard num={String(workout.durationMin ?? 0)} unit=" mnt" label="DURASI" />
          <StatCard num={volume.toLocaleString("id-ID")} unit=" kg" label="TOTAL VOLUME" numColor="#ff8a72" />
          <StatCard num={String(setsLogged)} label="SET SELESAI" />
          <div style={{ background: "linear-gradient(180deg,rgba(238,60,48,.14),rgba(238,60,48,.03))", border: "1px solid rgba(255,150,120,.3)", borderRadius: 16, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: "#ff8a3d", lineHeight: 1 }}>{prs.length} 🔥</div>
            <div className="mono" style={{ fontSize: 8.5, letterSpacing: "2px", color: "#ffb99e", marginTop: 7 }}>REKOR BARU</div>
          </div>
        </div>

        {/* PR chips */}
        {prs.length > 0 && (
          <>
            <div className="mono rise-3" style={{ fontSize: 10, letterSpacing: "2px", color: "#7c736e", margin: "26px 0 10px" }}>
              🔥 REKOR PRIBADI BARU
            </div>
            <div className="rise-3" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {prs.map((p) => (
                <div
                  key={p.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 15px",
                    borderRadius: 14,
                    background: "linear-gradient(90deg,rgba(238,60,48,.1),transparent)",
                    border: "1px solid rgba(255,150,120,.28)",
                  }}
                >
                  <span style={{ fontSize: 20 }}>🏆</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "#f1ede9" }}>{p.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: "#ff8a72", fontWeight: 600 }}>{p.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Muscles trained */}
        {muscleBars.length > 0 && (
          <>
            <div className="mono rise-4" style={{ fontSize: 10, letterSpacing: "2px", color: "#7c736e", margin: "26px 0 12px" }}>
              OTOT YANG DILATIH
            </div>
            <div className="rise-4" style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {muscleBars.map((b, i) => (
                <div key={b.m} style={{ display: "grid", gridTemplateColumns: "84px 1fr", alignItems: "center", gap: 10 }}>
                  <span className="mono" style={{ fontSize: 9, letterSpacing: "1px", color: "#cfc8c2" }}>{MLABEL[b.m]}</span>
                  <div style={{ height: 9, background: "#161011", borderRadius: 5, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${b.pct}%`,
                        borderRadius: 5,
                        background: "linear-gradient(90deg,#ff8a3d,#ee2f1f)",
                        animation: `wo-grow 1s cubic-bezier(.22,.61,.36,1) ${0.35 + i * 0.1}s both`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Actions */}
        <button
          type="button"
          className="rise-5 tap-press"
          onClick={handleShare}
          disabled={sharing}
          style={{
            marginTop: 28,
            width: "100%",
            border: "1px solid rgba(255,150,120,.6)",
            borderRadius: 18,
            padding: 18,
            color: "#fff",
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: "1.5px",
            background: FIRE,
            textShadow: "0 1px 2px rgba(120,15,5,.5)",
            boxShadow: "inset 0 1.5px 1px rgba(255,225,205,.7),0 12px 30px rgba(238,60,48,.5)",
            cursor: "pointer",
            opacity: sharing ? 0.7 : 1,
          }}
        >
          {sharing ? "MEMBUAT…" : "📸 BAGIKAN PROGRES"}
        </button>
        <Link
          href="/workout"
          className="rise-5 mono tap-press"
          style={{
            display: "block",
            textAlign: "center",
            marginTop: 11,
            width: "100%",
            background: "#0e0c0d",
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 16,
            padding: 16,
            color: "#cfc8c2",
            fontSize: 12,
            letterSpacing: "2px",
            textDecoration: "none",
          }}
        >
          SELESAI
        </Link>
      </div>
    </main>
  );
}

function StatCard({
  num,
  unit,
  label,
  numColor = "#f1ede9",
}: {
  num: string;
  unit?: string;
  label: string;
  numColor?: string;
}) {
  return (
    <div style={{ background: "#0c0a0b", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 16, textAlign: "center" }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: numColor, lineHeight: 1 }}>
        {num}
        {unit && <span style={{ fontSize: 14, color: "#8a837d", fontWeight: 600 }}>{unit}</span>}
      </div>
      <div className="mono" style={{ fontSize: 8.5, letterSpacing: "2px", color: "#7c736e", marginTop: 7 }}>{label}</div>
    </div>
  );
}
