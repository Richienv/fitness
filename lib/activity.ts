"use client";
// Activities logged by hand on Latihan: steps, cycling, push-ups and the like.
// Local-first and per user (scopedKey), like the other stores. Nothing here is
// synced to the server yet; Apple Health import would write to this same list.
import { scopedKey } from "./userScope";
import { ACTIVITY_BY_KEY, activityKcal, type ActivityKey, type Intensity } from "./burn";
import { learnWorkoutToGraph } from "./habitGraphStore";
import { sendOrQueue } from "./offlineOutbox";
import {
  mapCardioKindToActivityKey,
  MCP_INTENSITY_TO_LOCAL,
  type McpIntensity,
} from "./activityCodec";

export type ActivityEntry = {
  id: string;
  /** YYYY-MM-DD, China Standard Time (todayKey). */
  date: string;
  kind: ActivityKey;
  title?: string;
  steps?: number;
  minutes?: number;
  reps?: number;
  distanceKm?: number;
  caloriesBurned?: number;
  intensity?: Intensity;
  serverSynced?: boolean;
  /** When it was logged, epoch ms. */
  at: number;
};

const KEY = "richie.activity.v1";
const SERVER_ACTIVITY_SIGS_KEY = "richie.server.activitySigs.v1";

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
  const all = readAll();
  const target = all.find((a) => a.id === id);
  writeAll(all.filter((a) => a.id !== id));
  if (typeof window !== "undefined" && (target?.serverSynced || id.startsWith("mcp-act-"))) {
    try {
      const rawSigs = localStorage.getItem(scopedKey(SERVER_ACTIVITY_SIGS_KEY));
      const sigs = rawSigs ? (JSON.parse(rawSigs) as Record<string, string>) : {};
      if (sigs[id]) {
        delete sigs[id];
        localStorage.setItem(scopedKey(SERVER_ACTIVITY_SIGS_KEY), JSON.stringify(sigs));
      }
    } catch {}
    void sendOrQueue({
      url: `/api/social/cardio?id=${encodeURIComponent(id)}`,
      method: "DELETE",
      dedupeKey: `cardio:del:${id}`,
    });
  }
}

export type ServerCardioRow = {
  id: string;
  date?: string;
  kind: string;
  distanceM?: number | null;
  durationSec: number;
  location?: string | null;
  startedAt?: number;
  title?: string;
  intensity?: string;
  caloriesBurned?: number;
};

function cardioRowSig(row: ServerCardioRow): string {
  return JSON.stringify({
    date: row.date ?? "",
    kind: row.kind,
    distanceM: row.distanceM ?? null,
    durationSec: row.durationSec,
    title: row.title ?? row.location ?? null,
    intensity: row.intensity ?? null,
    caloriesBurned: row.caloriesBurned ?? null,
  });
}

/** Sync server CardioSession rows (from OpenBot/MCP or social cardio) into richie.activity.v1. */
export function mergeServerCardioActivities(
  rows: ServerCardioRow[],
  opts?: { fromDate?: string },
): number {
  if (typeof window === "undefined") return 0;
  let all = readAll();
  let sigs: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(scopedKey(SERVER_ACTIVITY_SIGS_KEY));
    if (raw) sigs = JSON.parse(raw) as Record<string, string>;
  } catch {
    sigs = {};
  }

  const serverIds = new Set(rows.map((r) => r.id));
  let changed = 0;
  let sigsDirty = false;

  for (const row of rows) {
    if (!row.date) continue;
    const nextSig = cardioRowSig(row);
    const localIdx = all.findIndex((a) => a.id === row.id);
    const mappedIntensity: Intensity =
      row.intensity && row.intensity in MCP_INTENSITY_TO_LOCAL
        ? MCP_INTENSITY_TO_LOCAL[row.intensity as McpIntensity]
        : "sedang";
    const entry: ActivityEntry = {
      id: row.id,
      date: row.date,
      kind: mapCardioKindToActivityKey(row.kind),
      ...(row.title || row.location ? { title: row.title ?? row.location ?? undefined } : {}),
      minutes: Math.max(1, Math.round((row.durationSec / 60) * 10) / 10),
      ...(typeof row.distanceM === "number" && row.distanceM > 0
        ? { distanceKm: Math.round((row.distanceM / 1000) * 100) / 100 }
        : {}),
      ...(typeof row.caloriesBurned === "number"
        ? { caloriesBurned: Math.round(row.caloriesBurned) }
        : {}),
      intensity: mappedIntensity,
      serverSynced: true,
      at: typeof row.startedAt === "number" ? row.startedAt : Date.now(),
    };

    if (localIdx >= 0) {
      if (sigs[row.id] !== nextSig) {
        all[localIdx] = entry;
        sigs[row.id] = nextSig;
        sigsDirty = true;
        changed++;
      }
      continue;
    }

    all.push(entry);
    sigs[row.id] = nextSig;
    sigsDirty = true;
    changed++;
  }

  if (opts?.fromDate) {
    const kept: ActivityEntry[] = [];
    for (const a of all) {
      if (a.date >= opts.fromDate && sigs[a.id] && !serverIds.has(a.id)) {
        delete sigs[a.id];
        sigsDirty = true;
        changed++;
        continue;
      }
      kept.push(a);
    }
    all = kept;
  }

  if (sigsDirty) {
    try {
      localStorage.setItem(scopedKey(SERVER_ACTIVITY_SIGS_KEY), JSON.stringify(sigs));
    } catch {}
  }
  if (changed > 0) writeAll(all);
  return changed;
}
