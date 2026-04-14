"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  SESSIONS,
  getAllWorkouts,
  getActiveWorkoutId,
  getWorkout,
  recommendedSessionFor,
  startWorkout,
  weekNumber,
  type SessionType,
  type WorkoutSession,
} from "@/lib/workouts";
import { useActiveDate } from "@/lib/activeDate";
import SessionSilhouette from "./SessionSilhouette";

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export default function WorkoutHome() {
  const router = useRouter();
  const { activeDate, label: dateLabel } = useActiveDate();
  const [now, setNow] = useState<Date | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setNow(new Date());
    setWorkouts(getAllWorkouts());
    setActiveId(getActiveWorkoutId());
  }, []);

  const recommended: SessionType | null = now ? recommendedSessionFor(now) : null;
  const today = activeDate;

  const todaysLogged = useMemo(
    () => workouts.find((w) => w.date === today && w.completed),
    [workouts, today]
  );

  const thisWeekDone = useMemo(() => {
    if (!now) return new Set<SessionType>();
    const monday = mondayOf(now).getTime();
    const set = new Set<SessionType>();
    for (const w of workouts) {
      if (!w.completed) continue;
      if (w.startedAt >= monday) set.add(w.sessionType);
    }
    return set;
  }, [workouts, now]);

  const activeWorkout = useMemo(
    () => (activeId ? getWorkout(activeId) : null),
    [activeId]
  );
  const activeInProgress = activeWorkout && !activeWorkout.completed ? activeWorkout : null;

  const wkNum = now ? weekNumber(now) : 1;
  const dateStr = dateLabel;

  function pick(sessionType: SessionType) {
    if (activeInProgress && activeInProgress.sessionType === sessionType) {
      router.push(`/workout/session/${activeInProgress.id}`);
      return;
    }
    const w = startWorkout(sessionType, today);
    router.push(`/workout/session/${w.id}`);
  }

  return (
    <main className="workout-home">
      <div className="workout-home-top">
        <Link href="/" className="back-link">← Back</Link>
        <h1 className="section-title">LOG <span>WORKOUT</span></h1>
        <div className="wo-date mono">{dateStr} · WK {wkNum} / 12</div>

        <Link href="/workout/equipment" className="wo-equip-link mono">
          🏋️ BROWSE EQUIPMENT · 设备
        </Link>

        {todaysLogged && (
          <div className="wo-logged-banner">
            ✓ SESSION LOGGED TODAY
            <Link href={`/workout/session/${todaysLogged.id}`} className="wo-logged-link">
              VIEW
            </Link>
          </div>
        )}

        {activeInProgress && (
          <Link href={`/workout/session/${activeInProgress.id}`} className="wo-resume">
            ▶ RESUME {SESSIONS.find((s) => s.id === activeInProgress.sessionType)?.name}
          </Link>
        )}
      </div>

      <div className="workout-home-bottom">
        <div className="wo-pick-label">PICK YOUR SESSION</div>
        <div className="wo-session-grid">
          {SESSIONS.map((s, idx) => {
            const isRec = s.id === recommended;
            const done = thisWeekDone.has(s.id);
            const isLast = idx === SESSIONS.length - 1;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(s.id)}
                className={`wo-sc${isRec ? " rec" : ""}${done ? " done" : ""}${isLast ? " wide" : ""}`}
              >
                <div className="wo-sc-top">
                  <div className="wo-sc-name">{s.name}</div>
                  <div className="wo-sc-focus mono">{s.focus}</div>
                </div>
                <div className="wo-sc-silhouette">
                  <SessionSilhouette highlight={s.primaryMuscles} />
                </div>
                <div className="wo-sc-bottom mono">
                  <span>{s.dayLabel}</span>
                  {done && <span className="wo-sc-done">✓ DONE</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
