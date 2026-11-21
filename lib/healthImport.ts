// Apple Health data sent by an iPhone Shortcut ("Pintasan"), and how it joins
// the day's estimates. Pure: no storage, no network.
//
// The home-screen app is a PWA, which cannot read HealthKit; a Shortcut can.
// It reads today's steps and active energy and posts them to
// /api/widget/health. See docs/plans/2026-11-21-apple-health-shortcut.md.
import type { ActivityKey } from "./burn";

export type HealthDay = {
  /** YYYY-MM-DD, China Standard Time. */
  date: string;
  steps: number | null;
  /** Active energy from Apple Health (kcal), like Apple Watch's red ring. */
  activeKcal: number | null;
  /** Walking + running distance, when the Shortcut sends it. */
  distanceKm: number | null;
};

/**
 * A number from a Shortcut, which may arrive as a number or as text in either
 * locale: "6.200" and "6,200" are six thousand two hundred, "410,5 kkal" and
 * "410.5" are four hundred ten and a half. A single separator followed by
 * exactly three digits is a thousands separator; otherwise it is decimal.
 */
export function parseLooseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.match(/-?\d[\d.,\s]*/);
  if (!m) return null;
  let t = m[0].replace(/\s/g, "").replace(/[.,]$/, "");
  const lastDot = t.lastIndexOf("."),
    lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    t = t.split(thou).join("").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = t.split(sep);
    const thousands =
      parts.length > 2 || (parts[1].length === 3 && parts[0] !== "0" && parts[0] !== "-0");
    t = thousands ? parts.join("") : parts.join(".");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};

export function parseHealthPayload(
  body: unknown,
  today: string,
): { ok: true; day: HealthDay } | { ok: false; error: string } {
  if (!body || typeof body !== "object")
    return { ok: false, error: "Isi permintaan harus JSON." };
  const o = body as Record<string, unknown>;
  const rawDate = pick(o, ["date", "tanggal"]);
  let date = today;
  if (rawDate !== undefined) {
    if (typeof rawDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate))
      return { ok: false, error: "Tanggal harus berformat YYYY-MM-DD." };
    if (rawDate > today) return { ok: false, error: "Tanggal tidak boleh di masa depan." };
    date = rawDate;
  }
  const steps = parseLooseNumber(pick(o, ["steps", "langkah"]));
  const activeKcal = parseLooseNumber(
    pick(o, ["activeKcal", "active_kcal", "activeEnergy", "kalori_aktif", "energi_aktif"]),
  );
  const distanceKm = parseLooseNumber(pick(o, ["distanceKm", "distance_km", "jarak_km"]));
  if (steps === null && activeKcal === null)
    return { ok: false, error: "Kirim minimal jumlah langkah atau kalori aktif." };
  if (steps !== null && (steps < 0 || steps > 200000))
    return { ok: false, error: "Jumlah langkah di luar batas wajar (0–200.000)." };
  if (activeKcal !== null && (activeKcal < 0 || activeKcal > 10000))
    return { ok: false, error: "Kalori aktif di luar batas wajar (0–10.000)." };
  if (distanceKm !== null && (distanceKm < 0 || distanceKm > 300))
    return { ok: false, error: "Jarak di luar batas wajar (0–300 km)." };
  return {
    ok: true,
    day: {
      date,
      steps: steps === null ? null : Math.round(steps),
      activeKcal: activeKcal === null ? null : Math.round(activeKcal * 10) / 10,
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
    },
  };
}

export type DayEstimate = { key: string; kind: "gym" | ActivityKey; kcal: number };

/**
 * One total for the day, never counting anything twice:
 *  · Apple Health active energy, when present, IS the total (the Watch saw
 *    the gym and the walk); the estimates are shown but not added.
 *  · Apple Health steps alone replace only the hand-logged steps.
 *  · Without Apple Health, the estimates add up.
 */
export function combineDay(
  estimates: DayEstimate[],
  health: HealthDay | null,
  stepsKcal: (steps: number) => number,
): {
  total: number;
  source: "health" | "estimate";
  excluded: string[];
  healthStepsKcal: number | null;
} {
  if (health && health.activeKcal !== null && health.activeKcal > 0)
    return {
      total: health.activeKcal,
      source: "health",
      excluded: estimates.map((e) => e.key),
      healthStepsKcal: null,
    };
  if (health && health.steps !== null && health.steps > 0) {
    const excluded = estimates.filter((e) => e.kind === "langkah").map((e) => e.key);
    const hs = Math.round(stepsKcal(health.steps));
    const rest = estimates
      .filter((e) => !excluded.includes(e.key))
      .reduce((s, e) => s + e.kcal, 0);
    return { total: rest + hs, source: "estimate", excluded, healthStepsKcal: hs };
  }
  return {
    total: estimates.reduce((s, e) => s + e.kcal, 0),
    source: "estimate",
    excluded: [],
    healthStepsKcal: null,
  };
}
