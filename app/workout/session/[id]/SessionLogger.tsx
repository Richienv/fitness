"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSession,
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
import {
  getAlternatives,
  getExerciseDetail,
  MINDSET_QUOTES,
  type ExerciseAlternative,
  type ExerciseDetail,
} from "@/lib/exerciseData";
import BodyDiagram from "./BodyDiagram";

type PendingInput = {
  exerciseIdx: number;
  setNumber: number;
  weight: number;
  reps: number;
};

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
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [detailFor, setDetailFor] = useState<number | null>(null);

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

  const def = workout ? getSession(workout.sessionType) : null;

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
    setPending(null);

    // Start rest timer
    const d = def.exercises[pending.exerciseIdx];
    if (d.restSec > 0) {
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
    router.push(`/workout/session/${workout.id}/complete`);
  }

  if (!loaded) return <main className="shell" />;
  if (!workout || !def) {
    return (
      <main className="shell">
        <Link href="/workout" className="back-link">← Back</Link>
        <h1 className="section-title">SESSION NOT FOUND</h1>
      </main>
    );
  }

  const pendingDef: ExerciseDef | null = pending ? def.exercises[pending.exerciseIdx] : null;
  const restPct = restTotal > 0 ? (restLeft / restTotal) * 100 : 0;
  const readyToFinish = totals.done >= totals.total;

  return (
    <main className="session-shell">
      <div className="session-top-sticky">
        <Link href="/workout" className="back-link">← Back</Link>
        <div className="session-head-row">
          <div className="session-head-name">{def.name}</div>
          <div className="session-head-focus mono">{def.focus}</div>
        </div>
        <div className="session-progress-row mono">
          <span>{exercisesDone} / {def.exercises.length} EXERCISES</span>
          <span>~{estRemainingMin} MIN LEFT</span>
        </div>
        <div className="session-progress-bar">
          <div className="session-progress-fill" style={{ width: `${sessionProgressPct}%` }} />
        </div>
      </div>

      <div className="session-body">
        {def.exercises.map((ex, i) => {
          const log = workout.exercises[i];
          const displayName = log.swappedTo ?? ex.name;
          const last = getLastSetForExercise(workout.sessionType, ex.name, workout.id);
          const isFocus = i === firstIncompleteIdx && !pending;
          return (
            <div key={ex.name} className={`ex-card${isFocus ? " focus" : ""}`}>
              <div className="ex-head">
                <div className="ex-name-wrap">
                  <button
                    type="button"
                    className="ex-name ex-name-btn"
                    onClick={() => setDetailFor(i)}
                  >
                    {displayName}
                  </button>
                  <button
                    type="button"
                    className="ex-info-btn"
                    aria-label={`Guide for ${displayName}`}
                    onClick={() => setDetailFor(i)}
                  >
                    i
                  </button>
                </div>
                <div className="ex-head-right">
                  <div className="ex-target mono">{ex.sets} × {ex.repsLabel}</div>
                  <button
                    type="button"
                    className="ex-swap-btn mono"
                    onClick={() => setSwapFor(i)}
                  >
                    SWAP
                  </button>
                </div>
              </div>
              {log.swappedTo && (
                <button
                  type="button"
                  className="ex-swapped-tag mono"
                  onClick={() => clearSwap(i)}
                >
                  ↔ swapped from {ex.name} · tap to undo
                </button>
              )}
              <div className="ex-last mono">
                {last
                  ? `Last: ${last.weight}kg × ${last.reps} · ${last.daysAgo}d ago`
                  : "First time — find your working weight"}
              </div>
              <div className="ex-sets">
                {Array.from({ length: ex.sets }).map((_, si) => {
                  const setNum = si + 1;
                  const done = log.sets.find((s) => s.setNumber === setNum);
                  let deltaClass = "";
                  let deltaLabel = "";
                  if (done && last) {
                    const doneVol = done.weight * done.reps;
                    const lastVol = last.weight * last.reps;
                    if (doneVol > lastVol) { deltaClass = "pr"; deltaLabel = "↑"; }
                    else if (doneVol === lastVol) { deltaClass = "eq"; deltaLabel = "="; }
                    else { deltaClass = "dn"; deltaLabel = "↓"; }
                  }
                  return (
                    <button
                      key={si}
                      type="button"
                      className={`ex-set-btn${done ? " done" : ""} ${deltaClass}`}
                      onClick={() => openPending(i, setNum)}
                    >
                      <span className="ex-set-num">SET {setNum}</span>
                      {done ? (
                        <span className="ex-set-val">
                          {done.weight}×{done.reps} <em>{deltaLabel}</em>
                        </span>
                      ) : (
                        <span className="ex-set-placeholder">—</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          className={`session-finish-btn${readyToFinish ? " ready" : ""}`}
          onClick={finishSession}
        >
          {readyToFinish ? "FINISH SESSION ✓" : `FINISH EARLY (${totals.done}/${totals.total})`}
        </button>
      </div>

      {restLeft > 0 && (
        <div className="rest-bar">
          <div className="rest-bar-row">
            <span className="rest-label mono">⏱ REST</span>
            <span className="rest-time">{fmtTime(restLeft)}</span>
          </div>
          <div className="rest-progress">
            <div className="rest-progress-fill" style={{ width: `${restPct}%` }} />
          </div>
          <div className="rest-actions">
            <button type="button" onClick={skipRest}>SKIP</button>
            <button type="button" onClick={() => addRest(30)}>+30s</button>
          </div>
        </div>
      )}

      {pending && pendingDef && (() => {
        const lastForPending = getLastSetForExercise(
          workout.sessionType,
          pendingDef.name,
          workout.id
        );
        return (
          <div className="set-modal-overlay" onClick={() => setPending(null)}>
            <div className="set-modal" onClick={(e) => e.stopPropagation()}>
              <div className="set-modal-body">
                <div className="set-modal-head">
                  <div className="set-modal-ex">{pendingDef.name}</div>
                  <div className="set-modal-set mono">SET {pending.setNumber}</div>
                </div>
                <div className="set-modal-row">
                  <div className="set-modal-label mono">KG</div>
                  <div className="set-modal-stepper">
                    <button type="button" onClick={() => adjustWeight(-1)}>−{pendingDef.increment}</button>
                    <span className="set-modal-val">{pending.weight}</span>
                    <button type="button" onClick={() => adjustWeight(1)}>+{pendingDef.increment}</button>
                  </div>
                </div>
                <div className="set-modal-row">
                  <div className="set-modal-label mono">REPS</div>
                  <div className="set-modal-stepper">
                    <button type="button" onClick={() => adjustReps(-1)}>−1</button>
                    <span className="set-modal-val">{pending.reps}</span>
                    <button type="button" onClick={() => adjustReps(1)}>+1</button>
                  </div>
                </div>
                <div className="set-modal-last">
                  {lastForPending
                    ? `Last session: ${lastForPending.weight}kg × ${lastForPending.reps}`
                    : "First time — find your working weight"}
                </div>
              </div>
              <div className="set-modal-actions">
                <button type="button" className="next-btn ghost" onClick={() => setPending(null)}>CANCEL</button>
                <button type="button" className="next-btn" onClick={saveSet}>SAVE ✓</button>
              </div>
            </div>
          </div>
        );
      })()}

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
    </main>
  );
}

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
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet swap-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className="sheet-title">{originalName.toUpperCase()}</div>
          <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-subtitle mono">ALTERNATIVES · EQUIPMENT BUSY? PICK A SWAP</div>
        <div className="swap-list">
          {alts.length === 0 && (
            <div className="swap-empty mono">No alternatives listed for this one yet.</div>
          )}
          {alts.map((a) => (
            <button
              key={a.name}
              type="button"
              className="swap-card"
              onClick={() => onPick(a.name)}
            >
              <div className="swap-card-main">
                <div className="swap-card-name">{a.name}</div>
                <div className="swap-card-reason">{a.reason}</div>
                <div className="swap-card-eq mono">{a.equipment}</div>
              </div>
              <div className="swap-card-use mono">USE →</div>
            </button>
          ))}
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
      return `First time doing ${exerciseName}. Find a weight where ${targetReps} reps leaves 1–2 in the tank. That's your working weight.`;
    }
    const { weight, reps } = history.latest;
    if (reps >= targetReps + 2) {
      return `You hit ${weight}kg × ${reps} last session. Add ${increment}kg today — aim for ${targetReps} reps at ${weight + increment}kg.`;
    }
    if (reps >= targetReps) {
      return `You hit ${weight}kg × ${reps} last session. Target ${weight}kg × ${reps + 1}–${reps + 2} today. Hit the top and add ${increment}kg next session.`;
    }
    return `You hit ${weight}kg × ${reps} last session. Stick with ${weight}kg and chase ${targetReps} clean reps today before adding weight.`;
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
            <section className="detail-section">
              <div className="detail-section-head">🎯 MUSCLE FOCUS</div>
              <div className="detail-row"><span className="dl">Primary:</span> {detail.primary}</div>
              <div className="detail-row"><span className="dl">Secondary:</span> {detail.secondary}</div>
              <div className="detail-row"><span className="dl">Feel it:</span> {detail.feelIt}</div>
              <BodyDiagram group={detail.muscleGroup} />
            </section>

            <section className="detail-section">
              <div className="detail-section-head">📐 FORM TIPS</div>
              <ul className="detail-list">
                {detail.formTips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </section>

            <section className="detail-section">
              <div className="detail-section-head">❌ COMMON MISTAKES</div>
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
              <div className="detail-section-head">📊 YOUR HISTORY</div>
              {history ? (
                <>
                  <div className="detail-row">
                    <span className="dl">Best:</span> {history.latest.weight}kg × {history.latest.reps} (last session)
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
                    <span className="dl">Target today:</span> {targetReps} reps
                  </div>
                </>
              ) : (
                <>
                  <div className="detail-row">
                    <span className="dl">Best:</span> — (first time)
                  </div>
                  <div className="detail-row">
                    <span className="dl">Target today:</span> {targetReps} reps
                  </div>
                </>
              )}
            </section>

            <section className="detail-section overload">
              <div className="detail-section-head">💡 PROGRESSIVE OVERLOAD TIP</div>
              <div className="detail-quote">&ldquo;{overloadTip}&rdquo;</div>
            </section>
          </div>
        ) : (
          <div className="detail-fallback mono">
            No coaching notes for this exercise yet. Focus on controlled tempo and full range of motion.
          </div>
        )}
      </div>
    </div>
  );
}
