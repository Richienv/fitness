"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import {
  readProgressInsights,
  type ProgressInsightsData,
} from "@/lib/progressAnalyticsData";
import type { DailyProgressRow } from "@/lib/progressAnalytics";
import "./day-progress.css";

const kg = (n: number, d = 1) =>
  n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const n0 = (n: number) => Math.round(n).toLocaleString("id-ID");

function dayLabel(date: string, today: string): string {
  if (date === today) return "Hari ini";
  const yday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (date === yday) return "Kemarin";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const SERIES = [
  { key: "kcalIn" as const, label: "Makan", unit: "kkal", color: "#3e60d5" },
  { key: "proteinG" as const, label: "Protein", unit: "g", color: "#2f8a5b" },
  { key: "totalBurnKcal" as const, label: "Bakar", unit: "kkal", color: "#e07a2f" },
];

const CHART = { w: 320, h: 168, padX: 12, padY: 16 };

function seriesMax(days: DailyProgressRow[], key: (typeof SERIES)[number]["key"]) {
  return Math.max(1, ...days.map((d) => d[key]));
}

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function clampDate(date: string, min: string, max: string) {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function spanDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
}

function xForDate(date: string, from: string, to: string) {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  const innerW = CHART.w - CHART.padX * 2;
  if (end <= start) return CHART.w / 2;
  const t = Date.parse(`${date}T12:00:00Z`);
  return CHART.padX + ((t - start) / (end - start)) * innerW;
}

function axisLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function coords(
  days: DailyProgressRow[],
  key: (typeof SERIES)[number]["key"],
  from: string,
  to: string,
  ceiling?: number,
) {
  const max = ceiling ?? seriesMax(days, key);
  const innerH = CHART.h - CHART.padY * 2;
  return days.map((d) => ({
    x: xForDate(d.date, from, to),
    y: CHART.padY + innerH - (d[key] / max) * innerH,
  }));
}

function TrendChart({
  days,
  today,
  from,
  to,
  selected,
  onSelect,
}: {
  days: DailyProgressRow[];
  today: string;
  from: string;
  to: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < SERIES.length - 1) next.add(key);
      return next;
    });
  };
  const plotted = useMemo(() => {
    const kcalKeys = (["kcalIn", "totalBurnKcal"] as const).filter((key) => !hidden.has(key));
    const kcalMax = kcalKeys.length
      ? Math.max(...kcalKeys.map((key) => seriesMax(days, key)))
      : 1;
    return SERIES.filter((s) => !hidden.has(s.key)).map((s) => ({
      ...s,
      pts: coords(days, s.key, from, to, s.key === "proteinG" ? undefined : kcalMax),
    }));
  }, [days, hidden, from, to]);
  const showProteinNote = plotted.some((s) => s.key === "proteinG") && plotted.length > 1;
  const span = spanDays(from, to);
  const mid = shiftDate(from, Math.floor((span - 1) / 2));
  const ticks = from === to ? [from] : span <= 4 ? [from, to] : [from, mid, to];
  return (
    <figure className="dp-chart">
      <figcaption className="dp-legend">
        {SERIES.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              className={off ? "is-off" : undefined}
              aria-pressed={!off}
              onClick={() => toggle(s.key)}
            >
              <i style={{ background: off ? "#c5c9d4" : s.color }} />
              {s.label}
            </button>
          );
        })}
        {showProteinNote && <small>Protein skala gram sendiri</small>}
      </figcaption>
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} role="img" aria-label="Grafik makan, protein, dan kalori terbakar">
        {[0.25, 0.5, 0.75].map((g) => {
          const y = CHART.padY + (CHART.h - CHART.padY * 2) * (1 - g);
          return (
            <line
              key={g}
              x1={CHART.padX}
              x2={CHART.w - CHART.padX}
              y1={y}
              y2={y}
              className="dp-grid"
            />
          );
        })}
        {plotted.map((s) => (
          <polyline
            key={s.key}
            points={s.pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {days.map((d, i) => {
          const on = d.date === selected;
          const x = xForDate(d.date, from, to);
          const neighbors = days
            .filter((other) => other.date !== d.date)
            .map((other) => Math.abs(xForDate(other.date, from, to) - x));
          const gap = neighbors.length ? Math.min(...neighbors) : 36;
          const hit = Math.max(14, Math.min(28, gap * 0.85));
          return (
            <g
              key={d.date}
              role="button"
              tabIndex={0}
              aria-label={dayLabel(d.date, today)}
              aria-pressed={on}
              className="dp-hit"
              onClick={() => onSelect(d.date)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(d.date);
                }
              }}
            >
              {on && (
                <line
                  x1={x}
                  x2={x}
                  y1={CHART.padY}
                  y2={CHART.h - CHART.padY}
                  className="dp-guide"
                />
              )}
              <rect
                x={x - hit / 2}
                y={8}
                width={hit}
                height={CHART.h - 16}
                fill="transparent"
              />
              {plotted.map((s) => (
                <circle
                  key={s.key}
                  cx={s.pts[i].x}
                  cy={s.pts[i].y}
                  r={on ? 4.5 : 3}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth={on ? 2 : 1.2}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="dp-axis">
        {ticks.map((date) => (
          <span key={date} style={{ left: `${(xForDate(date, from, to) / CHART.w) * 100}%` }}>
            {axisLabel(date)}
          </span>
        ))}
      </div>
    </figure>
  );
}

function DayBreakdown({ row, today }: { row: DailyProgressRow; today: string }) {
  const deficit =
    row.deficitKcal === null
      ? "—"
      : `${row.deficitKcal >= 0 ? "−" : "+"}${n0(Math.abs(row.deficitKcal))} kkal`;
  return (
    <div className="dp-break" aria-live="polite">
      <div className="dp-day-top">
        <strong>{dayLabel(row.date, today)}</strong>
        <span>{row.weightKg !== null ? `${kg(row.weightKg)} kg` : "—"}</span>
      </div>
      <dl>
        <div>
          <dt>Makan</dt>
          <dd>{n0(row.kcalIn)} kkal</dd>
        </div>
        <div>
          <dt>Protein</dt>
          <dd>{n0(row.proteinG)} g</dd>
        </div>
        <div>
          <dt>Bakar</dt>
          <dd>{n0(row.totalBurnKcal)} kkal</dd>
        </div>
        <div>
          <dt>Olahraga</dt>
          <dd>{n0(row.activeBurnKcal)} kkal</dd>
        </div>
        <div>
          <dt>Karbo</dt>
          <dd>{n0(row.carbsG)} g</dd>
        </div>
        <div>
          <dt>Lemak</dt>
          <dd>{n0(row.fatG)} g</dd>
        </div>
        <div>
          <dt>Selisih</dt>
          <dd>{deficit}</dd>
        </div>
        <div>
          <dt>Air</dt>
          <dd>{row.waterMl > 0 ? `${kg(row.waterMl / 1000, 1)} L` : "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function DayProgress() {
  const { data: session } = useSession();
  const [data, setData] = useState<ProgressInsightsData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showDays, setShowDays] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
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
  if (!data) return null;
  const { projection: p, rows, today } = data;
  const logged = rows.filter(
    (r) => r.mealCount > 0 || r.weightKg !== null || r.workoutCount > 0 || r.waterMl > 0,
  );
  const earliest = logged.at(-1)?.date ?? today;
  const latest = logged[0]?.date ?? today;
  const rangeTo = clampDate(to ?? latest, earliest, latest);
  const rangeFrom = clampDate(from ?? earliest, earliest, rangeTo);
  const ranged = logged.filter((r) => r.date >= rangeFrom && r.date <= rangeTo);
  const chartDays = [...ranged].reverse();
  const span = spanDays(rangeFrom, rangeTo);
  const preset =
    rangeFrom === earliest && rangeTo === latest
      ? "all"
      : rangeTo === latest && (span === 7 || span === 14 || span === 30)
        ? String(span)
        : "";
  const setRange = (start: string, end: string) => {
    const nextTo = clampDate(end, earliest, latest);
    const nextFrom = clampDate(start, earliest, nextTo);
    setFrom(nextFrom);
    setTo(nextTo);
  };
  const activeDate = chartDays.some((d) => d.date === selected)
    ? selected
    : chartDays.at(-1)?.date ?? null;
  const active = chartDays.find((d) => d.date === activeDate) ?? null;
  return (
    <section className="dp" aria-labelledby="dp-title">
      <div className="dp-head">
        <h2 id="dp-title">Hari per hari</h2>
        <span>{logged.length} hari tercatat</span>
      </div>
      {p ? (
        <div className="dp-forecast">
          <p>
            Kalau {p.sampleDays} hari terakhir berulang:{" "}
            <strong className={p.trend === "losing" ? "down" : p.trend === "gaining" ? "up" : ""}>
              {p.weeklyKgChange > 0 ? "+" : "−"}
              {kg(Math.abs(p.weeklyKgChange), 2)} kg/minggu
            </strong>
            <small>
              {" "}
              · rata-rata {n0(p.avgKcalIn)} kkal makan, {n0(p.avgProteinG)} g protein,{" "}
              {n0(p.avgBurnKcal)} kkal bakar
              {p.avgDeficitKcal >= 0
                ? `, defisit ${n0(p.avgDeficitKcal)}`
                : `, surplus ${n0(-p.avgDeficitKcal)}`}
            </small>
          </p>
          <ol>
            {[
              ["14 hari", p.projected14d],
              ["30 hari", p.projected30d],
              ["60 hari", p.projected60d],
              ["90 hari", p.projected90d],
            ].map(([label, value]) => (
              <li key={String(label)}>
                <span>{label}</span>
                <strong>{kg(Number(value))} kg</strong>
              </li>
            ))}
          </ol>
          {p.daysToTarget !== null && p.targetKg !== null && (
            <p className="dp-goal">
              Menuju {kg(p.targetKg)} kg sekitar {p.daysToTarget} hari
              {p.targetDate ? ` (${p.targetDate.split("-").reverse().join("/")})` : ""}.
            </p>
          )}
        </div>
      ) : (
        <p className="dp-empty">
          Catat makan beberapa hari supaya prediksi “kalau gini terus” bisa dihitung.
        </p>
      )}
      {logged.length > 0 && (
        <div className="dp-range">
          <div className="dp-presets" role="group" aria-label="Durasi">
            {(
              [
                ["7", 7],
                ["14", 14],
                ["30", 30],
                ["all", 0],
              ] as const
            ).map(([id, days]) => (
              <button
                key={id}
                type="button"
                className={preset === id ? "is-on" : undefined}
                aria-pressed={preset === id}
                onClick={() =>
                  setRange(id === "all" ? earliest : shiftDate(latest, 1 - days), latest)
                }
              >
                {id === "all" ? "Semua" : `${days} hari`}
              </button>
            ))}
          </div>
          <div className="dp-dates">
            <label>
              Dari
              <input
                type="date"
                min={earliest}
                max={rangeTo}
                value={rangeFrom}
                onChange={(e) => e.target.value && setRange(e.target.value, rangeTo)}
              />
            </label>
            <label>
              Sampai
              <input
                type="date"
                min={rangeFrom}
                max={latest}
                value={rangeTo}
                onChange={(e) => e.target.value && setRange(rangeFrom, e.target.value)}
              />
            </label>
          </div>
        </div>
      )}
      {chartDays.length > 0 && (
        <>
          <TrendChart
            days={chartDays}
            today={today}
            from={rangeFrom}
            to={rangeTo}
            selected={activeDate ?? ""}
            onSelect={setSelected}
          />
          {active && <DayBreakdown row={active} today={today} />}
        </>
      )}
      {logged.length > 0 && chartDays.length === 0 && (
        <p className="dp-empty">Tidak ada catatan di rentang ini.</p>
      )}
      {logged.length === 0 ? (
        <p className="dp-empty">Belum ada berat, makan, atau latihan tercatat.</p>
      ) : (
        <>
          <button
            type="button"
            className="dp-detail"
            aria-expanded={showDays}
            onClick={() => setShowDays((open) => !open)}
          >
            {showDays ? "Tutup detail" : "Detail"}
          </button>
          {showDays && (
        <ul className="dp-days">
          {ranged.map((r) => (
            <li key={r.date} className={r.date === activeDate ? "is-on" : undefined}>
              <div className="dp-day-top">
                <strong>{dayLabel(r.date, today)}</strong>
                <span>{r.weightKg !== null ? `${kg(r.weightKg)} kg` : "—"}</span>
              </div>
              <div className="dp-stats">
                <span>
                  <b>{r.kcalIn > 0 ? n0(r.kcalIn) : "—"}</b> kkal
                </span>
                <span>
                  <b>{r.proteinG > 0 ? n0(r.proteinG) : "—"}</b> g protein
                </span>
                <span>
                  <b>{r.totalBurnKcal > 0 ? n0(r.totalBurnKcal) : "—"}</b> bakar
                </span>
                <span>
                  <b>
                    {r.deficitKcal === null
                      ? "—"
                      : `${r.deficitKcal >= 0 ? "−" : "+"}${n0(Math.abs(r.deficitKcal))}`}
                  </b>{" "}
                  selisih
                </span>
                {r.waterMl > 0 && (
                  <span>
                    <b>{kg(r.waterMl / 1000, 1)}</b> L air
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
          )}
        </>
      )}
    </section>
  );
}
