"use client";

export type Measurement = {
  date: string;
  weightKg?: number;
  waistCm?: number;
  shoulderCm?: number;
};

const KEY = "richie.measurements.v1";

function read(): Measurement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Measurement[]) : [];
  } catch {
    return [];
  }
}

function write(list: Measurement[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function getAllMeasurements(): Measurement[] {
  return read().sort((a, b) => a.date.localeCompare(b.date));
}

export function getLatestMeasurement(): Measurement | null {
  const list = getAllMeasurements();
  return list[list.length - 1] ?? null;
}

export function saveMeasurement(m: Measurement): void {
  const list = read();
  const idx = list.findIndex((x) => x.date === m.date);
  if (idx >= 0) list[idx] = { ...list[idx], ...m };
  else list.push(m);
  write(list);
}

export function shoulderWaistRatio(m: Measurement): number | null {
  if (!m.shoulderCm || !m.waistCm) return null;
  return m.shoulderCm / m.waistCm;
}
