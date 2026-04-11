"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useActiveDate, parseDate } from "@/lib/activeDate";
import {
  getAllWorkouts,
  getSession,
  recommendedSessionFor,
  weekNumber,
  workoutVolume,
  type SessionType,
  type WorkoutSession,
} from "@/lib/workouts";
import { renderWeeklyCard, shareBlob } from "@/lib/shareCards";

const SESSION_ACCENT: Record<SessionType, string> = {
  PUSH_A: "#e8ff47",
  PUSH_B: "#e8ff47",
  PULL_A: "#47ffb8",
  PULL_B: "#47ffb8",
  LEGS: "#ff6b35",
};

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

function fmtDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dayLabelFromDate(date: string): string {
  const d = parseDate(date);
  const dow = d.getDay();
  return DAY_LABELS[dow === 0 ? 6 : dow - 1];
}

function sessionBestLift(w: WorkoutSession): { name: string; weight: number; reps: number } | null {
  let best: { name: string; weight: number; reps: number; vol: number } | null = null;
  for (const ex of w.exercises) {
    for (const s of ex.sets) {
      const vol = s.weight * s.reps;
      if (!best || vol > best.vol) {
        best = { name: ex.exerciseName, weight: s.weight, reps: s.reps, vol };
      }
    }
  }
  return best ? { name: best.name, weight: best.weight, reps: best.reps } : null;
}

function isPR(w: WorkoutSession, exercise: string, set: { weight: number; reps: number }, prior: WorkoutSession[]): boolean {
  const priorVol = prior
    .filter((p) => p.sessionType === w.sessionType && p.id !== w.id)
    .flatMap((p) => p.exercises.filter((e) => e.exerciseName === exercise).flatMap((e) => e.sets))
    .reduce<number>((max, s) => Math.max(max, s.weight * s.reps), 0);
  return set.weight * set.reps > priorVol && priorVol > 0;
}

