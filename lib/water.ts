"use client";
// Daily water intake (ml) on this device, scoped per user like meals and
// activities. Used on the Home floating HUD and EnergyBalance to separate
// biological body weight (tanpa air) from scale weight (+ air minum).
import { scopedKey } from "./userScope";

const KEY = "r2.water.v1";
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

export function setWaterMl(date: string, ml: number): number {
  if (!date) return 0;
  const clamped = Math.max(0, Math.min(MAX_WATER_ML, Math.round(ml)));
  const map = readMap();
  if (clamped === 0) delete map[date];
  else map[date] = clamped;
  writeMap(map);
  return clamped;
}

export function addWaterMl(date: string, deltaMl: number): number {
  return setWaterMl(date, getWaterMl(date) + deltaMl);
}
