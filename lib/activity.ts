"use client";
// Activities logged by hand on Latihan: steps, cycling, push-ups and the like.
// Local-first and per user (scopedKey), like the other stores. Nothing here is
// synced to the server yet; Apple Health import would write to this same list.
import { scopedKey } from "./userScope";
import { ACTIVITY_BY_KEY, activityKcal, type ActivityKey, type Intensity } from "./burn";
import { learnWorkoutToGraph } from "./habitGraphStore";

export type ActivityEntry = {
  id: string;
  /** YYYY-MM-DD, China Standard Time (todayKey). */
  date: string;
  kind: ActivityKey;
  steps?: number;
  minutes?: number;
  reps?: number;
  intensity?: Intensity;
  /** When it was logged, epoch ms. */
  at: number;
};

const KEY = "richie.activity.v1";

function readAll(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(scopedKey(KEY)) || "[]");
    return Array.isArray(raw) ? (raw as ActivityEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: ActivityEntry[]): void {
  localStorage.setItem(scopedKey(KEY), JSON.stringify(list));
  window.dispatchEvent(new Event("r2:data"));
}

export function getActivities(date?: string): ActivityEntry[] {
  const all = readAll();
  return (date ? all.filter((a) => a.date === date) : all).sort(
    (a, b) => a.at - b.at,
  );
}

export function getAllActivities(): ActivityEntry[] {
  return readAll();
}

export function addActivity(e: Omit<ActivityEntry, "id" | "at">): ActivityEntry {
  const entry: ActivityEntry = { ...e, id: crypto.randomUUID(), at: Date.now() };
  writeAll([...readAll(), entry]);
  try {
    const def = ACTIVITY_BY_KEY[entry.kind];
    const detail =
      entry.steps ? `${Math.round(entry.steps).toLocaleString("id-ID")} langkah` :
      entry.minutes ? `${Math.round(entry.minutes)} mnt` :
      entry.reps ? `${Math.round(entry.reps)} kali` : "";
    let dayType: "gym" | "rest" = "rest";
    try {
      const raw = window.localStorage.getItem(scopedKey("richie.daily.v1"));
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.[entry.date]?.gymDay !== undefined) {
        dayType = parsed[entry.date].gymDay ? "gym" : "rest";
      } else {
        const [y, m, d] = entry.date.split("-").map(Number);
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        dayType = dow !== 0 && dow !== 3 ? "gym" : "rest";
      }
    } catch {}
    learnWorkoutToGraph({
      eventId: `act:${entry.id}`,
      date: entry.date,
      at: entry.at,
      dayType,
      payload: {
        kind: "activity",
        title: detail ? `${def.label} ${detail}` : def.label,
        activityKind: entry.kind,
        minutes: entry.minutes,
        steps: entry.steps,
        reps: entry.reps,
        intensity: entry.intensity,
        setsCount: 1,
        exercisesCount: 1,
        durationMin: entry.minutes ?? (entry.steps ? Math.max(10, Math.round(entry.steps / 105)) : 10),
        estimatedKcal: Math.round(activityKcal(entry, 70)),
      },
    });
  } catch {
    // non-fatal
  }
  return entry;
}

export function deleteActivity(id: string): void {
  writeAll(readAll().filter((a) => a.id !== id));
}
