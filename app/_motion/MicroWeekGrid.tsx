"use client";

import { useMemo, type CSSProperties } from "react";

export type MicroDay = {
  /** YYYY-MM-DD */
  date: string;
  /** Day-of-week 1-char (M T W T F S S). */
  letter: string;
  values: Record<string, number>;
};

export type MicroSeriesDef = {
  key: string;
  label: string;
  short: string;
  unit: string;
  target: number;
  kind: "hit" | "cap";
  color: string;
};

type Props = {
  days: MicroDay[]; // ordered Mon → Sun
  series: MicroSeriesDef[];
};

/**
 * Compact 7-day grid: one row per nutrient, 7 day-cells per row, each cell's
 * fill darkens with progress and turns gold the moment that day hit target.
 * "Maxed" badge per row counts how many of the 7 days hit. Built for
 * info-density — meant to live under the WeeklyGraph on /dashboard/week.
 */
export default function MicroWeekGrid({ days, series }: Props) {
  const rows = useMemo(() => {
    return series.map((s) => {
      const cells = days.map((d) => {
        const value = d.values[s.key] ?? 0;
        const ratio = s.target > 0 ? value / s.target : 0;
        const hit = s.kind === "hit" ? ratio >= 1 : ratio <= 1;
        return {
          date: d.date,
          letter: d.letter,
          value,
          ratio: Math.min(1.4, ratio),
          hit,
        };
      });
      const maxed = cells.filter((c) => c.hit).length;
      return { series: s, cells, maxed };
    });
  }, [days, series]);

  return (
    <section className="mwg">
      <div className="mwg-head">
        <span className="mwg-title mono">7-DAY NUTRIENT GRID</span>
        <span className="mwg-legend mono">↑ HIT · ↓ CAP</span>
      </div>
      <div className="mwg-day-row mono">
        <span className="mwg-row-label" />
        {days.map((d) => (
          <span key={d.date} className="mwg-day-letter">
            {d.letter}
          </span>
        ))}
        <span className="mwg-row-trail" />
      </div>
      {rows.map((row, ri) => (
        <div
          key={row.series.key}
          className="mwg-row stagger-item"
          style={{ ["--i" as string]: ri } as CSSProperties}
        >
          <span className="mwg-row-label mono">
            {row.series.short}
            <span className="mwg-row-kind">{row.series.kind === "hit" ? "↑" : "↓"}</span>
          </span>
          {row.cells.map((c) => {
            const tooltip = `${c.letter} · ${Math.round(c.value)}${row.series.unit} (${Math.round(c.ratio * 100)}%)`;
            return (
              <span
                key={c.date}
                className={`mwg-cell${c.hit ? " hit" : ""}`}
                title={tooltip}
                aria-label={tooltip}
              >
                <span
                  className="mwg-cell-fill"
                  style={
                    {
                      ["--p" as string]: Math.min(1, c.ratio),
                      background: c.hit ? row.series.color : undefined,
                    } as CSSProperties
                  }
                />
              </span>
            );
          })}
          <span className={`mwg-row-trail mono${row.maxed === 7 ? " full" : ""}`}>
            {row.maxed}/7
          </span>
        </div>
      ))}
    </section>
  );
}
