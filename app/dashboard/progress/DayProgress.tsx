"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useSession } from "next-auth/react";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import {
  readProgressInsights,
  type ProgressInsightsData,
  type ProgressTargets,
} from "@/lib/progressAnalyticsData";
import {
  bucketProgressRows,
  computeMetricStats,
  niceTicks,
  weightTrend7d,
  type DailyProgressRow,
  type MetricRangeStats,
  type ProgressChartBucket,
  type ProgressMetricKey,
} from "@/lib/progressAnalytics";
import { formatWeighTime } from "@/lib/weighIn";
import "./day-progress.css";

const kg = (n: number, d = 1) =>
  n.toLocaleString("id-ID", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
const n0 = (n: number) => Math.round(n).toLocaleString("id-ID");

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function clampDate(date: string, min: string, max: string) {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function spanDays(from: string, to: string) {
  return (
    Math.round(
      (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
        86_400_000,
    ) + 1
  );
}

function shortDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function dayHeaderLabel(date: string, today: string): string {
  const yday = shiftDate(today, -1);
  if (date === today) return `Hari ini · ${shortDate(date)}`;
  if (date === yday) return `Kemarin · ${shortDate(date)}`;
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function dayListLabel(date: string, today: string): string {
  if (date === today) return "Hari ini";
  if (date === shiftDate(today, -1)) return "Kemarin";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function bucketDateLabel(bucket: ProgressChartBucket, today: string): string {
  if (!bucket.isAggregated) return dayHeaderLabel(bucket.representativeDate, today);
  return `${shortDate(bucket.startDate)} – ${shortDate(bucket.endDate)}`;
}

type RangeMode = "7" | "14" | "30" | "all" | "custom";

type MetricMeta = {
  key: ProgressMetricKey;
  label: string;
  accent: string;
  softBg: string;
  unit: string;
};

const METRICS: readonly MetricMeta[] = [
  { key: "weight", label: "Berat", accent: "#3e60d5", softBg: "#eef2ff", unit: "kg" },
  { key: "kcal", label: "Kalori", accent: "#4f46e5", softBg: "#eef2ff", unit: "kkal" },
  { key: "deficit", label: "Defisit", accent: "#15803d", softBg: "#ecfdf3", unit: "kkal" },
  { key: "protein", label: "Protein", accent: "#059669", softBg: "#ecfdf5", unit: "g" },
  { key: "fat", label: "Lemak", accent: "#d97706", softBg: "#fffbeb", unit: "g" },
  { key: "sugar", label: "Gula", accent: "#e11d48", softBg: "#fff1f2", unit: "g" },
  { key: "carbs", label: "Karbo", accent: "#0284c7", softBg: "#f0f9ff", unit: "g" },
  { key: "workout", label: "Latihan", accent: "#ea580c", softBg: "#fff7ed", unit: "kkal" },
];

const SVG = {
  w: 340,
  h: 196,
  padL: 44,
  padR: 12,
  padT: 16,
  padB: 26,
};
const PLOT_W = SVG.w - SVG.padL - SVG.padR;
const PLOT_H = SVG.h - SVG.padT - SVG.padB;

type Pt = { x: number; y: number };

/** Fritsch-Carlson monotone cubic spline so smooth trend curves never overshoot. */
function smoothLinePath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }

  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dxi = Math.max(0.001, pts[i + 1].x - pts[i].x);
    const dyi = pts[i + 1].y - pts[i].y;
    dx.push(dxi);
    dy.push(dyi);
    slopes.push(dyi / dxi);
  }

  const tangents = new Array<number>(n).fill(0);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangents[i] = (w1 + w2) / (w1 / slopes[i - 1] + w2 / slopes[i]);
    }
  }

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const step = dx[i] / 3;
    const cx1 = pts[i].x + step;
    const cy1 = pts[i].y + tangents[i] * step;
    const cx2 = pts[i + 1].x - step;
    const cy2 = pts[i + 1].y - tangents[i + 1] * step;
    d += ` C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function smoothAreaPath(pts: Pt[], baseY: number): string {
  if (pts.length < 2) return "";
  const line = smoothLinePath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L ${last.x.toFixed(1)} ${baseY.toFixed(1)} L ${first.x.toFixed(1)} ${baseY.toFixed(1)} Z`;
}

function formatTickValue(val: number, metric: ProgressMetricKey): string {
  if (metric === "weight") return kg(val, 1);
  if (metric === "sugar") return `${Math.round(val)}g`;
  if (metric === "protein" || metric === "fat" || metric === "carbs") {
    return `${Math.round(val)}g`;
  }
  if (Math.abs(val) >= 1000) {
    const k = val / 1000;
    return Number.isInteger(k) ? `${k}k` : `${kg(k, 1)}k`;
  }
  return `${Math.round(val)}`;
}

function metricTargetFor(
  metric: ProgressMetricKey,
  targets: ProgressTargets,
  targetKg: number | null,
): number | null {
  switch (metric) {
    case "weight":
      return targetKg;
    case "kcal":
      return targets.kcal;
    case "protein":
      return targets.proteinG;
    case "fat":
      return targets.fatG;
    case "sugar":
      return targets.sugarCapG;
    case "carbs":
      return targets.carbsG;
    default:
      return null;
  }
}

function pickXIndices(len: number): number[] {
  if (len <= 0) return [];
  if (len === 1) return [0];
  if (len === 2) return [0, 1];
  if (len <= 6) return [0, Math.floor((len - 1) / 2), len - 1];
  return [
    0,
    Math.round((len - 1) / 3),
    Math.round(((len - 1) * 2) / 3),
    len - 1,
  ];
}

