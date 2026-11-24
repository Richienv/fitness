"use client";
// The set logger: the screen used at the gym, between sets, with one hand.
//
// One exercise is in focus. Its weight and reps are already filled in (from the
// last set, or last time), so logging a set is one tap on the dock at the
// bottom of the screen, where the thumb is. Tapping a logged set edits or
// removes it; "Urungkan" takes back the set you just logged. See
// docs/plans/2026-11-24-latihan-logger.md.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSheetBack } from "@/lib/backSheet";
import {
  appendExerciseToWorkout,
  exerciseDefFromEquipment,
  getAllWorkouts,
  getDefForWorkout,
  getWorkout,
  saveWorkout,
  setActiveWorkoutId,
  workoutVolume,
  type SetLog,
  type WorkoutSession,
} from "@/lib/workouts";
import type { Equipment } from "@/lib/equipment";
import { isRecord, previousPerformance, suggestNext } from "@/lib/exerciseHistory";
import { recordMachinePick } from "@/lib/machinePicks";
import { inferFromLog } from "@/lib/gymInventory";
import { haptic } from "@/lib/haptics";
import { readSnapshot, stashBefore } from "@/lib/motivationData";
import { readBodyKg, sessionTitle, workoutBurn } from "@/lib/burnData";
import { plannedWorkoutKcal } from "@/lib/burn";
import Icon from "../../../ui/Icon";
import ExerciseGuide from "../../ExerciseGuide";
import { AddSheet, FinishSheet, SetEditSheet, Stepper, SwapSheet, fmtNum } from "./LoggerParts";
import "./logger.css";

const fmtKg = (n: number) => Math.round(n).toLocaleString("id-ID");
const fmtClock = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
/** "60 kg × 8", or "8 reps" when no weight is used. */
const fmtSet = (weight: number, reps: number) =>
  weight > 0 ? `${fmtNum(weight)} kg × ${reps}` : `${reps} reps`;

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    window.setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* no audio: the vibration and the screen still tell you */
  }
}

