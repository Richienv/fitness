"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSheetBack } from "@/lib/backSheet";
import {
  appendExerciseToWorkout,
  exerciseDefFromEquipment,
  getDefForWorkout,
  getWorkout,
  saveWorkout,
  workoutVolume,
  setActiveWorkoutId,
  getAllWorkouts,
  type ExerciseDef,
  type SetLog,
  type WorkoutSession,
} from "@/lib/workouts";
import {
  MUSCLE_TO_GROUP,
  type MuscleColorGroup,
  type MuscleKey,
} from "@/lib/muscles";
import { lastPerformance } from "@/lib/workoutHistory";
import { EQUIPMENT, searchEquipment, type Equipment } from "@/lib/equipment";
import { getPickRank, recordMachinePick } from "@/lib/machinePicks";
import { inferFromLog } from "@/lib/gymInventory";
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

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

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

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.max(0, s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function beep() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  const [staged, setStaged] = useState<{ w: number; reps: number }>({ w: 0, reps: 0 });
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [detailFor, setDetailFor] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const [restTotal, setRestTotal] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const restBeepedRef = useRef(false);
  const holdTimer = useRef<number | undefined>(undefined);

  useSheetBack(swapFor !== null, () => setSwapFor(null));
  useSheetBack(detailFor !== null, () => setDetailFor(null));
  useSheetBack(addOpen, () => setAddOpen(false));

  useEffect(() => {
    setWorkout(getWorkout(workoutId));
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

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const def = workout ? getDefForWorkout(workout) : null;
  const allDefs = useMemo(() => def?.exercises ?? [], [def]);

  const totals = useMemo(() => {
    if (!workout) return { done: 0, total: 0, volume: 0 };
    let done = 0;
    let total = 0;
    for (let i = 0; i < allDefs.length; i++) {
      const dTotal = allDefs[i].sets;
      total += dTotal;
      done += Math.min(workout.exercises[i]?.sets.length ?? 0, dTotal);
    }
    return { done, total, volume: workoutVolume(workout) };
  }, [workout, allDefs]);

  const allDone = totals.total > 0 && totals.done >= totals.total;

  const focusIdx = useMemo(() => {
    if (!workout) return 0;
    for (let i = 0; i < allDefs.length; i++) {
      if ((workout.exercises[i]?.sets.length ?? 0) < allDefs[i].sets) return i;
    }
    return allDefs.length - 1;
  }, [workout, allDefs]);

  const focusDoneCount = workout?.exercises[focusIdx]?.sets.length ?? 0;

  // Seed the staged weight/reps: carry over the last set of this exercise, else
  // its most recent logged performance, else the target.
  useEffect(() => {
    if (!workout || allDefs.length === 0) return;
    const d = allDefs[focusIdx];
    if (!d) return;
    const log = workout.exercises[focusIdx];
    const last = log?.sets[log.sets.length - 1];
    if (last) {
      setStaged({ w: last.weight, reps: last.reps });
      return;
    }
    const lp = lastPerformance(log?.swappedTo ?? d.name) ?? lastPerformance(d.name);
    setStaged({ w: lp?.weight ?? 0, reps: lp?.reps ?? d.targetReps });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx, focusDoneCount, workout?.id]);

  const progressPct =
    totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
  const restPct = restTotal > 0 ? (restLeft / restTotal) * 100 : 0;

  function adjW(delta: number) {
    const d = allDefs[focusIdx];
    const step = (d?.increment || 1) * (delta > 0 ? 1 : -1);
    setStaged((s) => ({ ...s, w: Math.max(0, Math.round((s.w + step) * 10) / 10) }));
  }
  function adjReps(delta: number) {
    setStaged((s) => ({ ...s, reps: Math.max(0, s.reps + delta) }));
  }

  function startRest(sec: number) {
    restBeepedRef.current = false;
    setRestTotal(sec);
    setRestLeft(sec);
  }

  function logSet() {
    if (!workout || allDefs.length === 0) return;
    const i = focusIdx;
    const d = allDefs[i];
    const setNumber = (workout.exercises[i]?.sets.length ?? 0) + 1;
    const newSet: SetLog = {
      setNumber,
      weight: staged.w,
      reps: staged.reps,
      loggedAt: Date.now(),
    };
    const next: WorkoutSession = {
      ...workout,
      exercises: workout.exercises.map((ex, k) =>
        k === i ? { ...ex, sets: [...ex.sets, newSet] } : ex
      ),
    };
    saveWorkout(next);
    setWorkout(next);
    haptic("tap");

    const nowDone =
      next.exercises.reduce((a, ex, k) => a + Math.min(ex.sets.length, allDefs[k].sets), 0) >=
      totals.total;
    if (!nowDone && d.restSec > 0) startRest(d.restSec);
  }

  function skipRest() {
    setRestLeft(0);
  }
  function addRest(sec: number) {
    setRestLeft((x) => x + sec);
    setRestTotal((x) => x + sec);
  }

  function holdStart(idx: number) {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setSwapFor(idx), 420);
  }
  function holdEnd() {
    window.clearTimeout(holdTimer.current);
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

  function addMachine(e: Equipment) {
    if (!workout) return;
    recordMachinePick(e);
    inferFromLog(e.id);
    const next = appendExerciseToWorkout(workout, exerciseDefFromEquipment(e));
    setWorkout(next);
    setAddOpen(false);
    setSwapFor(null);
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
    maxWidth: 460,
    margin: "0 auto",
    minHeight: "100dvh",
    background: "#050406",
    fontFamily: SANS,
    position: "relative",
  };

  if (!loaded) return <main style={pageStyle} />;
  if (!workout || !def) {
    return (
      <main style={{ ...pageStyle, padding: 20 }}>
        <Link href="/workout" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", color: "#8a837d", textDecoration: "none" }}>
          ← LATIHAN
        </Link>
        <div style={{ fontWeight: 700, fontSize: 26, color: "#f1ede9", marginTop: 20 }}>
          SESI TIDAK DITEMUKAN
        </div>
      </main>
    );
  }

  return (
    <>
      <main style={pageStyle} className="page-rise">
        {/* Sticky header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "rgba(7,6,8,.94)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderBottom: "1px solid rgba(255,255,255,.08)",
            padding: "calc(14px + env(safe-area-inset-top)) 18px 12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <Link href="/workout" className="mono" style={{ fontSize: 11, letterSpacing: "2px", color: "#7c736e", textDecoration: "none" }}>
              ← LATIHAN
            </Link>
            <button
              type="button"
              className="mono tap-press"
              onClick={finishSession}
              style={
                allDone
                  ? {
                      padding: "7px 15px",
                      borderRadius: 999,
                      background: "#22c55e",
                      border: "1px solid #22c55e",
                      color: "#062611",
                      fontSize: 10,
                      letterSpacing: "1.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 0 24px rgba(34,197,94,.45)",
                    }
                  : {
                      padding: "7px 13px",
                      borderRadius: 999,
                      background: "rgba(255,71,71,.1)",
                      border: "1px solid rgba(255,71,71,.45)",
                      color: "#ff8a8a",
                      fontSize: 10,
                      letterSpacing: "1.5px",
                      cursor: "pointer",
                    }
              }
            >
              {allDone ? "SELESAI ✓" : "SELESAI"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "1px", ...FIRE_TEXT }}>
              {def.name}
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "1px", color: "#7c736e" }}>
              {totals.volume.toLocaleString("id-ID")} KG
            </div>
          </div>
          <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, letterSpacing: "1.5px", color: "#8a837d", marginBottom: 6 }}>
            <span>{totals.done} / {totals.total} SET</span>
            <span>{progressPct}%</span>
          </div>
          <div style={{ height: 5, background: "#161011", borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                background: "linear-gradient(90deg,#ff8a3d,#ee2f1f)",
                transition: "width .45s cubic-bezier(.22,.61,.36,1)",
                width: `${progressPct}%`,
              }}
            />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 18px 130px" }}>
          {allDefs.map((d, i) => {
            const log = workout.exercises[i];
            const doneCount = log?.sets.length ?? 0;
            const isComplete = doneCount >= d.sets;
            const isFocus = i === focusIdx && !allDone;
            const isFuture = i > focusIdx;
            const displayName = log?.swappedTo ?? d.name;
            const group = MUSCLE_TO_GROUP[d.primary[0]] ?? "chest";
            const muscleLabel = MUSCLE_LABEL_ID[d.primary[0]] ?? "OTOT";
            const lp = lastPerformance(displayName) ?? lastPerformance(d.name);
            const target = lp ? `${lp.weight}kg × ${lp.reps}` : "BELUM ADA";
            const vol = (log?.sets ?? []).reduce((a, s) => a + s.weight * s.reps, 0);

            const wrapStyle: CSSProperties = {
              marginBottom: 14,
              transition: "opacity .3s ease",
              opacity: isComplete && !isFocus ? 0.5 : isFuture ? 0.72 : 1,
            };
            const cardStyle: CSSProperties = isFocus
              ? {
                  position: "relative",
                  borderRadius: 18,
                  padding: "20px 16px 16px",
                  background: "linear-gradient(180deg,#1e1412,#0c0a0b 72%)",
                  border: "1px solid rgba(255,150,120,.5)",
                  animation: "wo-cardglow 2.6s ease-in-out infinite",
                  cursor: "pointer",
                  WebkitTouchCallout: "none",
                  userSelect: "none",
                }
              : {
                  position: "relative",
                  borderRadius: 16,
                  padding: "16px 16px 14px",
                  background: "#0c0a0b",
                  border: "1px solid rgba(255,255,255,.08)",
                  cursor: "pointer",
                  WebkitTouchCallout: "none",
                  userSelect: "none",
                };

            return (
              <div key={`${d.name}-${i}`} style={wrapStyle}>
                <div style={cardStyle}>
                  {isFocus && (
                    <div
                      style={{
                        position: "absolute",
                        top: -14,
                        left: "50%",
                        transform: "translateX(-50%)",
                        whiteSpace: "nowrap",
                        padding: "7px 18px",
                        background: FIRE,
                        color: "#fff",
                        fontSize: 16,
                        fontWeight: 800,
                        letterSpacing: ".4px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,150,120,.6)",
                        textShadow: "0 1px 2px rgba(120,15,5,.5)",
                        animation: "wo-flamepulse 1.8s ease-in-out infinite",
                      }}
                    >
                      {displayName}
                    </div>
                  )}

                  <div
                    onPointerDown={() => holdStart(i)}
                    onPointerUp={holdEnd}
                    onPointerLeave={holdEnd}
                    onPointerCancel={holdEnd}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, rowGap: 10, flexWrap: "wrap", touchAction: "manipulation" }}
                  >
                    <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                      {!isFocus && (
                        <div style={{ fontSize: 18, fontWeight: 800, color: isComplete ? "#cfc8c2" : "#f1ede9", letterSpacing: ".3px" }}>
                          {isComplete ? "✓ " : ""}{displayName}
                        </div>
                      )}
                      {/* Gold PR medal */}
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          marginTop: isFocus ? 0 : 8,
                          padding: "5px 12px 5px 6px",
                          borderRadius: 999,
                          background: "linear-gradient(180deg,#ffe19a,#f0a53c 48%,#c9721a)",
                          border: "1px solid rgba(255,228,175,.75)",
                          boxShadow: "inset 0 1px 1px rgba(255,247,225,.85),0 5px 14px rgba(200,110,20,.4)",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "rgba(90,45,5,.22)", fontSize: 12 }}>
                          🏆
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                          <span className="mono" style={{ fontSize: 7, letterSpacing: "1.5px", fontWeight: 700, color: "#7a4a12" }}>
                            {lp ? "REKOR · LAMPAUI!" : "REKOR"}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#3d2408", letterSpacing: ".2px", marginTop: 2 }}>
                            {target}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Muscle body-map */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        flex: "none",
                        padding: "6px 12px 6px 7px",
                        borderRadius: 14,
                        background: "linear-gradient(90deg,rgba(255,138,60,.12),rgba(255,138,60,.02))",
                        border: "1px solid rgba(255,150,120,.24)",
                      }}
                    >
                      <MiniBodyMap group={group} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#f1ede9", letterSpacing: ".3px", lineHeight: 1.1 }}>
                          {muscleLabel}
                        </div>
                        <div className="mono" style={{ fontSize: 8, letterSpacing: "1.5px", color: "#a8938a", marginTop: 3 }}>
                          OTOT UTAMA
                        </div>
                      </div>
                    </div>
                  </div>

                  {log?.swappedTo && (
                    <button
                      type="button"
                      onClick={() => clearSwap(i)}
                      className="mono"
                      style={{
                        display: "block",
                        marginTop: 6,
                        fontSize: 9,
                        letterSpacing: "1px",
                        color: "#ffb99e",
                        background: "rgba(238,60,48,.08)",
                        border: "1px solid rgba(238,60,48,.28)",
                        borderRadius: 8,
                        padding: "5px 9px",
                        cursor: "pointer",
                      }}
                    >
                      ↺ DIGANTI DARI {d.name} · ketuk untuk urungkan
                    </button>
                  )}

                  {/* Set dots */}
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    {Array.from({ length: d.sets }).map((_, k) => {
                      let bg = "#201a1b";
                      let shadow = "none";
                      if (k < doneCount) {
                        bg = "linear-gradient(90deg,#ff8a3d,#ee2f1f)";
                      } else if (isFocus && k === doneCount && restLeft <= 0) {
                        bg = "#ff8a3d";
                        shadow = "0 0 10px rgba(255,138,60,.75)";
                      }
                      return (
                        <div
                          key={k}
                          style={{ width: 30, height: 6, borderRadius: 3, background: bg, boxShadow: shadow }}
                        />
                      );
                    })}
                  </div>

                  {/* Focused: rest or logging controls */}
                  {isFocus && restLeft > 0 && (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 14,
                        background: "#0c0a0b",
                        border: "1px solid rgba(255,255,255,.08)",
                        padding: 14,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div className="mono" style={{ fontSize: 30, fontWeight: 800, color: "#ff8a72", letterSpacing: "1px", fontVariantNumeric: "tabular-nums", flex: "none" }}>
                          {fmtTime(restLeft)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="mono" style={{ fontSize: 9, letterSpacing: "2px", color: "#7c736e" }}>ISTIRAHAT</div>
                          <div style={{ height: 5, marginTop: 7, background: "#161011", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", background: "linear-gradient(90deg,#ff8a3d,#ee2f1f)", borderRadius: 3, transition: "width 1s linear", width: `${restPct}%` }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button type="button" className="mono tap-press" onClick={() => addRest(15)} style={restBtn}>+15 DETIK</button>
                        <button type="button" className="mono tap-press" onClick={skipRest} style={restBtn}>LEWATI ISTIRAHAT</button>
                      </div>
                    </div>
                  )}

                  {isFocus && restLeft <= 0 && (
                    <>
                      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                        <StepperPanel label="BEBAN (KG)" value={staged.w} onDown={() => adjW(-1)} onUp={() => adjW(1)} onInput={(v) => setStaged((s) => ({ ...s, w: v }))} decimal />
                        <StepperPanel label="REPS" value={staged.reps} onDown={() => adjReps(-1)} onUp={() => adjReps(1)} onInput={(v) => setStaged((s) => ({ ...s, reps: v }))} />
                      </div>
                      <button
                        type="button"
                        className="tap-press"
                        onClick={logSet}
                        style={{
                          marginTop: 12,
                          width: "100%",
                          border: "1px solid rgba(255,150,120,.6)",
                          borderRadius: 16,
                          padding: 17,
                          color: "#fff",
                          fontSize: 16,
                          fontWeight: 800,
                          letterSpacing: "1.5px",
                          background: FIRE,
                          textShadow: "0 1px 2px rgba(120,15,5,.5)",
                          boxShadow: "inset 0 1.5px 1px rgba(255,225,205,.6),0 12px 30px rgba(238,60,48,.45)",
                          cursor: "pointer",
                        }}
                      >
                        CATAT SET {doneCount + 1} ✓
                      </button>
                      <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                        <button
                          type="button"
                          className="mono tap-press"
                          onClick={() => setSwapFor(i)}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "1px",
                            color: "#ffb99e",
                            background: "rgba(255,138,60,.1)",
                            border: "1px solid rgba(255,150,120,.3)",
                            borderRadius: 999,
                            padding: "8px 12px",
                            cursor: "pointer",
                          }}
                        >
                          👆 TAHAN / GANTI MESIN
                        </button>
                        <button
                          type="button"
                          className="mono tap-press"
                          onClick={() => setDetailFor(i)}
                          style={{
                            flex: "none",
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "1px",
                            color: "#8a837d",
                            background: "rgba(255,255,255,.04)",
                            border: "1px solid rgba(255,255,255,.1)",
                            borderRadius: 999,
                            padding: "8px 12px",
                            cursor: "pointer",
                          }}
                        >
                          ⓘ CARA
                        </button>
                      </div>
                    </>
                  )}

                  {isComplete && !isFocus && (
                    <div className="mono" style={{ fontSize: 10, letterSpacing: "1px", color: "#22c55e", marginTop: 10 }}>
                      ✓ {d.sets} SET{vol > 0 ? ` · ${Math.round(vol).toLocaleString("id-ID")} KG` : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="mono tap-press"
            onClick={() => setAddOpen(true)}
            style={{
              width: "100%",
              marginTop: 4,
              padding: 15,
              borderRadius: 16,
              background: "rgba(238,60,48,.05)",
              border: "1.5px dashed rgba(238,60,48,.4)",
              color: "#ff8a72",
              fontSize: 11,
              letterSpacing: "1.5px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ＋ TAMBAH MESIN BARU
          </button>

          {allDone && (
            <div
              style={{
                animation: "wo-donein .4s ease",
                marginTop: 14,
                borderRadius: 20,
                padding: 24,
                textAlign: "center",
                background: "linear-gradient(180deg,rgba(34,197,94,.12),transparent)",
                border: "1px solid rgba(34,197,94,.35)",
              }}
            >
              <div style={{ fontSize: 32 }}>🎉</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f1ede9", marginTop: 8 }}>Sesi selesai!</div>
              <div className="mono" style={{ fontSize: 11, letterSpacing: "1px", color: "#8a837d", marginTop: 6 }}>
                {totals.volume.toLocaleString("id-ID")} KG · {totals.done} / {totals.total} SET
              </div>
              <button
                type="button"
                className="tap-press"
                onClick={finishSession}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 16,
                  borderRadius: 14,
                  padding: 14,
                  color: "#062611",
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: "1px",
                  background: "linear-gradient(180deg,#4ade80,#22c55e 60%,#16a34a)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                LIHAT RINGKASAN →
              </button>
            </div>
          )}
        </div>
      </main>

      {swapFor !== null && def && (
        <SwapModal
          originalName={workout.exercises[swapFor]?.swappedTo ?? def.exercises[swapFor].name}
          canonicalName={def.exercises[swapFor].name}
          onPick={(altName) => swapExercise(swapFor, altName)}
          onAdd={() => {
            setSwapFor(null);
            setAddOpen(true);
          }}
          onClose={() => setSwapFor(null)}
        />
      )}

      {addOpen && (
        <AddMachineModal onAdd={addMachine} onClose={() => setAddOpen(false)} />
      )}

      {detailFor !== null && def && (
        <DetailSheet
          exerciseName={workout.exercises[detailFor]?.swappedTo ?? def.exercises[detailFor].name}
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

const restBtn: CSSProperties = {
  flex: 1,
  padding: "11px 10px",
  borderRadius: 10,
  background: "#141011",
  border: "1px solid rgba(255,255,255,.1)",
  color: "#cfc8c2",
  fontSize: 10,
  letterSpacing: "1px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

// ── Typeable weight/reps panel ──
function StepperPanel({
  label,
  value,
  onDown,
  onUp,
  onInput,
  decimal,
}: {
  label: string;
  value: number;
  onDown: () => void;
  onUp: () => void;
  onInput: (v: number) => void;
  decimal?: boolean;
}) {
  return (
    <div style={{ flex: 1, background: "#0c0a0b", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "10px 10px 12px" }}>
      <div className="mono" style={{ fontSize: 8.5, letterSpacing: "2px", color: "#7c736e", textAlign: "center", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <button type="button" className="tap-press" onClick={onDown} style={roundBtn}>−</button>
        <input
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return onInput(0);
            const n = decimal ? parseFloat(v) : parseInt(v, 10);
            if (!isNaN(n)) onInput(Math.max(0, n));
          }}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            width: 64,
            minWidth: 0,
            textAlign: "center",
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: "inherit",
            fontSize: 26,
            fontWeight: 800,
            color: "#f1ede9",
            fontVariantNumeric: "tabular-nums",
          }}
        />
        <button type="button" className="tap-press" onClick={onUp} style={roundBtn}>+</button>
      </div>
    </div>
  );
}

const roundBtn: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: "50%",
  background: "#141011",
  border: "1px solid rgba(255,255,255,.1)",
  color: "#ff8a72",
  fontSize: 20,
  cursor: "pointer",
  flex: "none",
};

// ── Compact front-body muscle map (fire-highlighted region) ──
function MiniBodyMap({ group }: { group: MuscleColorGroup }) {
  const on = (g: MuscleColorGroup) => (group === g ? "url(#miniFire)" : "transparent");
  return (
    <svg viewBox="0 0 100 140" width="29" height="41" aria-hidden="true" style={{ flex: "none" }}>
      <defs>
        <linearGradient id="miniFire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb454" />
          <stop offset="1" stopColor="#ee2f1f" />
        </linearGradient>
        <filter id="miniGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g fill="#241b1c" stroke="#3d2e2f" strokeWidth="1" strokeLinejoin="round">
        <ellipse cx="50" cy="14" rx="8" ry="10" />
        <path d="M30 30 Q24 31 22 36 L23 50 L26 64 L30 76 L36 80 L64 80 L70 76 L74 64 L77 50 L78 36 Q76 31 70 30 L62 28 L38 28 Z" />
        <path d="M22 36 Q17 38 16 44 L18 60 L24 64 L26 44 Q26 38 22 36 Z" />
        <path d="M78 36 Q83 38 84 44 L82 60 L76 64 L74 44 Q74 38 78 36 Z" />
        <path d="M36 80 L32 108 L40 120 L48 108 L48 82 Z" />
        <path d="M64 80 L68 108 L60 120 L52 108 L52 82 Z" />
        <path d="M34 118 L32 134 L40 138 L46 134 L46 120 Z" />
        <path d="M66 118 L68 134 L60 138 L54 134 L54 120 Z" />
      </g>
      <g filter="url(#miniGlow)" stroke="none" style={{ animation: "wo-mpulse 1.9s ease-in-out infinite" }}>
        {/* shoulders */}
        <path d="M22 33 L33 32 L31 40 Q25 39 22 37 Z M78 33 L67 32 L69 40 Q75 39 78 37 Z" fill={on("shoulders")} />
        {/* chest */}
        <path d="M32 33 Q41 36 50 36 Q59 36 68 33 L70 44 Q60 50 50 50 Q40 50 30 44 Z" fill={on("chest")} />
        {/* abs */}
        <path d="M44 51 L56 51 L55 77 Q50 79 45 77 Z" fill={on("abs")} />
        {/* back (subtle side aura) */}
        <path d="M23 40 L27 66 L33 78 L37 76 Q31 72 29 62 L26 44 Z M77 40 L73 66 L67 78 L63 76 Q69 72 71 62 L74 44 Z" fill={on("back")} />
        {/* arms */}
        <path d="M18 42 L16 60 L23 63 L25 44 Q22 42 18 42 Z M82 42 L84 60 L77 63 L75 44 Q78 42 82 42 Z" fill={on("arms")} />
        {/* legs */}
        <path d="M36 82 L33 108 L41 120 L48 108 L48 82 Z M64 82 L67 108 L59 120 L52 108 L52 82 Z" fill={on("legs")} />
      </g>
    </svg>
  );
}

// ============================================================
// Swap modal — frosted glass, horizontal alternatives gallery
// ============================================================
function SwapModal({
  originalName,
  canonicalName,
  onPick,
  onAdd,
  onClose,
}: {
  originalName: string;
  canonicalName: string;
  onPick: (altName: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const alts: ExerciseAlternative[] = getAlternatives(canonicalName);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(4,3,5,.74)",
        backdropFilter: "blur(9px)",
        WebkitBackdropFilter: "blur(9px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22,
        animation: "wo-fadein .2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "wo-popin .36s cubic-bezier(.34,1.56,.64,1)",
          width: "100%",
          maxWidth: 400,
          background: "linear-gradient(180deg,rgba(46,34,31,.5),rgba(14,12,13,.38))",
          backdropFilter: "blur(30px) saturate(1.5)",
          WebkitBackdropFilter: "blur(30px) saturate(1.5)",
          border: "1px solid rgba(255,255,255,.18)",
          borderRadius: 26,
          padding: "22px 18px",
          maxHeight: "84%",
          overflowY: "auto",
          boxShadow: "0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.22),0 0 60px rgba(238,60,48,.1)",
        }}
      >
        <div style={{ position: "relative", textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#f1ede9" }}>Ganti {originalName}</div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".5px", color: "#8a837d", marginTop: 5 }}>
            Mesin penuh? Geser &amp; kenali alternatifnya.
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            style={{ position: "absolute", top: -2, right: 0, width: 30, height: 30, borderRadius: "50%", background: "#141011", color: "#8a837d", fontSize: 17, cursor: "pointer", border: "none" }}
          >
            ×
          </button>
        </div>

        {alts.length === 0 ? (
          <div className="mono" style={{ textAlign: "center", fontSize: 11, color: "#8a837d", padding: "12px 0 4px" }}>
            Belum ada alternatif buat gerakan ini.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -18px", padding: "2px 18px 10px" }}>
              {alts.map((a) => (
                <div
                  key={a.name}
                  style={{
                    flex: "none",
                    width: 206,
                    scrollSnapAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    gap: 11,
                    padding: 14,
                    borderRadius: 18,
                    background: "linear-gradient(180deg,rgba(255,255,255,.045),transparent)",
                    border: "1px solid rgba(255,255,255,.1)",
                  }}
                >
                  <SwapDemo name={a.name} />
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#f1ede9", lineHeight: 1.15 }}>{a.name}</div>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: ".3px", color: "#8a837d", lineHeight: 1.55 }}>
                    {a.reason}
                    <br />
                    {a.equipment}
                  </div>
                  <button
                    type="button"
                    className="mono tap-press"
                    onClick={() => onPick(a.name)}
                    style={{
                      marginTop: "auto",
                      width: "100%",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "1px",
                      color: "#fff",
                      background: FIRE,
                      border: "1px solid rgba(255,150,120,.5)",
                      borderRadius: 999,
                      padding: 11,
                      cursor: "pointer",
                    }}
                  >
                    GANTI KE INI
                  </button>
                </div>
              ))}
            </div>
            <div className="mono" style={{ textAlign: "center", fontSize: 8, letterSpacing: "1.5px", color: "#5a524e", marginTop: 6 }}>
              ← GESER LIHAT PILIHAN LAIN →
            </div>
          </>
        )}

        <button
          type="button"
          className="mono tap-press"
          onClick={onAdd}
          style={{
            width: "100%",
            marginTop: 14,
            padding: 14,
            borderRadius: 14,
            background: "rgba(238,60,48,.06)",
            border: "1.5px dashed rgba(238,60,48,.4)",
            color: "#ff8a72",
            fontSize: 11,
            letterSpacing: "1.5px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ＋ TAMBAH MESIN LAIN (JANGAN GANTI)
        </button>
      </div>
    </div>
  );
}

// A real machine demo image (from free-exercise-db) or a labelled placeholder.
function SwapDemo({ name }: { name: string }) {
  const demo = getExerciseDemo(name);
  const [errored, setErrored] = useState(false);
  if (demo && !errored) {
    return (
      <div style={{ width: "100%", height: 128, borderRadius: 13, overflow: "hidden", background: "radial-gradient(circle at 50% 38%,#1c1517,#0b090a)", border: "1px solid rgba(255,150,120,.35)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={demo.frames[0]}
          alt={name}
          loading="lazy"
          onError={() => setErrored(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 128, borderRadius: 13, background: "radial-gradient(circle at 50% 38%,#1c1517,#0b090a)", border: "1px dashed rgba(255,150,120,.35)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, color: "#8a837d" }}>
      <span style={{ fontSize: 38 }}>🏋️</span>
      <span className="mono" style={{ fontSize: 8, letterSpacing: "1.5px" }}>FOTO / ANIMASI MESIN</span>
    </div>
  );
}

// ============================================================
// Add-machine modal — frosted search that appends to the session
// ============================================================
function AddMachineModal({
  onAdd,
  onClose,
}: {
  onAdd: (e: Equipment) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const pickRank = useMemo(() => getPickRank(), []);
  const results = useMemo(
    () => (q ? searchEquipment(query, EQUIPMENT, pickRank).slice(0, 10) : []),
    [query, q, pickRank]
  );
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 210,
        background: "rgba(4,3,5,.74)",
        backdropFilter: "blur(9px)",
        WebkitBackdropFilter: "blur(9px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "calc(60px + env(safe-area-inset-top)) 18px 18px",
        animation: "wo-fadein .2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "wo-popin .34s cubic-bezier(.34,1.56,.64,1)",
          width: "100%",
          maxWidth: 400,
          maxHeight: "80%",
          overflowY: "auto",
          background: "linear-gradient(180deg,rgba(46,34,31,.5),rgba(14,12,13,.42))",
          backdropFilter: "blur(30px) saturate(1.5)",
          WebkitBackdropFilter: "blur(30px) saturate(1.5)",
          border: "1px solid rgba(255,255,255,.18)",
          borderRadius: 26,
          padding: "18px 16px 20px",
          boxShadow: "0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.22),0 0 60px rgba(238,60,48,.1)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: "#f1ede9", textAlign: "center", marginBottom: 12 }}>
          Tambah mesin
        </div>
        <input
          autoFocus
          type="search"
          inputMode="search"
          placeholder="Cari mesin — chest, inner thigh…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mono"
          style={{
            width: "100%",
            background: "rgba(0,0,0,.3)",
            border: "1px solid rgba(255,150,120,.3)",
            borderRadius: 13,
            padding: "13px 14px",
            color: "#f1ede9",
            fontSize: 14,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {results.map((e) => (
            <button
              key={e.id}
              type="button"
              className="tap-press"
              onClick={() => onAdd(e)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                width: "100%",
                cursor: "pointer",
                padding: "12px 14px",
                borderRadius: 13,
                background: "linear-gradient(180deg,rgba(255,255,255,.045),transparent 55%),#0e0c0d",
                border: "1px solid rgba(255,255,255,.1)",
              }}
            >
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "#f1ede9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.name}
                </span>
                <span className="mono" style={{ display: "block", fontSize: 9.5, color: "#8a837d", marginTop: 3 }}>
                  {e.muscleGroup} · {e.category}
                </span>
              </span>
              <span className="mono" style={{ flex: "none", fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "#fff", borderRadius: 999, padding: "6px 12px", background: FIRE, border: "1px solid rgba(255,150,120,.5)" }}>
                ＋ TAMBAH
              </span>
            </button>
          ))}
          {q && results.length === 0 && (
            <div className="mono" style={{ textAlign: "center", fontSize: 11, color: "#8a837d", marginTop: 14 }}>
              Nggak ada yang cocok.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Detail bottom sheet (how-to / history) — reused from prior build
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
  const detail: ExerciseDetail | null =
    getExerciseDetail(exerciseName) ?? getExerciseDetail(canonicalName);

  const history = useMemo(() => {
    const all = getAllWorkouts()
      .filter((w) => w.sessionType === sessionType && w.completed)
      .sort((a, b) => a.startedAt - b.startedAt);
    const bestPerSession: { weight: number; reps: number; date: number }[] = [];
    for (const w of all) {
      const ex = w.exercises.find((e) => e.exerciseName === canonicalName);
      if (!ex || ex.sets.length === 0) continue;
      const best = ex.sets.reduce((a, b) => (b.weight * b.reps > a.weight * a.reps ? b : a));
      bestPerSession.push({ weight: best.weight, reps: best.reps, date: w.startedAt });
    }
    if (bestPerSession.length === 0) return null;
    const latest = bestPerSession[bestPerSession.length - 1];
    return { latest, last3: bestPerSession.slice(-3).reverse() };
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
                      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
                  <div className="detail-row"><span className="dl">Terbaik:</span> — (pertama kali)</div>
                  <div className="detail-row"><span className="dl">Target hari ini:</span> {targetReps} rep</div>
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={demo.frames[0]} alt={`${exerciseName} start`} className={`demo-img${frame === 0 ? " on" : ""}`} loading="lazy" onError={() => setErrored(true)} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={demo.frames[1]} alt={`${exerciseName} end`} className={`demo-img${frame === 1 ? " on" : ""}`} loading="lazy" onError={() => setErrored(true)} />
        </div>
      ) : (
        <div className="demo-fallback mono">
          No demo image for this exercise yet — tap WATCH ON YOUTUBE for a video.
        </div>
      )}
      <a href={ytHref} target="_blank" rel="noopener noreferrer" className="demo-yt-btn mono">
        ▶ WATCH ON YOUTUBE →
      </a>
      {demo && !errored && (
        <div className="demo-credit mono">Animation: free-exercise-db (MIT, two-frame loop)</div>
      )}
    </section>
  );
}