function HeroProjectionCard({
  data,
}: {
  data: ProgressInsightsData;
}) {
  const p = data.projection;
  if (!p) {
    return (
      <section className="dp-card dp-hero-card" aria-label="Ringkasan tren">
        <div className="dp-hero-top">
          <div>
            <span className="dp-eyebrow">Proyeksi tren</span>
            <h2 className="dp-hero-empty-title">Mulai catat beberapa hari</h2>
          </div>
          <span className="dp-pace-pill is-steady">Menunggu data</span>
        </div>
        <p className="dp-muted-copy">
          Catat makan minimal 1–2 hari supaya prediksi kecepatan tren dan
          estimasi menuju target bisa dihitung otomatis.
        </p>
      </section>
    );
  }

  const paceClass =
    p.trend === "losing"
      ? "is-losing"
      : p.trend === "gaining"
        ? "is-gaining"
        : "is-steady";
  const paceSign = p.weeklyKgChange > 0 ? "+" : "−";
  const milestones = [
    { label: "14H", val: p.projected14d },
    { label: "30H", val: p.projected30d },
    { label: "60H", val: p.projected60d },
    { label: "90H", val: p.projected90d },
  ];

  return (
    <section className="dp-card dp-hero-card" aria-label="Proyeksi tren berat">
      <div className="dp-hero-top">
        <div className="dp-hero-heading">
          <span className="dp-eyebrow">Proyeksi tren · {p.sampleDays} hari</span>
          <div className="dp-hero-anchor">
            <strong>{kg(p.anchorKg)} kg</strong>
            <span>posisi acuan</span>
          </div>
        </div>
        <span className={`dp-pace-pill ${paceClass}`}>
          {paceSign}
          {kg(Math.abs(p.weeklyKgChange), 2)} kg / minggu
        </span>
      </div>

      {p.daysToTarget !== null && p.targetKg !== null && (
        <div className="dp-eta-row">
          <span className="dp-eta-pill">
            <span className="dp-eta-dot" aria-hidden="true" />
            Menuju {kg(p.targetKg)} kg · ±{p.daysToTarget} hari
            {p.targetDate ? ` (${shortDate(p.targetDate)})` : ""}
          </span>
        </div>
      )}

      <ol className="dp-milestones" aria-label="Proyeksi berat 14 hingga 90 hari">
        {milestones.map((m, idx) => {
          const delta = m.val - p.anchorKg;
          const deltaTone =
            Math.abs(delta) < 0.05
              ? "steady"
              : delta < 0
                ? "down"
                : "up";
          return (
            <li
              key={m.label}
              className="dp-milestone"
              style={{ animationDelay: `${idx * 45}ms` }}
            >
              <span className="dp-ms-tag">{m.label}</span>
              <strong>{kg(m.val)} kg</strong>
              <small className={deltaTone}>
                {Math.abs(delta) < 0.05
                  ? "Stabil"
                  : `${delta > 0 ? "+" : "−"}${kg(Math.abs(delta))} kg`}
              </small>
            </li>
          );
        })}
      </ol>

      <div className="dp-avg-chips" aria-label="Rata-rata harian">
        <div className="dp-avg-chip">
          <span>Makan</span>
          <strong>{n0(p.avgKcalIn)} kkal</strong>
        </div>
        <div className="dp-avg-chip">
          <span>Protein</span>
          <strong>{n0(p.avgProteinG)} g</strong>
        </div>
        <div
          className={`dp-avg-chip ${p.avgDeficitKcal >= 0 ? "is-good" : "is-warn"}`}
        >
          <span>{p.avgDeficitKcal >= 0 ? "Defisit" : "Surplus"}</span>
          <strong>
            {p.avgDeficitKcal >= 0 ? "" : "+"}
            {n0(Math.abs(p.avgDeficitKcal))} kkal
          </strong>
        </div>
      </div>
    </section>
  );
}

