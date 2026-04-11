"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SESSIONS,
  getSession,
  getWorkout,
  getLastSessionOfType,
  workoutVolume,
  type WorkoutSession,
} from "@/lib/workouts";

export default function SessionComplete({ workoutId }: { workoutId: string }) {
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [prev, setPrev] = useState<WorkoutSession | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  const def = getSession(workout.sessionType);
  const volume = workout.totalVolume ?? workoutVolume(workout);
  const prevVolume = prev ? workoutVolume(prev) : 0;
  const volumeDelta = volume - prevVolume;
  const totalSetsNeeded = def?.exercises.reduce((a, e) => a + e.sets, 0) ?? 0;
  const setsLogged = workout.exercises.reduce((a, e) => a + e.sets.length, 0);

  // Next session hint: pick the next session in SESSIONS order after current type
  const idx = SESSIONS.findIndex((s) => s.id === workout.sessionType);
  const nextSession = SESSIONS[(idx + 1) % SESSIONS.length];

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

        <div className="complete-actions">
          <Link href="/workout" className="next-btn ghost">WORKOUTS</Link>
          <Link href="/" className="next-btn">HOME</Link>
        </div>
      </div>
    </main>
  );
}
