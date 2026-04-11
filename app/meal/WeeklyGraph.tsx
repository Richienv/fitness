"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { macrosFor, type Macros } from "@/lib/ingredients";
import { getDaily, isCustomItem, type MealLog } from "@/lib/store";
import { TARGETS } from "@/lib/targets";

type Metric = "kcal" | "protein" | "carbs" | "fat";

const METRICS: { key: Metric; label: string; color: string; unit: string }[] = [
  { key: "kcal",    label: "CALORIES", color: "#e8ff47", unit: "kcal" },
  { key: "protein", label: "PROTEIN",  color: "#47ffb8", unit: "g" },
  { key: "carbs",   label: "CARBS",    color: "#ffffff", unit: "g" },
  { key: "fat",     label: "FAT",      color: "#888888", unit: "g" },
];

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function mondayOf(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function sumMeal(meal: MealLog): Macros {
  return meal.items.reduce<Macros>(
    (acc, it) => {
      if (isCustomItem(it)) {
        return {
          kcal: acc.kcal + it.kcal,
          protein: acc.protein + it.protein,
          fat: acc.fat + it.fat,
          carbs: acc.carbs + it.carbs,
        };
      }
      const m = macrosFor(it.id, it.qty);
      return {
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        fat: acc.fat + m.fat,
        carbs: acc.carbs + m.carbs,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

type Point = {
  day: string;
  date: string;
  dateShort: string;
  isToday: boolean;
  isFuture: boolean;
  hasData: boolean;
  gymDay: boolean;
  targetKcal: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  target: number;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

type WeekAverages = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  loggedDays: number;
};

export default function WeeklyGraph({
  meals,
  now,
}: {
  meals: MealLog[];
  now: Date | null;
}) {
  const [metric, setMetric] = useState<Metric>("kcal");

  const { points, averages, todayIdx } = useMemo(() => {
    if (!now) {
      return {
        points: [] as Point[],
        averages: { kcal: 0, protein: 0, carbs: 0, fat: 0, loggedDays: 0 } as WeekAverages,
        todayIdx: -1,
      };
    }
    const monday = mondayOf(now);
    const todayStr = dateKey(now);
    let todayI = -1;
    const perDay: Point[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = dateKey(d);
      const isToday = key === todayStr;
      if (isToday) todayI = i;
      const isFuture = d.getTime() > now.getTime() && !isToday;
      const dayMeals = meals.filter((m) => m.date === key);
      const hasData = dayMeals.length > 0;
      const totals = dayMeals.reduce<Macros>(
        (acc, m) => {
          const t = sumMeal(m);
          return {
            kcal: acc.kcal + t.kcal,
            protein: acc.protein + t.protein,
            carbs: acc.carbs + t.carbs,
            fat: acc.fat + t.fat,
          };
        },
        { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      );
      const dayFlags = getDaily(key);
      const t = dayFlags.gymDay ? TARGETS.gymDay : TARGETS.restDay;
      perDay.push({
        day: DAY_LABELS[i],
        date: key,
        dateShort: `${d.getDate()} ${d.toLocaleString("en", { month: "short" }).toUpperCase()}`,
        isToday,
        isFuture,
        hasData,
        gymDay: dayFlags.gymDay,
        targetKcal: t.kcal,
        targetProtein: t.protein,
        targetCarbs: t.carbs,
        targetFat: t.fat,
        target: t[metric],
        kcal: hasData ? Math.round(totals.kcal) : null,
        protein: hasData ? Math.round(totals.protein) : null,
        carbs: hasData ? Math.round(totals.carbs) : null,
        fat: hasData ? Math.round(totals.fat) : null,
      });
    }

    const dataDays = perDay.filter((p) => p.hasData);
    const n = dataDays.length;
    const avg: WeekAverages = {
      kcal: n ? Math.round(dataDays.reduce((a, p) => a + (p.kcal ?? 0), 0) / n) : 0,
      protein: n ? Math.round(dataDays.reduce((a, p) => a + (p.protein ?? 0), 0) / n) : 0,
      carbs: n ? Math.round(dataDays.reduce((a, p) => a + (p.carbs ?? 0), 0) / n) : 0,
      fat: n ? Math.round(dataDays.reduce((a, p) => a + (p.fat ?? 0), 0) / n) : 0,
      loggedDays: n,
    };

    return { points: perDay, averages: avg, todayIdx: todayI };
  }, [meals, now, metric]);

  const active = METRICS.find((m) => m.key === metric)!;
  const hasAny = points.some((p) => p.hasData);

  // Compute a y-axis max that fits both data and target
  const yMax = useMemo(() => {
    let max = 0;
    for (const p of points) {
      const v = p[metric] ?? 0;
      if (v > max) max = v;
      if (p.target > max) max = p.target;
    }
    if (max === 0) return metric === "kcal" ? 2500 : 200;
    // round up to nice step
    const step = metric === "kcal" ? 500 : metric === "protein" ? 25 : 25;
    return Math.ceil((max * 1.1) / step) * step;
  }, [points, metric]);

  return (
    <div className="wg">
      <div className="wg-tabs">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`wg-tab${metric === m.key ? " active" : ""}`}
            onClick={() => setMetric(m.key)}
            style={metric === m.key ? { color: m.color, borderBottomColor: m.color } : undefined}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="wg-chart">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={points} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="#ffffff08" vertical={false} />
            <XAxis
              dataKey="day"
              stroke="#444444"
              tick={{ fill: "#666666", fontSize: 10, fontFamily: "var(--font-dm-mono), monospace" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="#444444"
              tick={{ fill: "#666666", fontSize: 10, fontFamily: "var(--font-dm-mono), monospace" }}
              axisLine={false}
              tickLine={false}
              width={44}
              domain={[0, yMax]}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: active.color, strokeDasharray: "2 4", strokeOpacity: 0.4 }}
              contentStyle={{
                background: "#111111",
                border: "1px solid #222222",
                borderRadius: 8,
                fontFamily: "var(--font-dm-mono), monospace",
                fontSize: 11,
                padding: "8px 10px",
              }}
              labelStyle={{ color: "#f0f0f0", fontSize: 10, letterSpacing: 1 }}
              itemStyle={{ color: active.color }}
              formatter={((value: unknown, _name: unknown, ctx: { payload?: Point }) => {
                const p = ctx?.payload;
                const v = typeof value === "number" ? value : null;
                if (v == null || !p) return ["—", active.label];
                const pct = Math.round((v / p.target) * 100);
                const tag = p.gymDay ? "GYM" : "REST";
                return [`${v.toLocaleString()} ${active.unit} · ${pct}% (${tag})`, active.label];
              }) as never}
              labelFormatter={((_: unknown, payload: Array<{ payload: Point }>) => {
                const p = payload && payload[0] ? payload[0].payload : null;
                return p ? `${p.day} · ${p.dateShort}` : "";
              }) as never}
            />
            {/* Per-day target step line */}
            <Line
              type="stepAfter"
              dataKey="target"
              stroke={active.color}
              strokeDasharray="4 4"
              strokeOpacity={0.35}
              strokeWidth={1}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            {/* Actual data line */}
            <Line
              type="monotone"
              dataKey={metric}
              stroke={active.color}
              strokeWidth={2}
              connectNulls={false}
              dot={(props) => {
                const { cx, cy, index, payload } = props as {
                  cx: number; cy: number; index: number; payload: Point;
                };
                if (cx == null || cy == null) return <g />;
                const isToday = index === todayIdx;
                const hasData = payload.hasData;
                if (!hasData) {
                  // Only draw empty outline dots for past days (not future)
                  if (payload.isFuture) return <g />;
                  return (
                    <circle
                      key={`d-${index}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill="#0a0a0a"
                      stroke={active.color}
                      strokeOpacity={0.35}
                      strokeWidth={1.5}
                    />
                  );
                }
                return (
                  <circle
                    key={`d-${index}`}
                    cx={cx}
                    cy={cy}
                    r={isToday ? 6 : 4}
                    fill={active.color}
                    stroke="#0a0a0a"
                    strokeWidth={2}
                  >
                    {isToday && (
                      <animate
                        attributeName="r"
                        values="6;8;6"
                        dur="1.6s"
                        repeatCount="indefinite"
                      />
                    )}
                  </circle>
                );
              }}
              activeDot={{ r: 7, fill: active.color, stroke: "#0a0a0a", strokeWidth: 2 }}
              isAnimationActive
              animationDuration={800}
              animationEasing="ease-in-out"
            />
          </LineChart>
        </ResponsiveContainer>

        {!hasAny && (
          <div className="wg-empty">Start logging to see your weekly trend</div>
        )}
      </div>

      <div className="wg-summary">
        <div className="wg-summary-main">
          THIS WEEK AVG:{" "}
          <span style={{ color: "#e8ff47" }}>{averages.kcal.toLocaleString()} kcal</span>
          <span className="wg-dot">·</span>
          <span style={{ color: "#47ffb8" }}>{averages.protein}g protein</span>
        </div>
        <div className="wg-summary-sub">
          {averages.loggedDays} {averages.loggedDays === 1 ? "day" : "days"} logged
        </div>
      </div>
    </div>
  );
}