function daysAgoLabel(date: string, today: string): string {
  const d = Math.round(
    (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000,
  );
  if (d <= 0) return "hari ini";
  if (d === 1) return "kemarin";
  return `${d} hari lalu`;
}

export default function SessionLogger({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [staged, setStaged] = useState<{ w: number; reps: number }>({ w: 0, reps: 0 });
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [guideFor, setGuideFor] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editSet, setEditSet] = useState<{ ex: number; idx: number } | null>(null);
  const [finishAsk, setFinishAsk] = useState<"empty" | "early" | null>(null);
  const [lastLogged, setLastLogged] = useState<{
    ex: number;
    setNumber: number;
    record: boolean;
  } | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const [restDone, setRestDone] = useState(false);
  const restBeeped = useRef(false);

  useSheetBack(swapFor !== null, () => setSwapFor(null));
  useSheetBack(guideFor !== null, () => setGuideFor(null));
  useSheetBack(addOpen, () => setAddOpen(false));
  useSheetBack(editSet !== null, () => setEditSet(null));
  useSheetBack(finishAsk !== null, () => setFinishAsk(null));

  useEffect(() => {
    setWorkout(getWorkout(workoutId));
    setLoaded(true);
  }, [workoutId]);

  // Everything done before today's session: "last time" and the record to beat.
  const history = useMemo(() => (loaded ? getAllWorkouts() : []), [loaded]);

  // Rest countdown. Beeps and vibrates once at zero.
  useEffect(() => {
    if (restLeft <= 0) return;
    const t = setInterval(() => {
      setRestLeft((x) => {
        if (x > 1) return x - 1;
        if (!restBeeped.current) {
          restBeeped.current = true;
          beep();
          haptic("success");
          setRestDone(true);
        }
        return 0;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [restLeft]);

  const def = workout ? getDefForWorkout(workout) : null;
  const allDefs = useMemo(() => def?.exercises ?? [], [def]);
  const nameOf = (i: number) => workout?.exercises[i]?.swappedTo ?? allDefs[i]?.name ?? "";

  const totals = useMemo(() => {
    if (!workout) return { done: 0, total: 0, volume: 0 };
    let done = 0;
    let total = 0;
    for (let i = 0; i < allDefs.length; i++) {
      total += allDefs[i].sets;
      done += Math.min(workout.exercises[i]?.sets.length ?? 0, allDefs[i].sets);
    }
    return { done, total, volume: workoutVolume(workout) };
  }, [workout, allDefs]);
  const kcal = useMemo(() => (workout ? workoutBurn(workout).total : 0), [workout]);
  // What the whole plan should burn, so the number on screen has something to
  // grow towards. Exercises added mid-session are part of the plan.
  const plannedKcal = useMemo(
    () => (loaded && allDefs.length ? plannedWorkoutKcal(allDefs, readBodyKg()).total : 0),
    [loaded, allDefs],
  );
  const allDone = totals.total > 0 && totals.done >= totals.total;
  const progressPct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

  // The suggestion is the next unfinished exercise; any row can be picked
  // instead, because the bench you "should" do next is often taken.
  const nextIdx = useMemo(() => {
    if (!workout) return 0;
    for (let i = 0; i < allDefs.length; i++)
      if ((workout.exercises[i]?.sets.length ?? 0) < allDefs[i].sets) return i;
    return Math.max(0, allDefs.length - 1);
  }, [workout, allDefs]);
  const focusIdx =
    pickedIdx !== null && pickedIdx < allDefs.length ? pickedIdx : nextIdx;
  const showFocus = allDefs.length > 0 && (!allDone || pickedIdx !== null);
  const focusDef = allDefs[focusIdx];
  const focusLog = workout?.exercises[focusIdx];
  const focusDone = focusLog?.sets.length ?? 0;

  const prev = useMemo(
    () => (focusDef ? previousPerformance(history, nameOf(focusIdx), workoutId) : null),
    // nameOf reads the swap, which is part of `workout`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, focusIdx, workout, workoutId],
  );
  const suggestion = useMemo(
    () => (focusDef && focusDone === 0 ? suggestNext(prev, focusDef) : null),
    [prev, focusDef, focusDone],
  );

  // Fill the dock: the last set of this exercise today, else last time, else
  // the target reps at no weight.
  useEffect(() => {
    if (!workout || !focusDef) return;
    const last = focusLog?.sets[focusLog.sets.length - 1];
    if (last) setStaged({ w: last.weight, reps: last.reps });
    else setStaged({ w: prev?.weight ?? 0, reps: prev?.reps ?? focusDef.targetReps });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx, focusDone, workout?.id, prev?.weight, prev?.reps]);

  function commit(next: WorkoutSession) {
    saveWorkout(next);
    setWorkout(next);
  }

  function startRest(sec: number) {
    restBeeped.current = false;
    setRestDone(false);
    setRestTotal(sec);
    setRestLeft(sec);
  }
  function stopRest() {
    restBeeped.current = true;
    setRestLeft(0);
    setRestDone(false);
  }

  function logSet() {
    if (!workout || !focusDef) return;
    const i = focusIdx;
    const earlier = workout.exercises[i]?.sets ?? [];
    const setNumber = earlier.length + 1;
    const newSet: SetLog = { setNumber, weight: staged.w, reps: staged.reps, loggedAt: Date.now() };
    // A record must beat last time's best AND every set already logged today.
    let best = prev?.best ?? null;
    for (const s of earlier)
      if (best && (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)))
        best = { weight: s.weight, reps: s.reps };
    const record = isRecord(best, newSet);
    const next: WorkoutSession = {
      ...workout,
      exercises: workout.exercises.map((ex, k) =>
        k === i ? { ...ex, sets: [...ex.sets, newSet] } : ex,
      ),
    };
    commit(next);
    haptic(record ? "success" : "tap");
    setLastLogged({ ex: i, setNumber, record });
    // Crossing the target moves on to the next exercise; extra sets stay put.
    if (setNumber === focusDef.sets && pickedIdx === i) setPickedIdx(null);
    const nowDone =
      next.exercises.reduce(
        (a, ex, k) => a + Math.min(ex.sets.length, allDefs[k]?.sets ?? 0),
        0,
      ) >= totals.total;
    if (!nowDone && focusDef.restSec > 0) startRest(focusDef.restSec);
    else stopRest();
  }

  function undoLast() {
    if (!workout || !lastLogged) return;
    const { ex, setNumber } = lastLogged;
    const log = workout.exercises[ex];
    if (!log || log.sets.length !== setNumber) {
      setLastLogged(null);
      return;
    }
    commit({
      ...workout,
      exercises: workout.exercises.map((e, k) =>
        k === ex ? { ...e, sets: e.sets.slice(0, -1) } : e,
      ),
    });
    haptic("tap");
    setLastLogged(null);
    stopRest();
    setPickedIdx(ex);
  }

  function saveEdit(weight: number, reps: number) {
    if (!workout || !editSet) return;
    commit({
      ...workout,
      exercises: workout.exercises.map((e, k) =>
        k === editSet.ex
          ? { ...e, sets: e.sets.map((s, j) => (j === editSet.idx ? { ...s, weight, reps } : s)) }
          : e,
      ),
    });
    setEditSet(null);
  }
  function deleteSet() {
    if (!workout || !editSet) return;
    commit({
      ...workout,
      exercises: workout.exercises.map((e, k) =>
        k === editSet.ex
          ? {
              ...e,
              sets: e.sets
                .filter((_, j) => j !== editSet.idx)
                .map((s, j) => ({ ...s, setNumber: j + 1 })),
            }
          : e,
      ),
    });
    setEditSet(null);
    setLastLogged(null);
    setPickedIdx(editSet.ex);
  }

  function swapExercise(idx: number, altName: string) {
    if (!workout) return;
    commit({
      ...workout,
      exercises: workout.exercises.map((ex, i) => (i === idx ? { ...ex, swappedTo: altName } : ex)),
    });
    setSwapFor(null);
  }
  function clearSwap(idx: number) {
    if (!workout) return;
    commit({
      ...workout,
      exercises: workout.exercises.map((ex, i) => {
        if (i !== idx) return ex;
        const copy = { ...ex };
        delete copy.swappedTo;
        return copy;
      }),
    });
  }

  function addMachine(e: Equipment) {
    if (!workout) return;
    recordMachinePick(e);
    inferFromLog(e.id);
    const next = appendExerciseToWorkout(workout, exerciseDefFromEquipment(e));
    setWorkout(next);
    setAddOpen(false);
    setSwapFor(null);
    // Jump straight to the new exercise: that is why it was added.
    setPickedIdx(next.exercises.length - 1);
  }

  function finishSession() {
    if (!workout) return;
    const end = Date.now();
    const done: WorkoutSession = {
      ...workout,
      completed: true,
      endedAt: end,
      durationMin: Math.max(1, Math.round((end - workout.startedAt) / 60000)),
      totalVolume: workoutVolume(workout),
    };
    // Records before this session counts, for the summary's celebration. A
    // session finished a second time has nothing new to celebrate, and the
    // snapshot must never stand in the way of saving the workout.
    try {
      if (!getWorkout(workout.id)?.completed) stashBefore(workout.id, readSnapshot());
    } catch {}
    saveWorkout(done);
    setActiveWorkoutId(null);
    haptic("success");
    router.push(`/workout/session/${workout.id}/complete`);
  }
  function requestFinish() {
    if (totals.done === 0) setFinishAsk("empty");
    else if (!allDone) setFinishAsk("early");
    else finishSession();
  }

  if (!loaded) return <main className="lg-page" aria-busy="true" />;
  if (!workout || !def) {
    return (
      <main className="lg-page lg-missing">
        <Link href="/workout" className="lg-back">
          <Icon name="chevron" size={20} />
          Latihan
        </Link>
        <h1 className="lg-title">Sesi tidak ditemukan</h1>
        <p className="lg-meta">Sesi ini mungkin sudah dihapus atau dibuka dari perangkat lain.</p>
        <Link href="/workout" className="primary-button lg-wide">
          Kembali ke Latihan
        </Link>
      </main>
    );
  }

  const rows = allDefs.map((d, i) => {
    const n = workout.exercises[i]?.sets.length ?? 0;
    const vol = (workout.exercises[i]?.sets ?? []).reduce((a, s) => a + s.weight * s.reps, 0);
    return { d, i, n, vol, complete: n >= d.sets };
  });
  const inFocus = (i: number) => showFocus && i === focusIdx;
  const upNext = rows.filter((r) => !r.complete && !inFocus(r.i));
  const finished = rows.filter((r) => r.complete && !inFocus(r.i));
  const today = workout.date;

  return (
    <>
      <main className="lg-page page-rise">
        <header className="lg-head">
          <div className="lg-bar">
            <Link href="/workout" className="lg-back">
              <Icon name="chevron" size={20} />
              Latihan
            </Link>
            <button
              type="button"
              className="lg-finish"
              onClick={requestFinish}
            >
              Selesai
            </button>
          </div>
          <h1 className="lg-title">{sessionTitle(workout)}</h1>
          <p className="lg-meta">
            {totals.done} dari {totals.total} set · {fmtKg(totals.volume)} kg
          </p>
          {plannedKcal > 0 && (
            <p className="lg-burn">
              Terbakar ≈ {fmtKg(kcal)} dari ≈ {fmtKg(Math.max(plannedKcal, kcal))} kkal (perkiraan)
            </p>
          )}
          <div
            className="lg-progress"
            role="progressbar"
            aria-label="Set selesai"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
          >
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </header>

        <div className="lg-body">
          {allDone && pickedIdx === null && (
            <section className="lg-done-card" aria-live="polite">
              <h2>Semua set selesai</h2>
              <p>
                {totals.done} set · {fmtKg(totals.volume)} kg
                {kcal > 0 ? ` · ≈ ${fmtKg(kcal)} kkal aktif` : ""}. Lihat ringkasannya, atau tambah
                latihan lagi.
              </p>
            </section>
          )}

          {showFocus && focusDef && (
            <section className="lg-focus" aria-labelledby="lg-focus-title">
              <div className="lg-focus-top">
                <span className="lg-eyebrow">
                  Sekarang · {focusIdx + 1} dari {allDefs.length}
                </span>
                <span className="lg-focus-actions">
                  <button type="button" className="lg-link" onClick={() => setGuideFor(focusIdx)}>
                    Cara
                  </button>
                  <button type="button" className="lg-link" onClick={() => setSwapFor(focusIdx)}>
                    Ganti
                  </button>
                </span>
              </div>
              <h2 id="lg-focus-title">{nameOf(focusIdx)}</h2>
              {focusLog?.swappedTo && (
                <button type="button" className="lg-link lg-undo-swap" onClick={() => clearSwap(focusIdx)}>
                  Kembalikan {focusDef.name}
                </button>
              )}
              {prev && (
                <details className="lg-last-fold">
                  <summary>Riwayat</summary>
                  <p>
                    Terakhir {fmtSet(prev.weight, prev.reps)} · {daysAgoLabel(prev.date, today)}
                  </p>
                </details>
              )}
              {suggestion && (
                <button
                  type="button"
                  className="lg-suggest"
                  onClick={() => setStaged({ w: suggestion.weight, reps: suggestion.reps })}
                >
                  Coba {fmtSet(suggestion.weight, suggestion.reps)}
                  <small>{suggestion.note}</small>
                </button>
              )}
              <ol className="lg-sets" aria-label="Set tercatat">
                {Array.from({ length: focusDone + 1 }).map((_, k) => {
                  const s = focusLog?.sets[k];
                  if (s)
                    return (
                      <li key={k} className="lg-set-enter">
                        <button
                          type="button"
                          className="lg-set"
                          aria-label={`Ubah set ${k + 1}: ${fmtSet(s.weight, s.reps)}`}
                          onClick={() => setEditSet({ ex: focusIdx, idx: k })}
                        >
                          <small>Set {k + 1}</small>
                          {fmtSet(s.weight, s.reps)}
                        </button>
                      </li>
                    );
                  return (
                    <li key={k} className="lg-set-enter">
                      <span className={`lg-set todo${k === focusDone ? " now" : ""}`}>
                        <small>Set {k + 1}</small>
                        {k === focusDone ? "berikutnya" : "belum"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {upNext.length > 0 && (
            <section className="lg-list" aria-labelledby="lg-next">
              <h3 id="lg-next">Berikutnya</h3>
              <ul className="lg-rows">
                {upNext.map(({ d, i, n }) => (
                  <li key={`${d.name}-${i}`}>
                    <button
                      type="button"
                      className="lg-row"
                      onClick={() => {
                        haptic("tap");
                        setPickedIdx(i);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <span>
                        <strong>{nameOf(i)}</strong>
                        <small>
                          {d.sets} set × {d.repsLabel}
                        </small>
                      </span>
                      <span className="lg-state">{n > 0 ? `${n} dari ${d.sets}` : "Mulai"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {finished.length > 0 && (
            <section className="lg-list" aria-labelledby="lg-fin">
              <h3 id="lg-fin">Selesai</h3>
              <ul className="lg-rows">
                {finished.map(({ d, i, n, vol }) => (
                  <li key={`${d.name}-${i}`}>
                    <button
                      type="button"
                      className="lg-row done"
                      aria-label={`${nameOf(i)}, selesai. Ketuk untuk menambah atau mengubah set`}
                      onClick={() => {
                        setPickedIdx(i);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <span>
                        <strong>{nameOf(i)}</strong>
                        <small>
                          {n} set{vol > 0 ? ` · ${fmtKg(vol)} kg` : ""}
                        </small>
                      </span>
                      <span className="lg-state ok">
                        <Icon name="check" size={18} />
                        Selesai
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button type="button" className="secondary-button lg-wide" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={18} />
            Tambah latihan
          </button>
        </div>
      </main>

      {/* Outside <main>: the page animates a transform, which would pin this to the page. */}
      <div className="lg-dock" role="group" aria-label="Catat set">
        {showFocus && focusDef ? (
          <>
            {restLeft > 0 ? (
              <div className="lg-rest">
                <time aria-label={`Sisa istirahat ${restLeft} detik`}>{fmtClock(restLeft)}</time>
                <div
                  className="lg-progress"
                  role="progressbar"
                  aria-label="Istirahat"
                  aria-valuemin={0}
                  aria-valuemax={restTotal}
                  aria-valuenow={restTotal - restLeft}
                >
                  <span style={{ width: `${restTotal ? (restLeft / restTotal) * 100 : 0}%` }} />
                </div>
                <button
                  type="button"
                  className="lg-chip"
                  onClick={() => {
                    setRestLeft((x) => x + 15);
                    setRestTotal((x) => x + 15);
                  }}
                >
                  +15 dtk
                </button>
                <button type="button" className="lg-chip" onClick={stopRest}>
                  Lewati
                </button>
              </div>
            ) : (
              restDone && (
                <p className="lg-logged" role="status">
                  Istirahat selesai. Siap untuk set berikutnya.
                </p>
              )
            )}
            {lastLogged && (lastLogged.ex === focusIdx || restLeft > 0) && (
              <p className="lg-logged" role="status">
                <span>
                  Set {lastLogged.setNumber} tercatat
                  {lastLogged.record ? " · rekor baru" : ""}
                </span>
                <button type="button" className="lg-link" onClick={undoLast}>
                  Urungkan
                </button>
              </p>
            )}
            <div className="lg-steppers">
              <Stepper
                label="Beban (kg)"
                value={staged.w}
                step={focusDef.increment || 1}
                unit="kg"
                decimal
                onChange={(w) => setStaged((s) => ({ ...s, w }))}
              />
              <Stepper
                label="Reps"
                value={staged.reps}
                step={1}
                onChange={(reps) => setStaged((s) => ({ ...s, reps }))}
              />
            </div>
            <button
              type="button"
              className="primary-button lg-log"
              disabled={staged.reps <= 0}
              onClick={logSet}
            >
              Catat set {focusDone + 1}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="primary-button lg-log" onClick={requestFinish}>
              Selesai dan lihat ringkasan
            </button>
            <button type="button" className="secondary-button lg-wide" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={18} />
              Tambah latihan
            </button>
          </>
        )}
      </div>

      {swapFor !== null && allDefs[swapFor] && (
        <SwapSheet
          canonicalName={allDefs[swapFor].name}
          currentName={nameOf(swapFor)}
          onPick={(name) => swapExercise(swapFor, name)}
          onAddOther={() => {
            setSwapFor(null);
            setAddOpen(true);
          }}
          onClose={() => setSwapFor(null)}
        />
      )}
      {addOpen && <AddSheet onAdd={addMachine} onClose={() => setAddOpen(false)} />}
      {guideFor !== null && allDefs[guideFor] && (
        <ExerciseGuide
          name={nameOf(guideFor)}
          sets={`${allDefs[guideFor].sets} set × ${allDefs[guideFor].repsLabel}`}
          onClose={() => setGuideFor(null)}
        />
      )}
      {editSet &&
        workout.exercises[editSet.ex]?.sets[editSet.idx] &&
        (() => {
          const s = workout.exercises[editSet.ex].sets[editSet.idx];
          return (
            <SetEditSheet
              key={`${editSet.ex}-${editSet.idx}`}
              exerciseName={nameOf(editSet.ex)}
              setNumber={editSet.idx + 1}
              weight={s.weight}
              reps={s.reps}
              increment={allDefs[editSet.ex]?.increment || 1}
              onSave={saveEdit}
              onDelete={deleteSet}
              onClose={() => setEditSet(null)}
            />
          );
        })()}
      {finishAsk && (
        <FinishSheet
          kind={finishAsk}
          done={totals.done}
          total={totals.total}
          onFinish={finishSession}
          onContinue={() => setFinishAsk(null)}
          onLeave={() => router.push("/workout")}
        />
      )}
    </>
  );
}