export default function GymPage() {
  const { activeDate } = useActiveDate();
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    document.body.classList.add("no-scroll");
    setWorkouts(getAllWorkouts());
    return () => document.body.classList.remove("no-scroll");
  }, []);

  const wk = activeDate ? weekNumber(parseDate(activeDate)) : 1;
  const now = activeDate ? parseDate(activeDate) : new Date();
  const mon = mondayOf(now);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  }, [mon]);

  const weekSessions = useMemo(
    () =>
      workouts
        .filter((w) => {
          const d = parseDate(w.date);
          return d >= mon && d <= weekDays[6] && w.completed;
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    [workouts, mon, weekDays]
  );

  const sessionByDate = useMemo(() => {
    const map = new Map<string, WorkoutSession>();
    for (const w of weekSessions) map.set(w.date, w);
    return map;
  }, [weekSessions]);

  const todayStr = fmtDateStr(now);
  const nextSessionType: SessionType = recommendedSessionFor(now);
  const nextSession = getSession(nextSessionType);

  const totalVolume = weekSessions.reduce((a, w) => a + workoutVolume(w), 0);
  const maxVolume = weekSessions.reduce((a, w) => Math.max(a, workoutVolume(w)), 0);

  const bestLift = useMemo(() => {
    let best: { name: string; weight: number; reps: number } | null = null;
    let bestVol = 0;
    for (const w of weekSessions) {
      const b = sessionBestLift(w);
      if (b && b.weight * b.reps > bestVol) {
        bestVol = b.weight * b.reps;
        best = b;
      }
    }
    return best;
  }, [weekSessions]);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const startStr = fmtDateStr(mon);
      const endStr = fmtDateStr(weekDays[6]);
      const blob = await renderWeeklyCard({
        week: wk,
        sessionsDone: weekSessions.length,
        sessionsTarget: 5,
        avgKcal: 0,
        avgProtein: 0,
        bestLiftName: bestLift ? bestLift.name.toUpperCase() : "—",
        bestLiftDetail: bestLift ? `${bestLift.weight}KG × ${bestLift.reps}` : "",
        weeksToGo: Math.max(0, 12 - wk),
        dateRange: `${startStr} → ${endStr}`,
      });
      await shareBlob(blob, `r2fit-week-${wk}.png`, `R2·FIT — Week ${wk}`);
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="sub-page gym-page">
      <header className="sub-head">
        <Link href="/dashboard" className="sub-back">← STATS</Link>
        <div className="sub-title">GYM SESSION</div>
        <div className="sub-sub mono">WK {wk} / 12</div>
      </header>

      <div className="gym-scroll">
        <div className="week-strip">
          {weekDays.map((d, i) => {
            const ds = fmtDateStr(d);
            const session = sessionByDate.get(ds);
            const isToday = ds === todayStr;
            return (
              <div key={i} className={`wd-cell${isToday ? " today" : ""}`}>
                <div className="wd-label mono">{DAY_LABELS[i]}</div>
                <div
                  className={`wd-dot${session ? " filled" : ""}`}
                  style={session ? { background: SESSION_ACCENT[session.sessionType] } : undefined}
                />
              </div>
            );
          })}
        </div>
        <div className="week-summary mono">
          {weekSessions.length} SESSIONS THIS WEEK · {7 - weekSessions.length} REST DAY{7 - weekSessions.length === 1 ? "" : "S"}
        </div>

        {weekSessions.length > 0 && (
          <>
            <div className="gym-group-label mono">// LOGGED</div>
            <div className="session-list">
              {weekSessions.map((w) => {
                const def = getSession(w.sessionType);
                if (!def) return null;
                const vol = Math.round(workoutVolume(w));
                const accent = SESSION_ACCENT[w.sessionType];
                const isExpanded = expanded === w.id;
                const prCount = w.exercises.reduce((count, ex) => {
                  return count + ex.sets.filter((s) => isPR(w, ex.exerciseName, s, workouts)).length;
                }, 0);
                return (
                  <div
                    key={w.id}
                    className={`gym-session-card${isExpanded ? " expanded" : ""}`}
                    style={{ borderLeftColor: accent }}
                  >
                    <button
                      type="button"
                      className="gsc-head"
                      onClick={() => setExpanded(isExpanded ? null : w.id)}
                    >
                      <div className="gsc-head-left">
                        <div className="gsc-day mono">
                          {dayLabelFromDate(w.date)} · {def.name}
                        </div>
                        <div className="gsc-focus mono">{def.focus}</div>
                      </div>
                      <span className="gsc-chev">{isExpanded ? "▴" : "▾"}</span>
                    </button>
                    <div className="gsc-divider" />
                    <div className="gsc-stats">
                      <div>{w.exercises.length} exercises · {w.durationMin ?? 0} min</div>
                      <div className="gsc-vol">{vol.toLocaleString()} KG TOTAL VOLUME</div>
                      {prCount > 0 && (
                        <div className="gsc-pr">{prCount} PERSONAL RECORD{prCount > 1 ? "S" : ""} ↑</div>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="gsc-body">
                        {w.exercises.map((ex) => (
                          <div key={ex.exerciseName} className="gsc-ex">
                            <div className="gsc-ex-name mono">{ex.exerciseName.toUpperCase()}</div>
                            {ex.sets.length === 0 ? (
                              <div className="gsc-ex-empty mono">—</div>
                            ) : (
                              <div className="gsc-sets">
                                {ex.sets.map((s, idx) => {
                                  const pr = isPR(w, ex.exerciseName, s, workouts);
                                  return (
                                    <span key={idx} className={`gsc-set${pr ? " pr" : ""}`}>
                                      SET {idx + 1}: {s.weight}kg×{s.reps}
                                      {pr && <span className="gsc-pr-tag"> ↑ PR</span>}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="share-btn"
              onClick={handleShare}
              disabled={sharing}
            >
              {sharing ? "..." : "SHARE WEEK ↑"}
            </button>
          </>
        )}

        {maxVolume > 0 && (
          <>
            <div className="gym-group-label mono">// WEEKLY VOLUME</div>
            <div className="vol-chart">
              {weekDays.map((d, i) => {
                const ds = fmtDateStr(d);
                const session = sessionByDate.get(ds);
                const vol = session ? workoutVolume(session) : 0;
                const pct = maxVolume > 0 ? (vol / maxVolume) * 100 : 0;
                const color = session ? SESSION_ACCENT[session.sessionType] : "#222";
                return (
                  <div key={i} className="vc-col">
                    <div className="vc-bar-track">
                      <div
                        className="vc-bar-fill"
                        style={{ height: `${pct}%`, background: color }}
                      />
                    </div>
                    <div className="vc-label mono">{DAY_LABELS[i]}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="next-up-card" style={{ borderLeftColor: SESSION_ACCENT[nextSessionType] }}>
          <div className="nu-label mono">NEXT UP</div>
          <div className="nu-name">{nextSession?.name} — {nextSession?.focus}</div>
          <div className="nu-blurb mono">{nextSession?.blurb}</div>
          <Link
            href={`/workout/session/${nextSessionType}`}
            className="next-btn"
            style={{ marginTop: 12, display: "inline-block" }}
          >
            START SESSION →
          </Link>
        </div>
      </div>
    </main>
  );
}
