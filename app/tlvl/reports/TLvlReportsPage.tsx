"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useActiveDate, addDays } from "@/lib/activeDate";
import {
  computeTLvlRange,
  rangeSummary,
  TLVL_CEILING,
  TLVL_FLOOR,
  type TLvlBreakdown,
} from "@/lib/tlvl";

function fmtDelta(n: number, digits = 1): string {
  const rounded = Math.abs(n) < 10 ** -digits ? 0 : n;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "" : "±";
  return `${sign}${rounded.toFixed(digits)}`;
}

function deltaClass(n: number): string {
  if (n > 0.05) return "up";
  if (n < -0.05) return "down";
  return "flat";
}

export default function TLvlReportsPage() {
  const { activeDate } = useActiveDate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const weekly = useMemo(() => {
    if (!ready || !activeDate) return null;
    const from = addDays(activeDate, -6);
    const prevFrom = addDays(activeDate, -13);
    const prevTo = addDays(activeDate, -7);
    const cur = computeTLvlRange(from, activeDate);
    const prev = computeTLvlRange(prevFrom, prevTo);
    return { cur, summary: rangeSummary(cur, prev) };
  }, [ready, activeDate]);

  const monthly = useMemo(() => {
    if (!ready || !activeDate) return null;
    const from = addDays(activeDate, -29);
    const prevFrom = addDays(activeDate, -59);
    const prevTo = addDays(activeDate, -30);
    const cur = computeTLvlRange(from, activeDate);
    const prev = computeTLvlRange(prevFrom, prevTo);
    return { cur, summary: rangeSummary(cur, prev) };
  }, [ready, activeDate]);

  return (
    <main className="sub-page tlvl-page">
      <header className="sub-head">
        <Link href="/tlvl" className="sub-back">← T-LVL</Link>
        <div className="sub-title">REPORTS</div>
        <div className="sub-sub mono">7-DAY · 30-DAY</div>
      </header>

      <div className="tlvl-scroll">
        {weekly && (
          <ReportCard
            title="7-DAY REPORT"
            span={7}
            data={weekly.cur}
            summary={weekly.summary}
          />
        )}
        {monthly && (
          <ReportCard
            title="30-DAY REPORT"
            span={30}
            data={monthly.cur}
            summary={monthly.summary}
          />
        )}
        {!weekly && !monthly && (
          <div className="tlvl-disclaimer mono">Loading…</div>
        )}

        <div className="today-bottom-spacer" />
      </div>
    </main>
  );
}

function ReportCard({
  title,
  span,
  data,
  summary,
}: {
  title: string;
  span: number;
  data: TLvlBreakdown[];
  summary: ReturnType<typeof rangeSummary>;
}) {
  const max = Math.max(TLVL_CEILING, ...data.map((d) => d.score));
  const min = Math.min(TLVL_FLOOR, ...data.map((d) => d.score));
  const range = Math.max(1, max - min);
  return (
    <div className="tlvl-report">
      <div className="tlvl-report-head mono">{title}</div>
      <div className="tlvl-report-stats">
        <div className="tlvl-report-stat">
          <div className="tlvl-report-num">{Math.round(summary.avgScore)}</div>
          <div className="tlvl-report-sub mono">AVG SCORE</div>
        </div>
        <div className="tlvl-report-stat">
          <div className={`tlvl-report-num ${deltaClass(summary.deltaVsPrev)}`}>
            {fmtDelta(summary.deltaVsPrev, 1)}
          </div>
          <div className="tlvl-report-sub mono">VS PREV {span}</div>
        </div>
        <div className="tlvl-report-stat">
          <div className="tlvl-report-num">{summary.positiveStreak}</div>
          <div className="tlvl-report-sub mono">UP STREAK</div>
        </div>
      </div>
      <div className="tlvl-spark" role="img" aria-label={`${span}-day score sparkline`}>
        {data.map((d) => {
          const h = Math.max(4, Math.round(((d.score - min) / range) * 48));
          const tone = d.delta_pp >= 0 ? "up" : "down";
          return (
            <div
              key={d.date}
              className={`tlvl-spark-bar ${tone}`}
              style={{ height: `${h}px` }}
              title={`${d.date} · ${Math.round(d.score)}`}
            />
          );
        })}
      </div>
      {summary.topFactor && (
        <div className="tlvl-report-driver mono">
          Biggest driver:{" "}
          <strong className={deltaClass(summary.topFactor.totalPp)}>
            {summary.topFactor.label} {fmtDelta(summary.topFactor.totalPp, 1)} pp
          </strong>
        </div>
      )}
    </div>
  );
}
