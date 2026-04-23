"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SESSIONS,
  getDefForWorkout,
  getWorkout,
  getLastSessionOfType,
  weekNumber,
  workoutVolume,
  type WorkoutSession,
} from "@/lib/workouts";
import { renderWorkoutCard, shareBlob } from "@/lib/shareCards";

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

  if (!loaded) return <main className="shell" />;
  if (!workout) {
    return (
      <main className="shell">
        <Link href="/workout" className="back-link">← Back</Link>
        <h1 className="section-title">SESSION NOT FOUND</h1>
      </main>
    );
  }

  const def = getDefForWorkout(workout);
  const volume = workout.totalVolume ?? workoutVolume(workout);
  const prevVolume = prev ? workoutVolume(prev) : 0;
  const volumeDelta = volume - prevVolume;
  const totalSetsNeeded = def?.exercises.reduce((a, e) => a + e.sets, 0) ?? 0;
  const setsLogged = workout.exercises.reduce((a, e) => a + e.sets.length, 0);

  // Next session hint: pick the next preset session; for CUSTOM, fall back to PUSH_A
  const idx = SESSIONS.findIndex((s) => s.id === workout.sessionType);
  const nextSession = SESSIONS[((idx < 0 ? -1 : idx) + 1 + SESSIONS.length) % SESSIONS.length];

  const prCount = (() => {
    if (!prev || !def) return 0;
    let n = 0;
    for (let i = 0; i < workout.exercises.length; i++) {
      const nowEx = workout.exercises[i];
      const prevEx = prev.exercises.find((e) => e.exerciseName === def.exercises[i].name);
      if (!nowEx || !prevEx || nowEx.sets.length === 0 || prevEx.sets.length === 0) continue;
      const nowBest = nowEx.sets.reduce((a, b) => (b.weight * b.reps > a.weight * a.reps ? b : a));
      const prevBest = prevEx.sets.reduce((a, b) => (b.weight * b.reps > a.weight * a.reps ? b : a));
      if (nowBest.weight * nowBest.reps > prevBest.weight * prevBest.reps) n++;
    }
    return n;
  })();

  async function handleShare() {
    if (!workout || !def) return;
    setSharing(true);
    try {
      const started = new Date(workout.startedAt);
      const sessionType = def.name.toLowerCase().includes("push")
        ? "push"
        : def.name.toLowerCase().includes("pull")
        ? "pull"
        : def.name.toLowerCase().includes("leg")
        ? "legs"
        : "other";
      const dateLine = started
        .toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
        .toUpperCase() + " · HANGZHOU";
      const blob = await renderWorkoutCard({
        sessionName: def.name,
        sessionType,
        isPR: prCount > 0,
        prCount,
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

  return (
    <main className="complete-shell">
      <div className="complete-card">
        <div className="complete-title">SESSION COMPLETE 💪</div>
        <div className="complete-name">{def?.name}</div>
        <div className="complete-focus mono">{def?.focus}</div>

        <div className="complete-stats">
          <div className="cs-block">
            <div className="cs-num">{workout.durationMin ?? 0}</div>
            <div className="cs-label mono">MIN</div>
          </div>
          <div className="cs-block">
            <div className="cs-num">{volume.toLocaleString()}</div>
            <div className="cs-label mono">KG VOLUME</div>
          </div>
          <div className="cs-block">
            <div className="cs-num">{setsLogged}/{totalSetsNeeded}</div>
            <div className="cs-label mono">SETS</div>
          </div>
        </div>

        {prev && (
          <div className={`complete-delta ${volumeDelta >= 0 ? "up" : "down"}`}>
            {volumeDelta >= 0 ? "+" : ""}
            {volumeDelta.toLocaleString()} kg vs last {def?.name}
            {volumeDelta >= 0 ? " ↑" : " ↓"}
          </div>
        )}

        <div className="complete-next">
          <div className="cn-label mono">NEXT SESSION</div>
          <div className="cn-name">{nextSession.name}</div>
          <div className="cn-focus mono">{nextSession.focus}</div>
        </div>

        <button
          type="button"
          className="share-btn"
          onClick={handleShare}
          disabled={sharing}
        >
          {sharing ? "GENERATING…" : "📤 SHARE"}
        </button>

        <div className="complete-actions">
          <Link href="/workout" className="next-btn ghost">WORKOUTS</Link>
          <Link href="/" className="next-btn">HOME</Link>
        </div>
      </div>
    </main>
  );
}
