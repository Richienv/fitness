"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDefForWorkout,
  getWorkout,
  saveWorkout,
  workoutVolume,
  setActiveWorkoutId,
  getLastSetForExercise,
  getAllWorkouts,
  type ExerciseDef,
  type SetLog,
  type WorkoutSession,
} from "@/lib/workouts";
import { muscleColor, type MuscleKey } from "@/lib/muscles";
import {
  getAlternatives,
  getExerciseDemo,
  getExerciseDetail,
  MINDSET_QUOTES,
  youtubeSearchUrl,
  type ExerciseAlternative,
  type ExerciseDetail,
} from "@/lib/exerciseData";
import BodyDiagram from "./BodyDiagram";
import { haptic } from "@/lib/haptics";
import { toast } from "../../../Toast";

// ============================================================
// Style system — copied from app/page.tsx for pixel fidelity
// ============================================================
const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

// Bahasa Indonesia muscle labels (reference MLABEL, extended to all keys).
const MUSCLE_LABEL_ID: Record<MuscleKey, string> = {
  chest: "DADA",
  frontDelt: "DELT DEPAN",
  sideDelt: "DELT SAMPING",
  rearDelt: "DELT BELAKANG",
  tricep: "TRICEP",
  bicep: "BICEP",
  lats: "PUNGGUNG",
  midBack: "PUNGGUNG TENGAH",
  traps: "TRAP",
  quad: "PAHA DEPAN",
  hamstring: "PAHA BELAKANG",
  glute: "GLUTE",
  calf: "BETIS",
  abs: "PERUT",
};

type PendingInput = {
  exerciseIdx: number;
  setNumber: number;
  weight: number;
  reps: number;
};

type Celebration = { main: string; sub: string; big: boolean; key: number };

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.max(0, s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 250);
  } catch {}
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([200, 80, 200]);
    }
  } catch {}
}

