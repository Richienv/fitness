// Shared activity/workout metadata helpers (NO "use client"; safe in API routes & client store).
import { activityKcal, type ActivityKey, type Intensity } from "./burn.ts";

export type McpActivityType =
  | "walking"
  | "cycling"
  | "running"
  | "gym"
  | "sports"
  | "other";

export type McpIntensity = "light" | "moderate" | "intense";

export const MCP_INTENSITY_TO_LOCAL: Record<McpIntensity, Intensity> = {
  light: "santai",
  moderate: "sedang",
  intense: "berat",
};

export const LOCAL_INTENSITY_TO_MCP: Record<Intensity, McpIntensity> = {
  santai: "light",
  sedang: "moderate",
  berat: "intense",
};

export function mapMcpActivityToCardioKind(type: McpActivityType): string {
  switch (type) {
    case "walking":
      return "jalan";
    case "cycling":
      return "sepeda";
    case "running":
      return "lari";
    case "sports":
      return "sports";
    default:
      return "other";
  }
}

export function mapCardioKindToActivityKey(kind: string): ActivityKey {
  const k = kind.trim().toLowerCase();
  if (k === "jalan" || k === "walking" || k === "walk") return "jalan";
  if (k === "sepeda" || k === "cycling" || k === "bike") return "sepeda";
  if (k === "lari" || k === "running" || k === "run") return "lari";
  if (k === "renang" || k === "swimming" || k === "swim") return "renang";
  if (k === "sports" || k === "basketball" || k === "badminton") return "lari";
  if (k === "steps" || k === "langkah") return "langkah";
  return "jalan";
}

export function mapCardioKindToMcpType(kind: string): McpActivityType {
  const k = kind.trim().toLowerCase();
  if (k === "jalan" || k === "walking") return "walking";
  if (k === "sepeda" || k === "cycling") return "cycling";
  if (k === "lari" || k === "running") return "running";
  if (k === "sports") return "sports";
  return "other";
}

/** Default duration inference (minutes) when user specifies distance without duration (e.g., "jalan 1 km"). */
export function inferDurationMinutes(
  type: McpActivityType,
  durationMin?: number,
  distanceKm?: number,
): number {
  if (typeof durationMin === "number" && Number.isFinite(durationMin) && durationMin > 0) {
    return Math.round(durationMin * 10) / 10;
  }
  if (typeof distanceKm === "number" && Number.isFinite(distanceKm) && distanceKm > 0) {
    if (type === "walking") return Math.max(5, Math.round(distanceKm * 12));
    if (type === "running") return Math.max(4, Math.round(distanceKm * 6.5));
    if (type === "cycling") return Math.max(4, Math.round(distanceKm * 3.5));
    return Math.max(10, Math.round(distanceKm * 10));
  }
  return type === "gym" ? 45 : 20;
}

/** Estimate active calories burned when caller omits explicit calories_burned. */
export function estimateWorkoutCaloriesBurned(opts: {
  activityType: McpActivityType;
  durationMin: number;
  distanceKm?: number;
  intensity: McpIntensity;
  bodyWeightKg: number;
  totalVolumeKg?: number;
}): number {
  const kg = Number.isFinite(opts.bodyWeightKg) && opts.bodyWeightKg > 25 ? opts.bodyWeightKg : 73;
  const localInt = MCP_INTENSITY_TO_LOCAL[opts.intensity] ?? "sedang";

  if (opts.activityType === "gym") {
    const met = opts.intensity === "intense" ? 6.0 : opts.intensity === "light" ? 3.5 : 4.8;
    const durBurn = Math.max(0, met - 1) * kg * (opts.durationMin / 60);
    const volumeBonus = opts.totalVolumeKg && opts.totalVolumeKg > 0 ? opts.totalVolumeKg * 0.008 : 0;
    return Math.max(20, Math.round(durBurn + volumeBonus));
  }

  if (opts.activityType === "sports") {
    const met = opts.intensity === "intense" ? 8.5 : opts.intensity === "light" ? 4.8 : 6.5;
    return Math.max(15, Math.round(Math.max(0, met - 1) * kg * (opts.durationMin / 60)));
  }

  if (opts.activityType === "other") {
    const met = opts.intensity === "intense" ? 7.0 : opts.intensity === "light" ? 3.2 : 4.8;
    return Math.max(10, Math.round(Math.max(0, met - 1) * kg * (opts.durationMin / 60)));
  }

  const key = mapCardioKindToActivityKey(opts.activityType);
  const base = activityKcal(
    { kind: key, minutes: opts.durationMin, intensity: localInt },
    kg,
  );
  // Distance sanity refinement for walking/running: net active energy ≈ 0.55 kcal/kg/km walk, 0.90 run
  if (
    typeof opts.distanceKm === "number" &&
    opts.distanceKm > 0 &&
    (opts.activityType === "walking" || opts.activityType === "running")
  ) {
    const distEstimate =
      opts.distanceKm * kg * (opts.activityType === "running" ? 0.9 : 0.55);
    return Math.max(10, Math.round((base + distEstimate) / 2));
  }
  return Math.max(10, Math.round(base));
}
