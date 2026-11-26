"use client";
// Daily water intake (ml) on this device + Neon DailyLog sync via offlineOutbox.
// Used on the Home floating HUD and EnergyBalance to separate biological
// body weight (tanpa air) from scale weight (+ air minum) and hydration badges.
import { scopedKey } from "./userScope";
import { sendOrQueue } from "./offlineOutbox";

const KEY = "r2.water.v1";
const DIRTY_KEY = "r2.water.dirty.v1";
const MAX_WATER_ML = 10_000;

function readMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(scopedKey(KEY)) || "{}");
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[k] = Math.min(MAX_WATER_ML, Math.round(v));
      }
    }
    return out;
  } catch {
    return {};
  }
}

function readDirtySet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(scopedKey(DIRTY_KEY)) || "[]");
    return Array.isArray(raw) ? new Set(raw.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeDirtySet(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    if (set.size === 0) localStorage.removeItem(scopedKey(DIRTY_KEY));
    else localStorage.setItem(scopedKey(DIRTY_KEY), JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

function markWaterDirty(date: string, dirty: boolean): void {
  const s = readDirtySet();
  if (dirty) s.add(date);
  else s.delete(date);
  writeDirtySet(s);
}

function writeMap(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(KEY), JSON.stringify(map));
    window.dispatchEvent(new Event("r2:data"));
  } catch {
    /* ignore storage quota errors */
  }
}

export function getAllWater(): Record<string, number> {
  return readMap();
}

export function getWaterMl(date: string): number {
  if (!date) return 0;
  return readMap()[date] ?? 0;
}

export function pushWaterToDb(date: string, waterMl: number): void {
  if (typeof window === "undefined" || !date) return;
  markWaterDirty(date, true);
  void sendOrQueue({
    url: "/api/water",
    method: "POST",
    body: { date, waterMl },
    dedupeKey: `water:${date}`,
  }).then((res) => {
    if (res.ok) markWaterDirty(date, false);
  });
}

export async function pushLocalWaterToDb(): Promise<{ pushed: number }> {
  if (typeof window === "undefined") return { pushed: 0 };
  const dirty = Array.from(readDirtySet());
  if (dirty.length === 0) return { pushed: 0 };
  const map = readMap();
  let pushed = 0;
  for (const date of dirty) {
    const waterMl = map[date] ?? 0;
    const res = await sendOrQueue({
      url: "/api/water",
      method: "POST",
      body: { date, waterMl },
      dedupeKey: `water:${date}`,
    });
    if (res.ok) {
      markWaterDirty(date, false);
      pushed++;
    }
  }
  return { pushed };
}

export function mergeServerWater(days: Array<{ date: string; waterMl: number }>): number {
  if (typeof window === "undefined" || !Array.isArray(days) || days.length === 0) return 0;
  const map = readMap();
  const dirty = readDirtySet();
  let changed = 0;
  for (const row of days) {
    if (!row || typeof row.date !== "string" || typeof row.waterMl !== "number") continue;
    const clean = Math.max(0, Math.min(MAX_WATER_ML, Math.round(row.waterMl)));
    const local = map[row.date] ?? 0;
    // Never overwrite pending local offline adjustments with older server state.
    if (dirty.has(row.date)) continue;
    if (clean !== local && clean > 0) {
      map[row.date] = clean;
      changed++;
    }
  }
  if (changed > 0) writeMap(map);
  return changed;
}

export function setWaterMl(date: string, ml: number): number {
  if (!date) return 0;
  const clamped = Math.max(0, Math.min(MAX_WATER_ML, Math.round(ml)));
  const map = readMap();
  if (clamped === 0) delete map[date];
  else map[date] = clamped;
  writeMap(map);
  pushWaterToDb(date, clamped);
  return clamped;
}

export function addWaterMl(date: string, deltaMl: number): number {
  return setWaterMl(date, getWaterMl(date) + deltaMl);
}