export default function SessionLogger({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingInput | null>(null);
  // Key of the set tile to highlight briefly right after logging — e.g.
  // "2:3" = exercise idx 2, set 3. Clears itself after the celebration anim.
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [detailFor, setDetailFor] = useState<number | null>(null);
  const [celeb, setCeleb] = useState<Celebration | null>(null);
  const celebTimer = useRef<number | undefined>(undefined);

  // Rest timer
  const [restTotal, setRestTotal] = useState<number>(0);
  const [restLeft, setRestLeft] = useState<number>(0);
  const restBeepedRef = useRef(false);

  useEffect(() => {
    const w = getWorkout(workoutId);
    setWorkout(w);
    setLoaded(true);
  }, [workoutId]);

  useEffect(() => {
    if (restLeft <= 0) return;
    const t = setInterval(() => {
      setRestLeft((x) => {
        if (x <= 1) {
          if (!restBeepedRef.current) {
            restBeepedRef.current = true;
            beep();
          }
          return 0;
        }
        return x - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [restLeft]);

  useEffect(() => () => window.clearTimeout(celebTimer.current), []);

  const def = workout ? getDefForWorkout(workout) : null;

  const totals = useMemo(() => {
    if (!workout) return { done: 0, total: 0, volume: 0 };
    let done = 0;
    let total = 0;
    for (let i = 0; i < workout.exercises.length; i++) {
      const ex = workout.exercises[i];
      const d = def?.exercises[i];
      const dTotal = d?.sets ?? 0;
      total += dTotal;
      done += Math.min(ex.sets.length, dTotal);
    }
    return { done, total, volume: workoutVolume(workout) };
  }, [workout, def]);

  const firstIncompleteIdx = useMemo(() => {
    if (!workout || !def) return 0;
    for (let i = 0; i < workout.exercises.length; i++) {
      const needed = def.exercises[i].sets;
      if (workout.exercises[i].sets.length < needed) return i;
    }
    return workout.exercises.length - 1;
  }, [workout, def]);

  const sessionProgressPct =
    totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

  const exercisesDone = useMemo(() => {
    if (!workout || !def) return 0;
    let n = 0;
    for (let i = 0; i < workout.exercises.length; i++) {
      if (workout.exercises[i].sets.length >= def.exercises[i].sets) n++;
    }
    return n;
  }, [workout, def]);

  const muscleVolume = useMemo(() => {
    const map = new Map<MuscleKey, number>();
    if (!workout || !def) return map;
    for (let i = 0; i < workout.exercises.length; i++) {
      const log = workout.exercises[i];
      const d = def.exercises[i];
      let vol = 0;
      for (const s of log.sets) vol += s.weight * s.reps;
      if (vol <= 0) continue;
      for (const m of d.primary) map.set(m, (map.get(m) ?? 0) + vol);
      for (const m of d.secondary) map.set(m, (map.get(m) ?? 0) + vol * 0.5);
    }
    return map;
  }, [workout, def]);

  const muscleVolumeList = useMemo(() => {
    const arr = Array.from(muscleVolume.entries()).sort((a, b) => b[1] - a[1]);
    const max = arr[0]?.[1] ?? 1;
    return arr.map(([m, v]) => ({ m, v, pct: Math.round((v / max) * 100) }));
  }, [muscleVolume]);

  const estRemainingMin = useMemo(() => {
    if (!workout || !def) return 0;
    let sec = 0;
    for (let i = 0; i < workout.exercises.length; i++) {
      const d = def.exercises[i];
      const remaining = Math.max(0, d.sets - workout.exercises[i].sets.length);
      sec += remaining * (d.restSec + 30);
    }
    return Math.round(sec / 60);
  }, [workout, def]);

  const openPending = useCallback(
    (exerciseIdx: number, setNumber: number) => {
      if (!workout || !def) return;
      const d = def.exercises[exerciseIdx];
      const existingSets = workout.exercises[exerciseIdx].sets;
      const last = existingSets[existingSets.length - 1];
      let seedWeight = last?.weight ?? 0;
      let seedReps = last?.reps ?? d.targetReps;
      if (!last) {
        const prev = getLastSetForExercise(workout.sessionType, d.name, workout.id);
        if (prev) {
          seedWeight = prev.weight;
          seedReps = prev.reps;
        }
      }
      setPending({ exerciseIdx, setNumber, weight: seedWeight, reps: seedReps });
    },
    [workout, def]
  );

  function adjustWeight(delta: number) {
    if (!pending || !def) return;
    const d = def.exercises[pending.exerciseIdx];
    const step = d.increment * (delta > 0 ? 1 : -1);
    const next = Math.max(0, Math.round((pending.weight + step) * 10) / 10);
    setPending({ ...pending, weight: next });
  }
  function adjustReps(delta: number) {
    if (!pending) return;
    setPending({ ...pending, reps: Math.max(0, pending.reps + delta) });
  }

  function celebrate(main: string, sub: string, big: boolean) {
    setCeleb({ main, sub, big, key: Date.now() });
    window.clearTimeout(celebTimer.current);
    celebTimer.current = window.setTimeout(() => setCeleb(null), 1150);
  }

  function saveSet() {
    if (!pending || !workout || !def) return;
    const next: WorkoutSession = {
      ...workout,
      exercises: workout.exercises.map((ex, i) => {
        if (i !== pending.exerciseIdx) return ex;
        const existing = ex.sets.filter((s) => s.setNumber !== pending.setNumber);
        const newSet: SetLog = {
          setNumber: pending.setNumber,
          weight: pending.weight,
          reps: pending.reps,
          loggedAt: Date.now(),
        };
        return { ...ex, sets: [...existing, newSet].sort((a, b) => a.setNumber - b.setNumber) };
      }),
    };
    saveWorkout(next);
    setWorkout(next);
    const justKey = `${pending.exerciseIdx}:${pending.setNumber}`;
    setJustLogged(justKey);
    haptic("tap");
    // Clear the highlight after the celebration anim completes (~900ms).
    window.setTimeout(() => {
      setJustLogged((cur) => (cur === justKey ? null : cur));
    }, 950);

    // Celebration burst — composes with the real save, purely visual feedback.
    const combo = next.exercises.reduce((a, ex) => a + ex.sets.length, 0);
    const allDone = next.exercises.every(
      (ex, i) => ex.sets.length >= def.exercises[i].sets
    );
    if (allDone) {
      celebrate("SESI SELESAI 🎉", `${combo} SET · SESI TERKUNCI`, true);
    } else if (combo % 5 === 0) {
      celebrate("🔥 LEVEL UP", `COMBO ×${combo} · NGEGAS`, true);
    } else {
      celebrate(
        "SET MASUK ✓",
        `${pending.weight}KG × ${pending.reps} · COMBO ×${combo}`,
        false
      );
    }

    const d = def.exercises[pending.exerciseIdx];
    setPending(null);

    // Start rest timer (skip once everything is done).
    if (d.restSec > 0 && !allDone) {
      restBeepedRef.current = false;
      setRestTotal(d.restSec);
      setRestLeft(d.restSec);
    }
  }

  function skipRest() {
    setRestLeft(0);
  }
  function addRest(sec: number) {
    setRestLeft((x) => x + sec);
    setRestTotal((x) => x + sec);
  }

  function swapExercise(idx: number, altName: string) {
    if (!workout) return;
    const next: WorkoutSession = {
      ...workout,
      exercises: workout.exercises.map((ex, i) =>
        i === idx ? { ...ex, swappedTo: altName } : ex
      ),
    };
    saveWorkout(next);
    setWorkout(next);
    setSwapFor(null);
  }

  function clearSwap(idx: number) {
    if (!workout) return;
    const next: WorkoutSession = {
      ...workout,
      exercises: workout.exercises.map((ex, i) => {
        if (i !== idx) return ex;
        const copy = { ...ex };
        delete copy.swappedTo;
        return copy;
      }),
    };
    saveWorkout(next);
    setWorkout(next);
  }

  function finishSession() {
    if (!workout) return;
    const end = Date.now();
    const durationMin = Math.max(1, Math.round((end - workout.startedAt) / 60000));
    const done: WorkoutSession = {
      ...workout,
      completed: true,
      endedAt: end,
      durationMin,
      totalVolume: workoutVolume(workout),
    };
    saveWorkout(done);
    setActiveWorkoutId(null);
    haptic("success");
    toast("Workout complete ✓", "success");
    router.push(`/workout/session/${workout.id}/complete`);
  }

  const pageStyle: CSSProperties = {
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100dvh",
    padding: "calc(20px + env(safe-area-inset-top)) 18px 22px",
    background:
      "radial-gradient(1100px 700px at 50% -8%, #17100f 0%, #0a0809 42%, #050406 100%)",
    fontFamily: SANS,
  };

  if (!loaded) return <main style={pageStyle} />;
  if (!workout || !def) {
    return (
      <main style={pageStyle}>
        <Link
          href="/workout"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".1em",
            color: "#8a837d",
            textDecoration: "none",
          }}
        >
          ← KEMBALI
        </Link>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 26,
            color: "#f1ede9",
            marginTop: 20,
          }}
        >
          SESI TIDAK DITEMUKAN
        </div>
      </main>
    );
  }

  const pendingDef: ExerciseDef | null = pending ? def.exercises[pending.exerciseIdx] : null;
  const restPct = restTotal > 0 ? (restLeft / restTotal) * 100 : 0;
  const readyToFinish = totals.done >= totals.total;
  const combo = totals.done;

  const finBase: CSSProperties = {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: ".08em",
    lineHeight: 1.25,
    textAlign: "center",
    padding: "8px 14px",
    borderRadius: 12,
    cursor: "pointer",
    position: "relative",
    overflow: "hidden",
  };
  const finishStyle: CSSProperties = readyToFinish
    ? {
        ...finBase,
        color: "#fff",
        background: FIRE,
        border: "1px solid rgba(255,150,120,.65)",
        boxShadow:
          "inset 0 1.5px 1px rgba(255,225,205,.7), inset 0 -4px 8px rgba(150,20,5,.4), 0 8px 18px rgba(238,60,48,.45)",
        textShadow: "0 1px 2px rgba(120,15,5,.5)",
      }
    : {
        ...finBase,
        color: "#ff9a82",
        background: "linear-gradient(180deg,#3a1614,#1b0d0c)",
        border: "1px solid rgba(238,60,48,.42)",
        boxShadow:
          "inset 0 1.5px 0 rgba(255,150,120,.3), inset 0 -4px 8px rgba(0,0,0,.45), 0 6px 14px rgba(0,0,0,.42)",
      };

  return (
    <>
    <main style={pageStyle} className="page-rise">
      <Link
        href="/workout"
        style={{
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: ".1em",
          color: "#8a837d",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 12,
        }}
      >
        ← KEMBALI
      </Link>

      {/* Title */}
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 26,
          color: "#f1ede9",
          letterSpacing: "-.01em",
        }}
      >
        LOG <span style={FIRE_TEXT}>LATIHAN</span>
      </div>

      {/* Session summary card */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          marginTop: 16,
          borderRadius: 18,
          padding: 16,
          background:
            "linear-gradient(180deg,rgba(255,255,255,.03),transparent 24%),#0c0a0b",
          border: "1px solid rgba(255,255,255,.08)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.06),0 18px 40px rgba(0,0,0,.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 22,
                color: "#f5f2ef",
              }}
            >
              {def.name}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: ".14em",
                color: "#ff8a72",
                marginTop: 3,
              }}
            >
              {def.focus}
            </div>
          </div>
          <button type="button" onClick={finishSession} style={finishStyle}>
            <span
              style={{
                position: "absolute",
                top: 0,
                left: "-55%",
                width: "55%",
                height: "100%",
                background:
                  "linear-gradient(105deg,transparent,rgba(255,255,255,.35),transparent)",
                animation: "btnSheen 5.5s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
            <span style={{ position: "relative" }}>
              {readyToFinish
                ? "SELESAI ✓"
                : `SELESAI · ${totals.done}/${totals.total}`}
            </span>
          </button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: ".1em",
            color: "#7c736e",
            marginTop: 14,
          }}
        >
          <span>
            {exercisesDone} / {def.exercises.length} GERAKAN
          </span>
          <span>~{estRemainingMin} MIN LAGI</span>
        </div>

        {/* Session progress bar */}
        <div
          style={{
            position: "relative",
            height: 8,
            borderRadius: 999,
            background: "rgba(255,255,255,.06)",
            overflow: "hidden",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,.6)",
            marginTop: 7,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: `${sessionProgressPct}%`,
              borderRadius: 999,
              overflow: "hidden",
              background: "linear-gradient(90deg,#ff8a3d,#ee2f1f)",
              transition: "width .6s cubic-bezier(.16,1,.3,1)",
              boxShadow: "0 0 10px rgba(238,60,48,.6)",
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
                animation: "barSheen 4.2s ease-in-out infinite",
              }}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".16em",
            color: "#6a6660",
          }}
        >
          HARI INI KAMU LATIH
        </div>

        {/* Muscle-volume bars */}
        <div style={{ marginTop: 9 }}>
          {muscleVolumeList.length === 0 ? (
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#6a6660" }}>
              Belum ada set — mulai ngangkat.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {muscleVolumeList.slice(0, 4).map(({ m, pct }) => {
                const col = muscleColor(m);
                return (
                  <div
                    key={m}
                    style={{ display: "flex", alignItems: "center", gap: 9 }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: ".06em",
                        color: "#8a837d",
                        width: 82,
                        flex: "none",
                      }}
                    >
                      {MUSCLE_LABEL_ID[m]}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 999,
                        background: "rgba(255,255,255,.05)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: 999,
                          background: col,
                          transition: "width .6s cubic-bezier(.16,1,.3,1)",
                          boxShadow: `0 0 8px ${col}88`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Combo pill */}
      {combo > 0 && (
        <div
          style={{
            marginTop: 12,
            textAlign: "center",
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".12em",
            color: "#ff8a72",
            padding: "9px",
            borderRadius: 12,
            background: "rgba(238,60,48,.08)",
            border: "1px solid rgba(238,60,48,.28)",
          }}
        >
          🔥 COMBO ×{combo} · TETAP PANAS
        </div>
      )}

      {/* Exercise cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 14,
        }}
      >
        {def.exercises.map((ex, i) => {
          const log = workout.exercises[i];
          const displayName = log.swappedTo ?? ex.name;
          const last = getLastSetForExercise(workout.sessionType, ex.name, workout.id);
          const isFocus = i === firstIncompleteIdx && !pending;
          const allDone = log.sets.length >= ex.sets;
          const col = muscleColor(ex.primary[0]);

          // Completed exercise → compact collapsed row.
          if (allDone) {
            const totalVol = log.sets.reduce((a, s) => a + s.weight * s.reps, 0);
            const meta = `${log.sets.length}×${ex.repsLabel}${
              totalVol > 0 ? ` · ${Math.round(totalVol)}kg` : ""
            }`;
            return (
              <div
                key={ex.name}
                style={{
                  borderRadius: 16,
                  padding: "13px 15px",
                  background: "#0a0809",
                  border: "1px solid rgba(255,255,255,.06)",
                  opacity: 0.72,
                }}
              >
                <button
                  type="button"
                  onClick={() => setDetailFor(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    width: "100%",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      flex: "none",
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                      color: "#fff",
                      background:
                        "linear-gradient(180deg,#6ff0a4,#22c55e 58%,#15803d)",
                      boxShadow:
                        "inset 0 1px 1px rgba(255,255,255,.5),0 4px 10px rgba(34,197,94,.4)",
                    }}
                  >
                    ✓
                  </span>
                  <span
                    style={{
                      fontFamily: SANS,
                      fontWeight: 700,
                      fontSize: 15,
                      color: "#cfc8c2",
                      flex: 1,
                    }}
                  >
                    {displayName}
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#7c736e",
                    }}
                  >
                    {meta}
                  </span>
                </button>
              </div>
            );
          }

          // Incomplete exercise → full card.
          const cardStyle: CSSProperties = {
            position: "relative",
            overflow: "hidden",
            borderRadius: 18,
            padding: 15,
            background: isFocus
              ? `linear-gradient(180deg, ${col}16, transparent 30%), #0c0a0b`
              : "linear-gradient(180deg,rgba(255,255,255,.03),transparent 26%),#0c0a0b",
            border: isFocus
              ? `1px solid ${col}66`
              : "1px solid rgba(255,255,255,.08)",
            boxShadow: isFocus
              ? `0 0 26px ${col}22, inset 0 1px 0 rgba(255,255,255,.06), 0 14px 34px rgba(0,0,0,.5)`
              : "inset 0 1px 0 rgba(255,255,255,.05), 0 12px 30px rgba(0,0,0,.4)",
          };
          const lastHint = last
            ? `Terakhir ${last.weight}kg×${last.reps}`
            : "Belum ada data";

          return (
            <div key={ex.name} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setDetailFor(i)}
                  aria-label={`Panduan ${displayName}`}
                  style={{
                    width: 42,
                    height: 42,
                    flex: "none",
                    borderRadius: 13,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: SANS,
                    fontWeight: 800,
                    fontSize: 18,
                    color: "#fff",
                    cursor: "pointer",
                    padding: 0,
                    background: col,
                    border: "1px solid rgba(255,255,255,.28)",
                    boxShadow: `inset 0 1.5px 1.5px rgba(255,255,255,.55), inset 0 -5px 9px rgba(0,0,0,.32), 0 6px 15px ${col}55`,
                    textShadow: "0 1px 2px rgba(0,0,0,.4)",
                  }}
                >
                  {displayName.charAt(0)}
                </button>
                <button
                  type="button"
                  onClick={() => setDetailFor(i)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <div
                    style={{
                      fontFamily: SANS,
                      fontWeight: 700,
                      fontSize: 16,
                      color: "#f1ede9",
                      lineHeight: 1.15,
                    }}
                  >
                    {displayName}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 9.5,
                      letterSpacing: ".1em",
                      color: col,
                      marginTop: 3,
                    }}
                  >
                    {MUSCLE_LABEL_ID[ex.primary[0]]}
                  </div>
                </button>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 5,
                  }}
                >
                  {isFocus && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 8.5,
                        letterSpacing: ".1em",
                        color: "#fff",
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: "linear-gradient(180deg,#ff8a52,#ee3c30)",
                        boxShadow: "0 0 10px rgba(238,60,48,.5)",
                        animation: "flamePulse 1.8s ease-in-out infinite",
                      }}
                    >
                      ▶ GAS
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#8a837d",
                    }}
                  >
                    {ex.sets} × {ex.repsLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSwapFor(i)}
                    style={{
                      fontFamily: MONO,
                      fontSize: 8.5,
                      letterSpacing: ".1em",
                      color: "#7c736e",
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid rgba(255,255,255,.1)",
                      borderRadius: 8,
                      padding: "3px 8px",
                      cursor: "pointer",
                    }}
                  >
                    ↔ TUKAR
                  </button>
                </div>
              </div>

              {log.swappedTo && (
                <button
                  type="button"
                  onClick={() => clearSwap(i)}
                  style={{
                    display: "block",
                    marginTop: 10,
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: ".06em",
                    color: "#ff9a82",
                    background: "rgba(238,60,48,.08)",
                    border: "1px solid rgba(238,60,48,.28)",
                    borderRadius: 8,
                    padding: "6px 9px",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  ↔ dari {ex.name} · ketuk untuk urungkan
                </button>
              )}

              {/* Pips + last hint */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 13,
                }}
              >
                <div style={{ flex: 1, display: "flex", gap: 4 }}>
                  {Array.from({ length: ex.sets }).map((_, si) => {
                    const filled = si < log.sets.length;
                    return (
                      <span
                        key={si}
                        style={{
                          flex: 1,
                          height: 5,
                          borderRadius: 999,
                          background: filled ? col : "rgba(255,255,255,.08)",
                          boxShadow: filled ? `0 0 6px ${col}88` : "none",
                          transition: "all .35s",
                        }}
                      />
                    );
                  })}
                </div>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    color: "#6a6660",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lastHint}
                </span>
              </div>

              {/* Set buttons */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(74px,1fr))",
                  gap: 7,
                  marginTop: 12,
                }}
              >
                {Array.from({ length: ex.sets }).map((_, si) => {
                  const setNum = si + 1;
                  const done = log.sets.find((s) => s.setNumber === setNum);
                  const isNext = !done && si === log.sets.length;
                  const isJust = justLogged === `${i}:${setNum}`;

                  let btnStyle: CSSProperties;
                  if (done) {
                    btnStyle = {
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      padding: "11px 6px",
                      borderRadius: 12,
                      cursor: "pointer",
                      alignItems: "center",
                      background: isJust
                        ? "linear-gradient(180deg,#ff8a52,#ee3c30)"
                        : "rgba(238,60,48,.1)",
                      border: isJust
                        ? "1px solid rgba(255,180,150,.8)"
                        : `1px solid ${col}55`,
                      boxShadow: isJust ? "0 0 18px rgba(238,60,48,.7)" : "none",
                      transition: "all .3s",
                    };
                  } else if (isNext) {
                    btnStyle = {
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      padding: "11px 6px",
                      borderRadius: 12,
                      cursor: "pointer",
                      alignItems: "center",
                      background: "rgba(255,138,60,.1)",
                      border: "1px dashed rgba(255,138,60,.6)",
                      boxShadow: "0 0 14px rgba(255,138,60,.15)",
                    };
                  } else {
                    btnStyle = {
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      padding: "11px 6px",
                      borderRadius: 12,
                      cursor: "pointer",
                      alignItems: "center",
                      background: "rgba(255,255,255,.03)",
                      border: "1px solid rgba(255,255,255,.08)",
                    };
                  }

                  const valText = done
                    ? `${done.weight}×${done.reps}`
                    : isNext
                    ? "TAP"
                    : last
                    ? `${last.weight}×${last.reps}`
                    : `${ex.targetReps}`;

                  const valColor = done
                    ? isJust
                      ? "#fff"
                      : "#ffb39e"
                    : isNext
                    ? "#ff8a52"
                    : "#6a6660";

                  return (
                    <button
                      key={si}
                      type="button"
                      onClick={() => openPending(i, setNum)}
                      style={btnStyle}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 8.5,
                          letterSpacing: ".1em",
                          color: "#7c736e",
                        }}
                      >
                        SET {setNum}
                      </span>
                      <span
                        style={{
                          fontFamily: SANS,
                          fontWeight: 700,
                          fontSize: 15,
                          color: valColor,
                        }}
                      >
                        {valText}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </main>

      {/* Rest overlay */}
      {restLeft > 0 && (
        <div
          role="alertdialog"
          aria-label="Rest timer"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 190,
            background: "rgba(5,4,6,.82)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
        >
          <div
            style={{
              width: "76%",
              maxWidth: 340,
              textAlign: "center",
              padding: "28px 22px",
              borderRadius: 24,
              background: "linear-gradient(180deg,#1b1513,#0f0c0b 60%)",
              border: "1px solid rgba(255,150,120,.25)",
              boxShadow:
                "0 30px 70px rgba(0,0,0,.6),0 0 40px rgba(238,60,48,.14)",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: ".2em",
                color: "#ff8a72",
              }}
            >
              ⏱ ISTIRAHAT
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 56,
                color: "#fff",
                letterSpacing: "-.02em",
                margin: "6px 0 14px",
              }}
            >
              {fmtTime(restLeft)}
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: "rgba(255,255,255,.07)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${restPct}%`,
                  borderRadius: 999,
                  background: "linear-gradient(90deg,#ff8a3d,#ee2f1f)",
                  transition: "width 1s linear",
                  boxShadow: "0 0 10px rgba(238,60,48,.6)",
                }}
              />
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: ".06em",
                color: "#8a837d",
                marginTop: 14,
              }}
            >
              Tarik napas. Re-rack. Tetap fokus.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                type="button"
                onClick={skipRest}
                style={{
                  flex: 1,
                  padding: 13,
                  borderRadius: 12,
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: ".08em",
                  color: "#f1ede9",
                  cursor: "pointer",
                  background: "rgba(255,255,255,.05)",
                  border: "1px solid rgba(255,255,255,.12)",
                }}
              >
                SKIP
              </button>
              <button
                type="button"
                onClick={() => addRest(30)}
                style={{
                  flex: 1,
                  padding: 13,
                  borderRadius: 12,
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: ".08em",
                  color: "#ff8a72",
                  cursor: "pointer",
                  background: "rgba(238,60,48,.1)",
                  border: "1px solid rgba(238,60,48,.35)",
                }}
              >
                +30s
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set-entry modal */}
      {pending && pendingDef && (() => {
        const exLog = workout.exercises[pending.exerciseIdx];
        const lastLogged = exLog.sets[exLog.sets.length - 1];
        const hint = lastLogged
          ? `Terakhir set ${exLog.sets.length}: ${lastLogged.weight}kg × ${lastLogged.reps}`
          : "Set pertama — cari beban yang nyisain 1-2 rep";
        return (
          <div
            onClick={() => setPending(null)}
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
                padding:
                  "22px 20px calc(30px + env(safe-area-inset-bottom)) 20px",
                background: "linear-gradient(180deg,#161011,#0c0a0b 60%)",
                borderTop: "1px solid rgba(255,255,255,.1)",
                boxShadow: "0 -20px 50px rgba(0,0,0,.6)",
                animation: "riseIn .28s cubic-bezier(.16,1,.3,1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div
                  style={{
                    fontFamily: SANS,
                    fontWeight: 800,
                    fontSize: 19,
                    color: "#f5f2ef",
                  }}
                >
                  {pendingDef.name}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: ".14em",
                    color: "#ff8a72",
                  }}
                >
                  SET {pending.setNumber}
                </div>
              </div>

              {/* KG stepper */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 20,
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: ".14em",
                    color: "#7c736e",
                  }}
                >
                  KG
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <button
                    type="button"
                    onClick={() => adjustWeight(-1)}
                    style={stepperMinus}
                  >
                    −
                  </button>
                  <span style={stepperValue}>{pending.weight}</span>
                  <button
                    type="button"
                    onClick={() => adjustWeight(1)}
                    style={stepperPlus}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* REPS stepper */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 16,
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: ".14em",
                    color: "#7c736e",
                  }}
                >
                  REPS
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <button
                    type="button"
                    onClick={() => adjustReps(-1)}
                    style={stepperMinus}
                  >
                    −
                  </button>
                  <span style={stepperValue}>{pending.reps}</span>
                  <button
                    type="button"
                    onClick={() => adjustReps(1)}
                    style={stepperPlus}
                  >
                    +
                  </button>
                </div>
              </div>

              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".08em",
                  color: "#6a6660",
                  marginTop: 16,
                  textAlign: "center",
                }}
              >
                {hint}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setPending(null)}
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
                  onClick={saveSet}
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
                    background: FIRE,
                    border: "1px solid rgba(255,150,120,.6)",
                    boxShadow:
                      "inset 0 1.5px 1px rgba(255,225,205,.7),0 10px 22px rgba(238,60,48,.42)",
                    textShadow: "0 1px 2px rgba(120,15,5,.5)",
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
                        "linear-gradient(105deg,transparent,rgba(255,255,255,.4),transparent)",
                      animation: "btnSheen 5s ease-in-out infinite",
                    }}
                  />
                  SIMPAN ✓
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Celebration burst */}
      {celeb && (
        <div
          key={celeb.key}
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            zIndex: 210,
          }}
        >
          <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
            {Array.from({ length: 12 }).map((_, i) => {
              const ang = (i / 12) * Math.PI * 2;
              const dist = 68 + ((i * 37) % 40);
              return (
                <span
                  key={i}
                  style={
                    {
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: 7,
                      height: 7,
                      marginLeft: -3,
                      marginTop: -3,
                      borderRadius: "50%",
                      background: i % 2 ? "#ffd25a" : "#ff5a3c",
                      boxShadow: "0 0 8px #ff5a3c",
                      ["--tx" as string]: `${Math.cos(ang) * dist}px`,
                      ["--ty" as string]: `${Math.sin(ang) * dist}px`,
                      animation: "sparkOut .85s cubic-bezier(.16,1,.3,1) forwards",
                    } as CSSProperties
                  }
                />
              );
            })}
            <div
              style={{
                position: "relative",
                padding: celeb.big ? "16px 26px" : "12px 20px",
                borderRadius: 16,
                background: FIRE,
                border: "1px solid rgba(255,150,120,.6)",
                boxShadow:
                  "inset 0 1.5px 1px rgba(255,225,205,.7),0 12px 30px rgba(238,60,48,.5)",
                textAlign: "center",
                animation: "celebPop .45s cubic-bezier(.16,1,.3,1)",
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: celeb.big ? 22 : 16,
                  color: "#fff",
                  textShadow: "0 1px 2px rgba(120,15,5,.6)",
                }}
              >
                {celeb.main}
              </div>
              {celeb.sub && (
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "rgba(255,240,235,.92)",
                    letterSpacing: ".08em",
                    marginTop: 4,
                    textTransform: "uppercase",
                  }}
                >
                  {celeb.sub}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {swapFor !== null && def && (
        <SwapSheet
          originalName={def.exercises[swapFor].name}
          onPick={(altName) => swapExercise(swapFor, altName)}
          onClose={() => setSwapFor(null)}
        />
      )}

      {detailFor !== null && def && workout && (
        <DetailSheet
          exerciseName={workout.exercises[detailFor].swappedTo ?? def.exercises[detailFor].name}
          canonicalName={def.exercises[detailFor].name}
          sessionType={workout.sessionType}
          targetReps={def.exercises[detailFor].targetReps}
          increment={def.exercises[detailFor].increment}
          onClose={() => setDetailFor(null)}
        />
      )}
    </>
  );
}

