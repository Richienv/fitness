"use client";

import { scopedKey } from "./userScope";

export type Measurement = {
  date: string;
  weightKg?: number;
  waistCm?: number;
  hipCm?: number;
  shoulderCm?: number;
  weighedAt?: string;
};

const KEY = "richie.measurements.v1";

function read(): Measurement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(scopedKey(KEY));
    return raw ? (JSON.parse(raw) as Measurement[]) : [];
  } catch {
    return [];
  }
}

function write(list: Measurement[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scopedKey(KEY), JSON.stringify(list));
}

export function getAllMeasurements(): Measurement[] {
  return read().sort((a, b) => a.date.localeCompare(b.date));
}

export function getLatestMeasurement(): Measurement | null {
  const list = getAllMeasurements();
  return list[list.length - 1] ?? null;
}

function postMeasurementRemote(m: Measurement): void {
  if (typeof window === "undefined") return;
  fetch("/api/measurements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(m),
    keepalive: true,
  }).catch(() => {});
}

const SYNCED_MEAS_DATES_KEY = "richie.measurements.syncedDates.v1";

/** Push recent local measurements that have not yet been confirmed on the server. */
export async function pushLocalMeasurementsToDb(days = 14): Promise<{ pushed: number }> {
  if (typeof window === "undefined") return { pushed: 0 };
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const recent = read().filter((m) => m.date >= cutoff);
  if (recent.length === 0) return { pushed: 0 };
  let syncedMap: Record<string, string> = {};
  try {
    syncedMap = JSON.parse(window.localStorage.getItem(scopedKey(SYNCED_MEAS_DATES_KEY)) || "{}");
  } catch {
    syncedMap = {};
  }
  let pushed = 0;
  for (const m of recent) {
    const sig = JSON.stringify([m.weightKg ?? null, m.waistCm ?? null, m.hipCm ?? null, m.shoulderCm ?? null]);
    if (syncedMap[m.date] === sig) continue;
    try {
      const res = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(m),
      });
      if (res.ok) {
        syncedMap[m.date] = sig;
        pushed++;
      }
    } catch {
      /* retry next cycle */
    }
  }
  try {
    window.localStorage.setItem(scopedKey(SYNCED_MEAS_DATES_KEY), JSON.stringify(syncedMap));
  } catch {
    /* ignore */
  }
  return { pushed };
}

export function saveMeasurement(m: Measurement): void {
  const list = read();
  const idx = list.findIndex((x) => x.date === m.date);
  const existing = idx >= 0 ? list[idx] : undefined;
  const stamped: Measurement = { ...m };
  if (typeof stamped.weightKg === "number") {
    stamped.weighedAt = stamped.weighedAt ?? new Date().toISOString();
  } else if (existing?.weighedAt && !stamped.weighedAt) {
    stamped.weighedAt = existing.weighedAt;
  }
  if (idx >= 0) list[idx] = { ...list[idx], ...stamped };
  else list.push(stamped);
  write(list);
  postMeasurementRemote(stamped);
}

export function shoulderWaistRatio(m: Measurement): number | null {
  if (!m.shoulderCm || !m.waistCm) return null;
  return m.shoulderCm / m.waistCm;
}

/** Waist-to-hip ratio — the female body-composition metric (healthy < 0.85). */
export function waistHipRatio(m: Measurement): number | null {
  if (!m.waistCm || !m.hipCm) return null;
  return m.waistCm / m.hipCm;
}

/** 7-day rolling average bodyweight ending at each measurement date. Female
 *  weight-trend charts should always use this (smooths cyclical water). */
export function weightRollingAvg(
  list: Measurement[]
): { date: string; avg: number }[] {
  const withW = list
    .filter((m) => m.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return withW.map((m, i) => {
    const window = withW.slice(Math.max(0, i - 6), i + 1);
    const avg =
      window.reduce((s, x) => s + (x.weightKg as number), 0) / window.length;
    return { date: m.date, avg: Math.round(avg * 10) / 10 };
  });
}

// ---------- Server → local pull sync (Hermes-logged weights) ----------

type ServerMeasurementRow = {
  date: string;
  weightKg?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  shoulderCm?: number | null;
  weighedAt?: string | null;
};

/** Merge server measurements by date — server wins for fields it has. */
export function mergeServerMeasurements(rows: ServerMeasurementRow[]): number {
  if (typeof window === "undefined") return 0;
  const list = read();
  let changed = 0;
  for (const row of rows) {
    const idx = list.findIndex((m) => m.date === row.date);
    const validWeighedAt =
      typeof row.weighedAt === "string" && Number.isFinite(Date.parse(row.weighedAt))
        ? row.weighedAt
        : undefined;
    const patch: Measurement = {
      date: row.date,
      ...(row.weightKg != null ? { weightKg: row.weightKg } : {}),
      ...(row.waistCm != null ? { waistCm: row.waistCm } : {}),
      ...(row.hipCm != null ? { hipCm: row.hipCm } : {}),
      ...(row.shoulderCm != null ? { shoulderCm: row.shoulderCm } : {}),
      ...(validWeighedAt ? { weighedAt: validWeighedAt } : {}),
    };
    if (idx >= 0) {
      const merged = { ...list[idx], ...patch };
      if (JSON.stringify(merged) !== JSON.stringify(list[idx])) {
        list[idx] = merged;
        changed++;
      }
    } else {
      list.push(patch);
      changed++;
    }
  }
  if (changed > 0) write(list);
  return changed;
}
