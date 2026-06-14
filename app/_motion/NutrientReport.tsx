"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AnimatedNumber from "./AnimatedNumber";
import type { NutrientKind } from "@/lib/nutritionTargets";
import { suggestForNutrient, suggestKeyForRow } from "@/lib/nutrientSuggest";

export type NutrientRow = {
  key: string;
  label: string;
  short: string; // 3-letter for the chart axis
  value: number;
  target: number;
  unit: string;
  kind: NutrientKind;
  dp: number;
};

function pctOf(r: NutrientRow): number {
  if (r.target <= 0) return 0;
  return (r.value / r.target) * 100;
}

/**
 * Apple-Health-style achievement report:
 *  - Hero area chart: every "hit" nutrient plotted as % of its target, with a
 *    dashed 100% reference line. The area gets a gold gradient; points that
 *    clear 100% glow — so a line sitting at/above the reference across the
 *    board = "maxed everything."
 *  - Detail rows: every nutrient (hit + cap) with exact value/target and a
 *    fill bar that turns gradient-gold when a hit-target is reached, or red
 *    when a cap is exceeded.
 *  - Bonus tags earned today (omega-3, beta-glucan, B12, choline, …).
 */
export default function NutrientReport({
  rows,
  tags,
  streak = 0,
}: {
  rows: NutrientRow[];
  tags: string[];
  streak?: number;
}) {
  const hitRows = rows.filter((r) => r.kind === "hit");

  const chartData = useMemo(
    () =>
      hitRows.map((r) => ({
        name: r.short,
        label: r.label,
        pct: Math.min(150, Math.round(pctOf(r))),
        raw: pctOf(r),
      })),
    [hitRows]
  );

  const maxedCount = hitRows.filter((r) => pctOf(r) >= 100).length;
  const allMaxed = hitRows.length > 0 && maxedCount === hitRows.length;

  // Animate the area in on mount (recharts handles its own draw; we fade the
  // wrapper so it feels coordinated with the rest of the page).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="nr">
      <div className="nr-head">
        <span className="nr-title mono">
          NUTRIENT TARGETS
          {streak >= 2 && (
            <span className="nr-streak mono" title="Consecutive days hitting ≥80% of targets">
              · <AnimatedNumber value={streak} />D STREAK 🔥
            </span>
          )}
        </span>
        <span className={`nr-score mono${allMaxed ? " maxed" : ""}`}>
          <AnimatedNumber value={maxedCount} />/{hitRows.length} MAXED
        </span>
      </div>

      <div
        className="nr-chart"
        style={{ opacity: shown ? 1 : 0, transition: "opacity var(--dur-slow) var(--ease-out)" }}
      >
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={chartData} margin={{ top: 14, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="nrFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8ff47" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#e8ff47" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="nrStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#47ffb8" />
                <stop offset="100%" stopColor="#e8ff47" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              stroke="#333"
              tick={{ fill: "#888", fontSize: 9, fontFamily: "var(--font-dm-mono), monospace" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              stroke="#333"
              tick={{ fill: "#555", fontSize: 9, fontFamily: "var(--font-dm-mono), monospace" }}
              axisLine={false}
              tickLine={false}
              domain={[0, 150]}
              ticks={[0, 100, 150]}
              tickFormatter={(v) => `${v}%`}
              width={42}
            />
            <ReferenceLine
              y={100}
              stroke="#47ffb8"
              strokeDasharray="3 4"
              strokeOpacity={0.6}
              label={{
                value: "TARGET",
                position: "right",
                fill: "#47ffb8",
                fontSize: 8,
                fontFamily: "var(--font-dm-mono), monospace",
              }}
            />
            <Tooltip
              cursor={{ stroke: "#e8ff47", strokeDasharray: "2 4", strokeOpacity: 0.3 }}
              contentStyle={{
                background: "#111",
                border: "1px solid #222",
                borderRadius: 8,
                fontFamily: "var(--font-dm-mono), monospace",
                fontSize: 11,
                padding: "6px 9px",
              }}
              labelStyle={{ color: "#f0f0f0", fontSize: 10, letterSpacing: 1 }}
              formatter={(value: unknown, _n: unknown, ctx: { payload?: { label?: string } }) => {
                const v = typeof value === "number" ? value : 0;
                return [`${v}%`, ctx?.payload?.label ?? ""];
              }}
            />
            <Area
              type="monotone"
              dataKey="pct"
              stroke="url(#nrStroke)"
              strokeWidth={2}
              fill="url(#nrFill)"
              isAnimationActive
              animationDuration={700}
              dot={(props: { cx?: number; cy?: number; payload?: { raw?: number } }) => {
                const { cx, cy, payload } = props;
                if (cx == null || cy == null) return <g />;
                const hit = (payload?.raw ?? 0) >= 100;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={hit ? 4 : 2.5}
                    fill={hit ? "#e8ff47" : "#0a0a0a"}
                    stroke={hit ? "#e8ff47" : "#47ffb8"}
                    strokeWidth={1.5}
                    style={hit ? { filter: "drop-shadow(0 0 5px rgba(232,255,71,0.8))" } : undefined}
                  />
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="nr-rows">
        {rows.map((r, i) => {
          const pct = pctOf(r);
          const ratio = Math.min(1.5, pct / 100);
          const hitGood = r.kind === "hit" && pct >= 100;
          const capBad = r.kind === "cap" && pct > 100;
          const cls = hitGood ? "maxed" : capBad ? "over" : "";

          // Suggestions for unmet hit-target rows only — find the top
          // foods that would close the gap with the smallest portion.
          const suggKey = !hitGood && r.kind === "hit" ? suggestKeyForRow(r.key) : null;
          const gap = suggKey ? Math.max(0, r.target - r.value) : 0;
          const suggestions = suggKey && gap > 0
            ? suggestForNutrient(suggKey, gap, { limit: 3 })
            : [];

          return (
            <div
              key={r.key}
              className={`nr-row stagger-item ${cls}`}
              style={{ ["--i" as string]: i } as CSSProperties}
            >
              <div className="nr-row-head mono">
                <span className="nr-row-label">
                  {r.label}
                  {hitGood ? " ★" : ""}
                  {capBad ? " ⚠" : ""}
                </span>
                <span className="nr-row-val tnum">
                  <AnimatedNumber value={r.value} decimals={r.dp} />
                  <span className="nr-row-target">
                    {" "}/ {r.target.toLocaleString()}
                    {r.unit}
                  </span>
                </span>
              </div>
              <div className="nr-row-track">
                <div
                  className="nr-row-fill"
                  style={{ ["--p" as string]: Math.min(1, ratio) } as CSSProperties}
                />
              </div>
              {suggestions.length > 0 && (
                <div className="nr-row-suggest mono">
                  <span className="nr-row-suggest-label">EAT NEXT</span>
                  {suggestions.map((s) => (
                    <span key={s.id} className="nr-suggest-pill" title={s.unit}>
                      <span className="nr-suggest-qty">×{s.qty}</span>
                      <span className="nr-suggest-name">{s.name}</span>
                      <span className="nr-suggest-amt">
                        +{s.contributes}
                        {r.unit}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tags.length > 0 && (
        <div className="nr-tags">
          <span className="nr-tags-label mono">BONUS TODAY</span>
          <div className="nr-tags-list">
            {tags.map((t) => (
              <span key={t} className="nr-tag mono stagger-item">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