// Shared set-modal stepper button styles.
const stepperMinus: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 14,
  fontSize: 18,
  color: "#f1ede9",
  cursor: "pointer",
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.12)",
};
const stepperPlus: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 14,
  fontSize: 18,
  color: "#fff",
  cursor: "pointer",
  background: FIRE,
  border: "1px solid rgba(255,150,120,.6)",
  boxShadow: "inset 0 1px 1px rgba(255,225,205,.6),0 6px 14px rgba(238,60,48,.4)",
};
const stepperValue: CSSProperties = {
  fontFamily: SANS,
  fontWeight: 800,
  fontSize: 30,
  color: "#fff",
  minWidth: 74,
  textAlign: "center",
};

// ============================================================
// Swap bottom sheet
// ============================================================
function SwapSheet({
  originalName,
  onPick,
  onClose,
}: {
  originalName: string;
  onPick: (altName: string) => void;
  onClose: () => void;
}) {
  const alts: ExerciseAlternative[] = getAlternatives(originalName);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet swap-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className="sheet-title">{originalName.toUpperCase()}</div>
          <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-subtitle mono">ALTERNATIVES · TAP HOW TO PREVIEW · USE TO SWAP</div>
        <div className="swap-list">
          {alts.length === 0 && (
            <div className="swap-empty mono">No alternatives listed for this one yet.</div>
          )}
          {alts.map((a) => {
            const isOpen = previewFor === a.name;
            return (
              <div key={a.name} className={`swap-card-wrap${isOpen ? " open" : ""}`}>
                <div className="swap-card">
                  <button
                    type="button"
                    className="swap-card-main swap-card-main-btn"
                    onClick={() => onPick(a.name)}
                  >
                    <div className="swap-card-name">{a.name}</div>
                    <div className="swap-card-reason">{a.reason}</div>
                    <div className="swap-card-eq mono">{a.equipment}</div>
                  </button>
                  <div className="swap-card-actions">
                    <button
                      type="button"
                      className="swap-card-how mono"
                      onClick={() =>
                        setPreviewFor((cur) => (cur === a.name ? null : a.name))
                      }
                      aria-expanded={isOpen}
                    >
                      {isOpen ? "HIDE" : "▶ HOW"}
                    </button>
                    <button
                      type="button"
                      className="swap-card-use-btn mono"
                      onClick={() => onPick(a.name)}
                    >
                      USE →
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="swap-card-preview">
                    <DemoBlock exerciseName={a.name} canonicalName={a.name} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Detail bottom sheet
// ============================================================
function DetailSheet({
  exerciseName,
  canonicalName,
  sessionType,
  targetReps,
  increment,
  onClose,
}: {
  exerciseName: string;
  canonicalName: string;
  sessionType: WorkoutSession["sessionType"];
  targetReps: number;
  increment: number;
  onClose: () => void;
}) {
  // Prefer detail for the displayed (possibly swapped) exercise,
  // fall back to the canonical one from the program.
  const detail: ExerciseDetail | null =
    getExerciseDetail(exerciseName) ?? getExerciseDetail(canonicalName);

  // History: walk completed sessions of this type, find this canonical exercise
  const history = useMemo(() => {
    const all = getAllWorkouts()
      .filter((w) => w.sessionType === sessionType && w.completed)
      .sort((a, b) => a.startedAt - b.startedAt);
    const bestPerSession: { weight: number; reps: number; date: number }[] = [];
    for (const w of all) {
      const ex = w.exercises.find((e) => e.exerciseName === canonicalName);
      if (!ex || ex.sets.length === 0) continue;
      const best = ex.sets.reduce((a, b) =>
        b.weight * b.reps > a.weight * a.reps ? b : a
      );
      bestPerSession.push({ weight: best.weight, reps: best.reps, date: w.startedAt });
    }
    if (bestPerSession.length === 0) return null;
    const latest = bestPerSession[bestPerSession.length - 1];
    const first = bestPerSession[0];
    const delta = latest.weight - first.weight;
    const last3 = bestPerSession.slice(-3).reverse();
    return {
      sessions: bestPerSession.length,
      latest,
      trendKg: delta,
      last3,
    };
  }, [sessionType, canonicalName]);

  const overloadTip = useMemo(() => {
    if (!history) {
      return `Pertama kali ${exerciseName}. Cari beban yang bikin ${targetReps} rep nyisain 1–2 rep lagi. Itu beban kerjamu.`;
    }
    const { weight, reps } = history.latest;
    if (reps >= targetReps + 2) {
      return `Sesi lalu kamu angkat ${weight}kg × ${reps}. Tambah ${increment}kg hari ini — target ${targetReps} rep di ${weight + increment}kg.`;
    }
    if (reps >= targetReps) {
      return `Sesi lalu kamu angkat ${weight}kg × ${reps}. Target ${weight}kg × ${reps + 1}–${reps + 2} hari ini. Kalau tembus, tambah ${increment}kg sesi depan.`;
    }
    return `Sesi lalu kamu angkat ${weight}kg × ${reps}. Tetap di ${weight}kg dan kejar ${targetReps} rep bersih dulu sebelum nambah beban.`;
  }, [history, exerciseName, targetReps, increment]);

  const mindset = detail?.mindset ?? (detail ? MINDSET_QUOTES[detail.muscleGroup] : null);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className="sheet-title">{exerciseName.toUpperCase()}</div>
          <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        </div>

        {detail ? (
          <div className="detail-scroll">
            <DemoBlock exerciseName={exerciseName} canonicalName={canonicalName} />

            <section className="detail-section">
              <div className="detail-section-head">🎯 OTOT TARGET</div>
              <div className="detail-row"><span className="dl">Utama:</span> {detail.primary}</div>
              <div className="detail-row"><span className="dl">Pendukung:</span> {detail.secondary}</div>
              <div className="detail-row"><span className="dl">Rasain di:</span> {detail.feelIt}</div>
              <BodyDiagram group={detail.muscleGroup} />
            </section>

            <section className="detail-section">
              <div className="detail-section-head">📐 TIPS FORM</div>
              <ul className="detail-list">
                {detail.formTips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </section>

            <section className="detail-section">
              <div className="detail-section-head">❌ KESALAHAN UMUM</div>
              <ul className="detail-list danger">
                {detail.mistakes.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </section>

            {mindset && (
              <section className="detail-section mindset">
                <div className="detail-section-head">🧠 MINDSET</div>
                <blockquote className="detail-quote">&ldquo;{mindset}&rdquo;</blockquote>
              </section>
            )}

            <section className="detail-section">
              <div className="detail-section-head">📊 RIWAYATMU</div>
              {history ? (
                <>
                  <div className="detail-row">
                    <span className="dl">Terbaik:</span> {history.latest.weight}kg × {history.latest.reps} (sesi lalu)
                  </div>
                  <ul className="history-list">
                    {history.last3.map((h, i) => {
                      const d = new Date(h.date);
                      const label = d.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      });
                      return (
                        <li key={i}>
                          <span className="d">{label}</span>
                          <span>{h.weight}kg × {h.reps}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="detail-row" style={{ marginTop: 6 }}>
                    <span className="dl">Target hari ini:</span> {targetReps} rep
                  </div>
                </>
              ) : (
                <>
                  <div className="detail-row">
                    <span className="dl">Terbaik:</span> — (pertama kali)
                  </div>
                  <div className="detail-row">
                    <span className="dl">Target hari ini:</span> {targetReps} rep
                  </div>
                </>
              )}
            </section>

            <section className="detail-section overload">
              <div className="detail-section-head">💡 TIPS PROGRESSIVE OVERLOAD</div>
              <div className="detail-quote">&ldquo;{overloadTip}&rdquo;</div>
            </section>
          </div>
        ) : (
          <div className="detail-scroll">
            <DemoBlock exerciseName={exerciseName} canonicalName={canonicalName} />
            <div className="detail-fallback mono">
              Belum ada catatan teknik buat gerakan ini. Fokus ke tempo terkontrol dan range gerak penuh.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// Two-frame "before / after" exercise demo loop
// ============================================================
function DemoBlock({
  exerciseName,
  canonicalName,
}: {
  exerciseName: string;
  canonicalName: string;
}) {
  const demo = getExerciseDemo(exerciseName) ?? getExerciseDemo(canonicalName);
  const [frame, setFrame] = useState(0);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!demo || errored) return;
    const t = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 900);
    return () => clearInterval(t);
  }, [demo, errored]);

  const ytHref = youtubeSearchUrl(exerciseName);

  return (
    <section className="detail-section detail-demo">
      <div className="detail-section-head">▶ HOW IT LOOKS</div>
      {demo && !errored ? (
        <div className="demo-frame">
          <img
            src={demo.frames[0]}
            alt={`${exerciseName} starting position`}
            className={`demo-img${frame === 0 ? " on" : ""}`}
            loading="lazy"
            onError={() => setErrored(true)}
          />
          <img
            src={demo.frames[1]}
            alt={`${exerciseName} ending position`}
            className={`demo-img${frame === 1 ? " on" : ""}`}
            loading="lazy"
            onError={() => setErrored(true)}
          />
        </div>
      ) : (
        <div className="demo-fallback mono">
          No demo image for this exercise yet — tap WATCH ON YOUTUBE for a video.
        </div>
      )}
      <a
        href={ytHref}
        target="_blank"
        rel="noopener noreferrer"
        className="demo-yt-btn mono"
      >
        ▶ WATCH ON YOUTUBE →
      </a>
      {demo && !errored && (
        <div className="demo-credit mono">
          Animation: free-exercise-db (MIT, two-frame loop)
        </div>
      )}
    </section>
  );
}
