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

function postMeasurementRemote(m: Measurement): void {
  if (typeof window === "undefined") return;
  fetch("/api/measurements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(m),
    keepalive: true,
  }).catch(() => {});
}

export function saveMeasurement(m: Measurement): void {
  const list = read();
  const idx = list.findIndex((x) => x.date === m.date);
  if (idx >= 0) list[idx] = { ...list[idx], ...m };
  else list.push(m);
  write(list);
  postMeasurementRemote(m);
}

export function shoulderWaistRatio(m: Measurement): number | null {
  if (!m.shoulderCm || !m.waistCm) return null;
  return m.shoulderCm / m.waistCm;
}

// ---------- Server → local pull sync (Hermes-logged weights) ----------

type ServerMeasurementRow = {
  date: string;
  weightKg?: number | null;
  waistCm?: number | null;
  shoulderCm?: number | null;
};

/** Merge server measurements by date — server wins for fields it has. */
export function mergeServerMeasurements(rows: ServerMeasurementRow[]): number {
  if (typeof window === "undefined") return 0;
  const list = read();
  let changed = 0;
  for (const row of rows) {
    const idx = list.findIndex((m) => m.date === row.date);
    const patch: Measurement = {
      date: row.date,
      ...(row.weightKg != null ? { weightKg: row.weightKg } : {}),
      ...(row.waistCm != null ? { waistCm: row.waistCm } : {}),
      ...(row.shoulderCm != null ? { shoulderCm: row.shoulderCm } : {}),
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