function MetricReadout({
  metric,
  bucket,
  stats,
  targets,
  targetKg,
  today,
}: {
  metric: MetricMeta;
  bucket: ProgressChartBucket;
  stats: MetricRangeStats;
  targets: ProgressTargets;
  targetKg: number | null;
  today: string;
}) {
  const dateLabel = bucketDateLabel(bucket, today);

  let primary = "—";
  let sub = "";
  let badge = "";

  if (metric.key === "weight") {
    const val = bucket.weightKg ?? bucket.weightTrendKg;
    primary = val !== null ? `${kg(val)} kg` : "Belum timbang";
    const parts: string[] = [];
    if (bucket.weightTrendKg !== null) {
      parts.push(`Tren 7H: ${kg(bucket.weightTrendKg)} kg`);
    }
    if (targetKg !== null) {
      parts.push(`Target ${kg(targetKg)} kg`);
    }
    sub = parts.join(" · ") || "Catat timbangan untuk tren";
    if (stats.delta !== null) {
      badge = `${stats.delta > 0 ? "+" : stats.delta < 0 ? "−" : ""}${kg(Math.abs(stats.delta))} kg`;
    } else if (stats.avg !== null) {
      badge = `Rata ${kg(stats.avg)} kg`;
    }
  } else if (metric.key === "kcal") {
    primary = bucket.mealDays > 0 ? `${n0(bucket.kcalIn)} kkal` : "0 kkal";
    if (bucket.totalBurnKcal > 0 && bucket.mealDays > 0) {
      const diff = bucket.totalBurnKcal - bucket.kcalIn;
      sub = `Bakar ${n0(bucket.totalBurnKcal)} · ${diff >= 0 ? `Defisit ${n0(diff)}` : `Surplus ${n0(-diff)}`}`;
    } else {
      sub = bucket.totalBurnKcal > 0
        ? `Bakar ${n0(bucket.totalBurnKcal)} kkal`
        : "Belum ada catatan bakar";
    }
    badge = stats.avg !== null ? `Rata ${n0(stats.avg)} kkal` : "—";
  } else if (metric.key === "deficit") {
    if (bucket.deficitKcal === null) {
      primary = "—";
      sub = "Butuh catatan makan & profil BMR";
    } else {
      const isDef = bucket.deficitKcal >= 0;
      primary = `${isDef ? "+" : "−"}${n0(Math.abs(bucket.deficitKcal))} kkal`;
      sub = `${isDef ? "Defisit" : "Surplus"} · Makan ${n0(bucket.kcalIn)} vs Bakar ${n0(bucket.totalBurnKcal)}`;
    }
    badge =
      stats.targetEligibleDays > 0
        ? `${stats.targetHitDays}/${stats.targetEligibleDays} defisit`
        : "—";
  } else if (metric.key === "protein") {
    primary = `${n0(bucket.proteinG)} g`;
    const pct = targets.proteinG > 0 ? Math.round((bucket.proteinG / targets.proteinG) * 100) : 0;
    sub = `${pct}% dari target ${n0(targets.proteinG)} g`;
    badge =
      stats.targetEligibleDays > 0
        ? `${stats.targetHitDays}/${stats.targetEligibleDays} capai target`
        : "—";
  } else if (metric.key === "fat") {
    primary = `${n0(bucket.fatG)} g`;
    const fatPct =
      bucket.kcalIn > 0
        ? Math.round(((bucket.fatG * 9) / bucket.kcalIn) * 100)
        : 0;
    sub = bucket.kcalIn > 0 ? `${fatPct}% dari kalori hari itu` : "Belum ada catatan makan";
    badge = stats.avg !== null ? `Rata ${n0(stats.avg)} g/hr` : "—";
  } else if (metric.key === "sugar") {
    primary = `${kg(bucket.sugarG, 1).replace(/,0$/, "")} g`;
    sub = `Batas harian ${n0(targets.sugarCapG)} g`;
    badge =
      stats.targetEligibleDays > 0
        ? `${stats.targetHitDays}/${stats.targetEligibleDays} aman`
        : "—";
  } else if (metric.key === "carbs") {
    primary = `${n0(bucket.carbsG)} g`;
    const carbPct =
      bucket.kcalIn > 0
        ? Math.round(((bucket.carbsG * 4) / bucket.kcalIn) * 100)
        : 0;
    sub = bucket.kcalIn > 0 ? `${carbPct}% dari kalori hari itu` : "Belum ada catatan makan";
    badge = stats.avg !== null ? `Rata ${n0(stats.avg)} g/hr` : "—";
  } else {
    const val = bucket.isAggregated ? bucket.totalActiveBurnKcal : bucket.activeBurnKcal;
    primary = `${n0(val)} kkal`;
    sub = bucket.isAggregated
      ? `${bucket.workoutDays} hari latihan di minggu ini`
      : bucket.workoutDays > 0
        ? "Hari latihan aktif"
        : "Hari istirahat / tidak tercatat";
    badge =
      stats.targetHitDays > 0
        ? `${stats.targetHitDays} hari · ${n0(stats.total ?? 0)} kkal`
        : "0 hari aktif";
  }

  return (
    <div className="dp-readout-bar" aria-live="polite">
      <div className="dp-readout-main">
        <span className="dp-readout-date">
          {dateLabel}
          {bucket.isAggregated && <em className="dp-week-tag"> · Mingguan</em>}
        </span>
        <strong className="dp-readout-val" style={{ color: metric.accent }}>
          {primary}
        </strong>
        <span className="dp-readout-sub">{sub}</span>
      </div>
      {badge && (
        <span
          className="dp-stat-pill"
          style={{ color: metric.accent, backgroundColor: metric.softBg }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function TrendStudioChart({
  metric,
  buckets,
  activeIdx,
  onSelectIdx,
  targets,
  targetKg,
  today,
}: {
  metric: MetricMeta;
  buckets: ProgressChartBucket[];
  activeIdx: number;
  onSelectIdx: (idx: number) => void;
  targets: ProgressTargets;
  targetKg: number | null;
  today: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrubbingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const count = buckets.length;
  const xForIdx = useCallback(
    (idx: number) => {
      if (count <= 1) return SVG.padL + PLOT_W / 2;
      if (metric.key === "weight" || metric.key === "fat") {
        return SVG.padL + (idx / (count - 1)) * PLOT_W;
      }
      const slot = PLOT_W / count;
      return SVG.padL + slot * (idx + 0.5);
    },
    [count, metric.key],
  );

  const slotWidth = count > 0 ? PLOT_W / Math.max(1, count) : PLOT_W;
  const barW = Math.max(4, Math.min(22, slotWidth * 0.64));

  // Determine domain & ticks for active metric
  const scale = useMemo(() => {
    if (metric.key === "weight") {
      const vals: number[] = [];
      for (const b of buckets) {
        if (b.weightKg !== null) vals.push(b.weightKg);
        if (b.weightTrendKg !== null) vals.push(b.weightTrendKg);
      }
      if (vals.length === 0) {
        const base = targetKg ?? 70;
        return niceTicks(base - 2, base + 2, 4, false);
      }
      let lo = Math.min(...vals);
      let hi = Math.max(...vals);
      const showTargetLine =
        targetKg !== null && Math.abs(targetKg - (lo + hi) / 2) <= 10;
      if (showTargetLine && targetKg !== null) {
        lo = Math.min(lo, targetKg);
        hi = Math.max(hi, targetKg);
      }
      const pad = Math.max(0.4, (hi - lo) * 0.18);
      return niceTicks(lo - pad, hi + pad, 4, false);
    }

    if (metric.key === "deficit") {
      const vals = buckets
        .map((b) => b.deficitKcal)
        .filter((v): v is number => v !== null);
      if (vals.length === 0) return niceTicks(-400, 600, 4, false);
      const lo = Math.min(0, ...vals);
      const hi = Math.max(0, ...vals);
      const pad = Math.max(150, (hi - lo) * 0.14);
      return niceTicks(lo < 0 ? lo - pad * 0.6 : 0, hi > 0 ? hi + pad * 0.6 : 200, 4, false);
    }

    if (metric.key === "kcal") {
      const maxVal = Math.max(
        targets.kcal,
        ...buckets.map((b) => Math.max(b.kcalIn, b.totalBurnKcal)),
      );
      return niceTicks(0, maxVal * 1.08, 4, true);
    }

    if (metric.key === "protein") {
      const maxVal = Math.max(
        targets.proteinG * 1.05,
        ...buckets.map((b) => b.proteinG),
      );
      return niceTicks(0, maxVal * 1.08, 4, true);
    }

    if (metric.key === "fat") {
      const maxVal = Math.max(
        targets.fatG,
        ...buckets.map((b) => b.fatG),
        20,
      );
      return niceTicks(0, maxVal * 1.15, 4, true);
    }

    if (metric.key === "sugar") {
      const maxVal = Math.max(
        targets.sugarCapG * 1.15,
        ...buckets.map((b) => b.sugarG),
        20,
      );
      return niceTicks(0, maxVal * 1.1, 4, true);
    }

    if (metric.key === "carbs") {
      const maxVal = Math.max(
        targets.carbsG,
        ...buckets.map((b) => b.carbsG),
        40,
      );
      return niceTicks(0, maxVal * 1.12, 4, true);
    }

    // workout
    const maxVal = Math.max(
      200,
      ...buckets.map((b) =>
        b.isAggregated ? b.totalActiveBurnKcal : b.activeBurnKcal,
      ),
    );
    return niceTicks(0, maxVal * 1.12, 4, true);
  }, [buckets, metric.key, targetKg, targets]);

  const yForVal = useCallback(
    (v: number) => {
      const span = Math.max(1e-6, scale.max - scale.min);
      const frac = (v - scale.min) / span;
      return SVG.padT + PLOT_H * (1 - frac);
    },
    [scale.max, scale.min],
  );

  const pickNearestIdx = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || count === 0) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const viewX = ((clientX - rect.left) / rect.width) * SVG.w;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < count; i++) {
        const d = Math.abs(xForIdx(i) - viewX);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      onSelectIdx(best);
    },
    [count, onSelectIdx, xForIdx],
  );

  const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
    scrubbingRef.current = true;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    pickNearestIdx(e.clientX);
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!scrubbingRef.current || !startPosRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 6 && dx >= dy) {
      if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {}
      }
      pickNearestIdx(e.clientX);
    }
  };

  const handlePointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    scrubbingRef.current = false;
    startPosRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
    } catch {}
  };

  const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSelectIdx(Math.max(0, activeIdx - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSelectIdx(Math.min(count - 1, activeIdx + 1));
    }
  };

  // Weight-specific data check (split into contiguous segments across >7d unweighed gaps)
  const weightTrendSegments: Pt[][] = [];
  let currentSeg: Pt[] = [];
  const weightRawPts: { idx: number; x: number; y: number }[] = [];
  if (metric.key === "weight") {
    buckets.forEach((b, idx) => {
      const x = xForIdx(idx);
      if (b.weightTrendKg !== null) {
        currentSeg.push({ x, y: yForVal(b.weightTrendKg) });
      } else if (currentSeg.length > 0) {
        weightTrendSegments.push(currentSeg);
        currentSeg = [];
      }
      if (b.weightKg !== null) {
        weightRawPts.push({ idx, x, y: yForVal(b.weightKg) });
      }
    });
    if (currentSeg.length > 0) weightTrendSegments.push(currentSeg);
  }
  const hasWeightTrend = weightTrendSegments.some((s) => s.length > 0);

  const fatPts: Pt[] = useMemo(() => {
    if (metric.key !== "fat") return [];
    return buckets.map((b, idx) => ({ x: xForIdx(idx), y: yForVal(b.fatG) }));
  }, [buckets, metric.key, xForIdx, yForVal]);

  const kcalBurnPts: Pt[] = useMemo(() => {
    if (metric.key !== "kcal") return [];
    return buckets
      .map((b, idx) =>
        b.totalBurnKcal > 0
          ? { x: xForIdx(idx), y: yForVal(b.totalBurnKcal) }
          : null,
      )
      .filter((pt): pt is Pt => pt !== null);
  }, [buckets, metric.key, xForIdx, yForVal]);

  const carbsTrendPts: Pt[] = useMemo(() => {
    if (metric.key !== "carbs") return [];
    return buckets.map((b, idx) => {
      const win = buckets.slice(Math.max(0, idx - 2), idx + 1);
      const avg = win.reduce((s, w) => s + w.carbsG, 0) / win.length;
      return { x: xForIdx(idx), y: yForVal(avg) };
    });
  }, [buckets, metric.key, xForIdx, yForVal]);

  const activeBucket = buckets[activeIdx];
  const activeX = activeBucket ? xForIdx(activeIdx) : SVG.padL;
  const baseY = SVG.padT + PLOT_H;
  const zeroY = yForVal(0);
  const showPassiveDots = count <= 14;
  const xTickIndices = pickXIndices(count);

  const hasSugarData =
    metric.key !== "sugar" || buckets.some((b) => b.sugarG > 0);
  const hasWeightData =
    metric.key !== "weight" || weightRawPts.length > 0 || hasWeightTrend;

  return (
    <div className="dp-chart-wrap">
      {metric.key === "kcal" && (
        <div className="dp-inline-legend">
          <span>
            <i className="bar" style={{ background: "#4f46e5" }} /> Makan
          </span>
          <span>
            <i className="line" style={{ background: "#e07a2f" }} /> Bakar harian
          </span>
        </div>
      )}
      {metric.key === "weight" && (
        <div className="dp-inline-legend">
          <span>
            <i className="line" style={{ background: "#3e60d5" }} /> Tren 7 hari
          </span>
          <span>
            <i className="dot" style={{ background: "#3e60d5" }} /> Timbangan harian
          </span>
        </div>
      )}
      {metric.key === "protein" && (
        <div className="dp-inline-legend">
          <span>
            <i className="bar" style={{ background: "#059669" }} /> Capai target
          </span>
          <span>
            <i className="bar" style={{ background: "#94a3b8" }} /> Di bawah {n0(targets.proteinG)} g
          </span>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG.w} ${SVG.h}`}
        className="dp-svg"
        role="slider"
        tabIndex={0}
        aria-label={`Grafik ${metric.label}`}
        aria-valuemin={1}
        aria-valuemax={Math.max(1, count)}
        aria-valuenow={activeIdx + 1}
        aria-valuetext={
          activeBucket ? bucketDateLabel(activeBucket, today) : undefined
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        <defs>
          <linearGradient id="dp-grad-weight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3e60d5" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3e60d5" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="dp-grad-fat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d97706" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines + Y-axis labels */}
        {scale.ticks.map((tick) => {
          const y = yForVal(tick);
          const isZero = metric.key === "deficit" && Math.abs(tick) < 0.01;
          return (
            <g key={tick}>
              <line
                x1={SVG.padL}
                x2={SVG.w - SVG.padR}
                y1={y}
                y2={y}
                className={isZero ? "dp-zero-line" : "dp-grid-line"}
              />
              <text
                x={SVG.padL - 7}
                y={y + 3}
                textAnchor="end"
                className="dp-y-tick"
              >
                {formatTickValue(tick, metric.key)}
              </text>
            </g>
          );
        })}

        {/* Active vertical scrub guideline */}
        {activeBucket && (
          <line
            x1={activeX}
            x2={activeX}
            y1={SVG.padT}
            y2={baseY}
            className="dp-guide-line"
          />
        )}

        {/* Metric-specific visual layers */}
        {metric.key === "weight" && (
          <>
            {targetKg !== null &&
              targetKg >= scale.min &&
              targetKg <= scale.max && (
                <g>
                  <line
                    x1={SVG.padL}
                    x2={SVG.w - SVG.padR}
                    y1={yForVal(targetKg)}
                    y2={yForVal(targetKg)}
                    className="dp-ref-line"
                    stroke="#16a34a"
                  />
                  <rect
                    x={SVG.w - SVG.padR - 80}
                    y={Math.max(SVG.padT, yForVal(targetKg) - 16)}
                    width={78}
                    height={14}
                    rx={7}
                    fill="#ecfdf3"
                    stroke="#bbf7d0"
                  />
                  <text
                    x={SVG.w - SVG.padR - 41}
                    y={Math.max(SVG.padT + 10, yForVal(targetKg) - 6)}
                    textAnchor="middle"
                    className="dp-ref-tag"
                    fill="#15803d"
                  >
                    Target {kg(targetKg)} kg
                  </text>
                </g>
              )}
            {weightTrendSegments.map((seg, sIdx) =>
              seg.length >= 2 ? (
                <path
                  key={`wt-area-${sIdx}`}
                  d={smoothAreaPath(seg, baseY)}
                  fill="url(#dp-grad-weight)"
                />
              ) : null,
            )}
            {weightRawPts.length >= 2 && (
              <polyline
                points={weightRawPts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#3e60d5"
                strokeOpacity={0.25}
                strokeWidth={1.25}
              />
            )}
            {weightTrendSegments.map((seg, sIdx) =>
              seg.length >= 2 ? (
                <path
                  key={`wt-line-${sIdx}`}
                  d={smoothLinePath(seg)}
                  fill="none"
                  stroke="#3e60d5"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              ) : (
                <circle
                  key={`wt-pt-${sIdx}`}
                  cx={seg[0].x}
                  cy={seg[0].y}
                  r={3.2}
                  fill="#3e60d5"
                />
              ),
            )}
            {weightRawPts.map((p) => {
              const isOn = p.idx === activeIdx;
              if (!showPassiveDots && !isOn) return null;
              return (
                <circle
                  key={p.idx}
                  cx={p.x}
                  cy={p.y}
                  r={isOn ? 4.5 : 2.6}
                  fill={isOn ? "#3e60d5" : "#fff"}
                  stroke="#3e60d5"
                  strokeWidth={isOn ? 2 : 1.5}
                />
              );
            })}
            {activeBucket?.weightTrendKg !== null && activeBucket && (
              <circle
                cx={activeX}
                cy={yForVal(activeBucket.weightTrendKg!)}
                r={5}
                fill="#3e60d5"
                stroke="#fff"
                strokeWidth={2}
              />
            )}
          </>
        )}

        {metric.key === "kcal" && (
          <>
            {buckets.map((b, idx) => {
              const isOn = idx === activeIdx;
              const x = xForIdx(idx) - barW / 2;
              const topY = yForVal(b.kcalIn);
              const h = Math.max(0, baseY - topY);
              return (
                <rect
                  key={b.key}
                  x={x}
                  y={topY}
                  width={barW}
                  height={h}
                  rx={Math.min(5, barW / 2)}
                  fill="#4f46e5"
                  opacity={b.mealDays === 0 ? 0.14 : isOn ? 1 : 0.72}
                  className="dp-bar"
                />
              );
            })}
            {kcalBurnPts.length >= 2 && (
              <path
                d={smoothLinePath(kcalBurnPts)}
                fill="none"
                stroke="#e07a2f"
                strokeWidth={2.2}
                strokeDasharray="4 3"
                strokeLinecap="round"
              />
            )}
            {activeBucket && activeBucket.totalBurnKcal > 0 && (
              <circle
                cx={activeX}
                cy={yForVal(activeBucket.totalBurnKcal)}
                r={4}
                fill="#e07a2f"
                stroke="#fff"
                strokeWidth={1.8}
              />
            )}
          </>
        )}

        {metric.key === "deficit" &&
          buckets.map((b, idx) => {
            if (b.deficitKcal === null) return null;
            const isOn = idx === activeIdx;
            const x = xForIdx(idx) - barW / 2;
            const valY = yForVal(b.deficitKcal);
            const y = Math.min(zeroY, valY);
            const h = Math.max(2, Math.abs(valY - zeroY));
            const color = b.deficitKcal >= 0 ? "#16a34a" : "#ef4444";
            return (
              <rect
                key={b.key}
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={Math.min(4, barW / 2)}
                fill={color}
                opacity={isOn ? 1 : 0.76}
                className="dp-bar"
              />
            );
          })}

        {metric.key === "protein" && (
          <>
            <line
              x1={SVG.padL}
              x2={SVG.w - SVG.padR}
              y1={yForVal(targets.proteinG)}
              y2={yForVal(targets.proteinG)}
              className="dp-ref-line"
              stroke="#059669"
            />
            <text
              x={SVG.w - SVG.padR - 2}
              y={Math.max(SVG.padT + 9, yForVal(targets.proteinG) - 4)}
              textAnchor="end"
              className="dp-ref-tag"
              fill="#047857"
            >
              Target {n0(targets.proteinG)} g
            </text>
            {buckets.map((b, idx) => {
              const isOn = idx === activeIdx;
              const hit = b.proteinG >= targets.proteinG;
              const topY = yForVal(b.proteinG);
              const h = Math.max(0, baseY - topY);
              return (
                <rect
                  key={b.key}
                  x={xForIdx(idx) - barW / 2}
                  y={topY}
                  width={barW}
                  height={h}
                  rx={Math.min(5, barW / 2)}
                  fill={hit ? "#059669" : "#94a3b8"}
                  opacity={b.mealDays === 0 ? 0.16 : isOn ? 1 : 0.78}
                  className="dp-bar"
                />
              );
            })}
          </>
        )}

        {metric.key === "fat" && (
          <>
            <line
              x1={SVG.padL}
              x2={SVG.w - SVG.padR}
              y1={yForVal(targets.fatG)}
              y2={yForVal(targets.fatG)}
              className="dp-ref-line"
              stroke="#d97706"
            />
            <text
              x={SVG.w - SVG.padR - 2}
              y={Math.max(SVG.padT + 9, yForVal(targets.fatG) - 4)}
              textAnchor="end"
              className="dp-ref-tag"
              fill="#b45309"
            >
              Acuan {n0(targets.fatG)} g
            </text>
            {fatPts.length >= 2 && (
              <>
                <path
                  d={smoothAreaPath(fatPts, baseY)}
                  fill="url(#dp-grad-fat)"
                />
                <path
                  d={smoothLinePath(fatPts)}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              </>
            )}
            {fatPts.map((pt, idx) => {
              const isOn = idx === activeIdx;
              if (!showPassiveDots && !isOn) return null;
              return (
                <circle
                  key={buckets[idx].key}
                  cx={pt.x}
                  cy={pt.y}
                  r={isOn ? 5 : 2.8}
                  fill={isOn ? "#d97706" : "#fff"}
                  stroke="#d97706"
                  strokeWidth={isOn ? 2 : 1.6}
                />
              );
            })}
          </>
        )}

        {metric.key === "sugar" && (
          <>
            <line
              x1={SVG.padL}
              x2={SVG.w - SVG.padR}
              y1={yForVal(targets.sugarCapG)}
              y2={yForVal(targets.sugarCapG)}
              className="dp-ref-line"
              stroke="#e11d48"
            />
            <text
              x={SVG.w - SVG.padR - 2}
              y={Math.max(SVG.padT + 9, yForVal(targets.sugarCapG) - 4)}
              textAnchor="end"
              className="dp-ref-tag"
              fill="#be123c"
            >
              Batas {n0(targets.sugarCapG)} g
            </text>
            {buckets.map((b, idx) => {
              const isOn = idx === activeIdx;
              const over = b.sugarG > targets.sugarCapG;
              const topY = yForVal(b.sugarG);
              const h = Math.max(b.sugarG > 0 ? 2 : 0, baseY - topY);
              return (
                <rect
                  key={b.key}
                  x={xForIdx(idx) - barW / 2}
                  y={topY}
                  width={barW}
                  height={h}
                  rx={Math.min(5, barW / 2)}
                  fill={over ? "#be123c" : "#fb7185"}
                  opacity={isOn ? 1 : 0.8}
                  className="dp-bar"
                />
              );
            })}
          </>
        )}

        {metric.key === "carbs" && (
          <>
            <line
              x1={SVG.padL}
              x2={SVG.w - SVG.padR}
              y1={yForVal(targets.carbsG)}
              y2={yForVal(targets.carbsG)}
              className="dp-ref-line"
              stroke="#0284c7"
            />
            <text
              x={SVG.w - SVG.padR - 2}
              y={Math.max(SVG.padT + 9, yForVal(targets.carbsG) - 4)}
              textAnchor="end"
              className="dp-ref-tag"
              fill="#0369a1"
            >
              Target {n0(targets.carbsG)} g
            </text>
            {buckets.map((b, idx) => {
              const isOn = idx === activeIdx;
              const topY = yForVal(b.carbsG);
              const h = Math.max(0, baseY - topY);
              return (
                <rect
                  key={b.key}
                  x={xForIdx(idx) - barW / 2}
                  y={topY}
                  width={barW}
                  height={h}
                  rx={Math.min(5, barW / 2)}
                  fill="#38bdf8"
                  opacity={b.mealDays === 0 ? 0.16 : isOn ? 1 : 0.72}
                  className="dp-bar"
                />
              );
            })}
            {carbsTrendPts.length >= 2 && (
              <path
                d={smoothLinePath(carbsTrendPts)}
                fill="none"
                stroke="#0369a1"
                strokeWidth={2}
                strokeLinecap="round"
              />
            )}
          </>
        )}

        {metric.key === "workout" &&
          buckets.map((b, idx) => {
            const isOn = idx === activeIdx;
            const val = b.isAggregated ? b.totalActiveBurnKcal : b.activeBurnKcal;
            const topY = yForVal(val);
            const h = Math.max(val > 0 ? 3 : 0, baseY - topY);
            return (
              <rect
                key={b.key}
                x={xForIdx(idx) - barW / 2}
                y={topY}
                width={barW}
                height={h}
                rx={Math.min(5, barW / 2)}
                fill="#f97316"
                opacity={val === 0 ? 0.12 : isOn ? 1 : 0.82}
                className="dp-bar"
              />
            );
          })}

        {/* X-axis non-overlapping date ticks */}
        {xTickIndices.map((idx, pos) => {
          const b = buckets[idx];
          if (!b) return null;
          const x = xForIdx(idx);
          const anchor =
            xTickIndices.length === 1
              ? "middle"
              : pos === 0
                ? "start"
                : pos === xTickIndices.length - 1
                  ? "end"
                  : "middle";
          const labelX =
            anchor === "start"
              ? Math.max(SVG.padL, x - barW / 2)
              : anchor === "end"
                ? Math.min(SVG.w - SVG.padR, x + barW / 2)
                : x;
          return (
            <text
              key={`${b.key}-${pos}`}
              x={labelX}
              y={SVG.h - 6}
              textAnchor={anchor}
              className="dp-x-tick"
            >
              {shortDate(b.isAggregated ? b.startDate : b.representativeDate)}
            </text>
          );
        })}
      </svg>

      {!hasWeightData && (
        <p className="dp-chart-hint">
          Belum ada catatan timbangan di rentang ini.
        </p>
      )}
      {!hasSugarData && (
        <p className="dp-chart-hint">
          Belum ada angka gula tercatat di rentang ini — angka gula terisi
          otomatis dari label nutrisi &amp; makanan pustaka.
        </p>
      )}
    </div>
  );
}

function SelectedDayCard({
  row,
  today,
  targets,
  weeklyNotice,
}: {
  row: DailyProgressRow;
  today: string;
  targets: ProgressTargets;
  weeklyNotice?: string | null;
}) {
  const isDef = row.deficitKcal === null || row.deficitKcal >= 0;
  const energyItems = [
    { label: "Makan", value: n0(row.kcalIn), tone: "" },
    { label: "Bakar", value: n0(row.totalBurnKcal), tone: "" },
    {
      label: isDef ? "Defisit" : "Surplus",
      value:
        row.deficitKcal === null
          ? "—"
          : `${isDef ? "+" : "−"}${n0(Math.abs(row.deficitKcal))}`,
      tone:
        row.deficitKcal === null
          ? ""
          : isDef
            ? "is-good"
            : "is-warn",
    },
    { label: "Olahraga", value: n0(row.activeBurnKcal), tone: "" },
  ];

  const macros = [
    {
      label: "Protein",
      val: `${n0(row.proteinG)} g`,
      pct: targets.proteinG > 0 ? Math.min(100, (row.proteinG / targets.proteinG) * 100) : 0,
      hint: `${targets.proteinG > 0 ? Math.round((row.proteinG / targets.proteinG) * 100) : 0}% target`,
      color: "#059669",
    },
    {
      label: "Karbo",
      val: `${n0(row.carbsG)} g`,
      pct: targets.carbsG > 0 ? Math.min(100, (row.carbsG / targets.carbsG) * 100) : 0,
      hint:
        row.kcalIn > 0
          ? `${Math.round(((row.carbsG * 4) / row.kcalIn) * 100)}% kalori`
          : "—",
      color: "#0284c7",
    },
    {
      label: "Lemak",
      val: `${n0(row.fatG)} g`,
      pct: targets.fatG > 0 ? Math.min(100, (row.fatG / targets.fatG) * 100) : 0,
      hint:
        row.kcalIn > 0
          ? `${Math.round(((row.fatG * 9) / row.kcalIn) * 100)}% kalori`
          : "—",
      color: "#d97706",
    },
    {
      label: "Gula",
      val: `${kg(row.sugarG, 1).replace(/,0$/, "")} g`,
      pct: targets.sugarCapG > 0 ? Math.min(100, (row.sugarG / targets.sugarCapG) * 100) : 0,
      hint:
        row.sugarG > targets.sugarCapG
          ? `Melebihi ${n0(targets.sugarCapG)} g`
          : `Batas ${n0(targets.sugarCapG)} g`,
      color: row.sugarG > targets.sugarCapG ? "#be123c" : "#fb7185",
    },
  ];

  const weighTime = formatWeighTime(row.weighedAt);
  return (
    <section className="dp-card dp-day-card" aria-live="polite" aria-label="Rincian hari terpilih">
      <div className="dp-day-head">
        <div>
          <h3>{dayHeaderLabel(row.date, today)}</h3>
          {weeklyNotice && <span className="dp-day-sub">{weeklyNotice}</span>}
        </div>
        <span className="dp-weight-pill">
          {row.weightKg !== null
            ? `${kg(row.weightKg)} kg${weighTime ? ` · ${weighTime}` : ""}`
            : "Belum timbang"}
        </span>
      </div>

      <div className="dp-energy-grid">
        {energyItems.map((item) => (
          <div key={item.label} className={`dp-energy-tile ${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>kkal</small>
          </div>
        ))}
      </div>

      <div className="dp-macro-grid">
        {macros.map((m) => (
          <div key={m.label} className="dp-macro-card">
            <div className="dp-macro-top">
              <span>{m.label}</span>
              <strong>{m.val}</strong>
            </div>
            <div className="dp-macro-track">
              <div
                className="dp-macro-fill"
                style={{ width: `${Math.max(m.pct > 0 ? 4 : 0, m.pct)}%`, background: m.color }}
              />
            </div>
            <small>{m.hint}</small>
          </div>
        ))}
      </div>

      {row.waterMl > 0 && (
        <div className="dp-water-row">
          <div className="dp-water-top">
            <span>Air minum</span>
            <strong>{kg(row.waterMl / 1000, 1)} L</strong>
          </div>
          <div className="dp-macro-track">
            <div
              className="dp-macro-fill"
              style={{
                width: `${Math.min(100, (row.waterMl / 2500) * 100)}%`,
                background: "#0ea5e9",
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default function DayProgress() {
  const { data: session } = useSession();
  const [data, setData] = useState<ProgressInsightsData | null>(null);
  const [metricKey, setMetricKey] = useState<ProgressMetricKey>("weight");
  const [rangeMode, setRangeMode] = useState<RangeMode>("14");
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showDays, setShowDays] = useState(false);

  const refresh = useCallback(() => {
    try {
      setData(readProgressInsights(session?.user?.name));
    } catch {
      setData(null);
    }
  }, [session?.user?.name]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useSoftRefresh(refresh);

  const logged = useMemo(() => {
    if (!data) return [];
    return data.rows.filter(
      (r) =>
        r.mealCount > 0 ||
        r.weightKg !== null ||
        r.workoutCount > 0 ||
        r.waterMl > 0,
    );
  }, [data]);

  const earliest = logged.at(-1)?.date ?? data?.today ?? "";
  const latest = logged[0]?.date ?? data?.today ?? "";

  const { rangeFrom, rangeTo } = useMemo(() => {
    if (!earliest || !latest) return { rangeFrom: "", rangeTo: "" };
    if (rangeMode === "7" || rangeMode === "14" || rangeMode === "30") {
      const days = Number(rangeMode);
      return {
        rangeFrom: clampDate(shiftDate(latest, 1 - days), earliest, latest),
        rangeTo: latest,
      };
    }
    if (rangeMode === "all") {
      return { rangeFrom: earliest, rangeTo: latest };
    }
    const nextTo = clampDate(to ?? latest, earliest, latest);
    const nextFrom = clampDate(
      from ?? shiftDate(nextTo, -13),
      earliest,
      nextTo,
    );
    return { rangeFrom: nextFrom, rangeTo: nextTo };
  }, [earliest, latest, rangeMode, from, to]);

  const trendPoints = useMemo(() => {
    if (!data) return [];
    return weightTrend7d(data.rows);
  }, [data]);

  const rangedNewestFirst = useMemo(() => {
    if (!rangeFrom || !rangeTo) return [];
    return logged.filter((r) => r.date >= rangeFrom && r.date <= rangeTo);
  }, [logged, rangeFrom, rangeTo]);

  const buckets = useMemo(() => {
    if (!data || !rangeFrom || !rangeTo) return [];
    return bucketProgressRows(logged, rangeFrom, rangeTo, {
      maxDailySpan: 45,
      trendPoints,
    });
  }, [data, logged, rangeFrom, rangeTo, trendPoints]);

  const activeMetric =
    METRICS.find((m) => m.key === metricKey) ?? METRICS[0];

  const stats = useMemo(() => {
    if (!data) return null;
    const target = metricTargetFor(
      metricKey,
      data.targets,
      data.targetKg,
    );
    const goalDirection =
      data.targetKg !== null && data.targetKg > data.anchorKg
        ? "gaining"
        : "losing";
    return computeMetricStats(rangedNewestFirst, metricKey, {
      target,
      goalDirection,
    });
  }, [data, metricKey, rangedNewestFirst]);

  if (!data) return null;

  const activeIdx = (() => {
    if (buckets.length === 0) return 0;
    if (selected) {
      const exact = buckets.findIndex(
        (b) =>
          b.representativeDate === selected ||
          (selected >= b.startDate && selected <= b.endDate),
      );
      if (exact >= 0) return exact;
    }
    return buckets.length - 1;
  })();

  const activeBucket = buckets[activeIdx] ?? null;
  const activeRow =
    logged.find((r) => r.date === activeBucket?.representativeDate) ??
    rangedNewestFirst[0] ??
    null;

  const selectPreset = (mode: Exclude<RangeMode, "custom">) => {
    setRangeMode(mode);
    if (mode !== "all" && latest) {
      const days = Number(mode);
      setFrom(clampDate(shiftDate(latest, 1 - days), earliest, latest));
      setTo(latest);
    } else if (earliest && latest) {
      setFrom(earliest);
      setTo(latest);
    }
  };

  const setCustomRange = (nextStart: string, nextEnd: string) => {
    if (!earliest || !latest) return;
    const clampedTo = clampDate(nextEnd, earliest, latest);
    const clampedFrom = clampDate(nextStart, earliest, clampedTo);
    setRangeMode("custom");
    setFrom(clampedFrom);
    setTo(clampedTo);
  };

  const isAggregatedView = buckets.some((b) => b.isAggregated);

  return (
    <div className="dp-stack" aria-label="Ringkasan dan tren progres">
      <HeroProjectionCard data={data} />

      <section className="dp-card dp-studio-card" aria-label="Studio tren multi-variabel">
        <div className="dp-studio-head">
          <div>
            <h2>Tren &amp; Nutrisi</h2>
            <span className="dp-studio-sub">
              {logged.length} hari tercatat
              {isAggregatedView ? " · diringkas mingguan" : ""}
            </span>
          </div>
          <span className="dp-range-span">
            {rangeFrom && rangeTo
              ? rangeFrom === rangeTo
                ? shortDate(rangeTo)
                : `${shortDate(rangeFrom)} – ${shortDate(rangeTo)}`
              : "—"}
          </span>
        </div>

        {logged.length > 0 && (
          <div className="dp-controls">
            <div className="dp-controls-row">
              <div className="dp-presets" role="group" aria-label="Rentang waktu">
                {(
                  [
                    ["7", "7H", "7 hari"],
                    ["14", "14H", "14 hari"],
                    ["30", "30H", "30 hari"],
                    ["all", "Semua", "Semua catatan"],
                  ] as const
                ).map(([id, short, full]) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={full}
                    aria-pressed={rangeMode === id}
                    className={rangeMode === id ? "is-on" : undefined}
                    onClick={() => selectPreset(id)}
                  >
                    {short}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`dp-cal-toggle${customOpen ? " is-on" : ""}`}
                aria-label="Pilih tanggal manual"
                aria-expanded={customOpen}
                onClick={() => setCustomOpen((o) => !o)}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="17" rx="3" />
                  <path d="M8 2v4M16 2v4M3 10h18" />
                </svg>
              </button>
            </div>

            {customOpen && (
              <div className="dp-dates">
                <label>
                  <span>Dari</span>
                  <input
                    type="date"
                    min={earliest}
                    max={rangeTo}
                    value={rangeFrom}
                    onChange={(e) =>
                      e.target.value && setCustomRange(e.target.value, rangeTo)
                    }
                  />
                </label>
                <label>
                  <span>Sampai</span>
                  <input
                    type="date"
                    min={rangeFrom}
                    max={latest}
                    value={rangeTo}
                    onChange={(e) =>
                      e.target.value && setCustomRange(rangeFrom, e.target.value)
                    }
                  />
                </label>
              </div>
            )}
          </div>
        )}

        <div className="dp-metric-strip" role="group" aria-label="Pilih metrik grafik">
          {METRICS.map((m) => {
            const on = m.key === metricKey;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={on}
                className={`dp-metric-pill${on ? " is-on" : ""}`}
                style={
                  on
                    ? {
                        borderColor: m.accent,
                        backgroundColor: m.softBg,
                        color: m.accent,
                      }
                    : undefined
                }
                onClick={(e) => {
                  setMetricKey(m.key);
                  e.currentTarget.scrollIntoView({
                    behavior: "smooth",
                    inline: "nearest",
                    block: "nearest",
                  });
                }}
              >
                <i style={{ backgroundColor: m.accent }} aria-hidden="true" />
                {m.label}
              </button>
            );
          })}
        </div>

        {buckets.length > 0 && activeBucket && stats ? (
          <>
            <MetricReadout
              metric={activeMetric}
              bucket={activeBucket}
              stats={stats}
              targets={data.targets}
              targetKg={data.targetKg}
              today={data.today}
            />
            <TrendStudioChart
              metric={activeMetric}
              buckets={buckets}
              activeIdx={activeIdx}
              onSelectIdx={(idx) => {
                const target = buckets[idx];
                if (target) setSelected(target.representativeDate);
              }}
              targets={data.targets}
              targetKg={data.targetKg}
              today={data.today}
            />
            <p className="dp-scrub-tip">
              Ketuk atau geser grafik untuk melihat rincian tiap hari
            </p>
          </>
        ) : (
          <p className="dp-muted-copy">
            {logged.length === 0
              ? "Belum ada berat, makan, atau latihan tercatat."
              : `Tidak ada catatan di rentang ${spanDays(rangeFrom, rangeTo)} hari ini.`}
          </p>
        )}
      </section>

      {activeRow && (
        <SelectedDayCard
          row={activeRow}
          today={data.today}
          targets={data.targets}
          weeklyNotice={
            activeBucket?.isAggregated
              ? `Minggu ${shortDate(activeBucket.startDate)} – ${shortDate(activeBucket.endDate)} · catatan terbaru`
              : null
          }
        />
      )}

      {rangedNewestFirst.length > 0 && (
        <div className="dp-history-wrap">
          <button
            type="button"
            className="dp-history-btn"
            aria-expanded={showDays}
            onClick={() => setShowDays((open) => !open)}
          >
            {showDays
              ? "Tutup riwayat harian"
              : `Lihat daftar harian (${rangedNewestFirst.length})`}
          </button>
          {showDays && (
            <ul className="dp-days">
              {rangedNewestFirst.map((r) => (
                <li
                  key={r.date}
                  className={r.date === activeRow?.date ? "is-on" : undefined}
                >
                  <button
                    type="button"
                    className="dp-day-pick"
                    onClick={() => setSelected(r.date)}
                  >
                    <div className="dp-day-top">
                      <strong>{dayListLabel(r.date, data.today)}</strong>
                      <span>
                        {r.weightKg !== null
                          ? `${kg(r.weightKg)} kg${formatWeighTime(r.weighedAt) ? ` · ${formatWeighTime(r.weighedAt)}` : ""}`
                          : "—"}
                      </span>
                    </div>
                    <div className="dp-stats">
                      <span>
                        <b>{r.kcalIn > 0 ? n0(r.kcalIn) : "—"}</b> kkal
                      </span>
                      <span>
                        <b>{r.proteinG > 0 ? n0(r.proteinG) : "—"}</b> g protein
                      </span>
                      <span>
                        <b>{r.fatG > 0 ? n0(r.fatG) : "—"}</b> g lemak
                      </span>
                      {r.sugarG > 0 && (
                        <span>
                          <b>{kg(r.sugarG, 1).replace(/,0$/, "")}</b> g gula
                        </span>
                      )}
                      <span>
                        <b>
                          {r.deficitKcal === null
                            ? "—"
                            : `${r.deficitKcal >= 0 ? "+" : "−"}${n0(Math.abs(r.deficitKcal))}`}
                        </b>{" "}
                        {r.deficitKcal !== null && r.deficitKcal < 0
                          ? "surplus"
                          : "defisit"}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
