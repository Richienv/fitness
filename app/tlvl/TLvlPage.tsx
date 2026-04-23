"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useActiveDate, addDays } from "@/lib/activeDate";
import {
  computeTLvl,
  computeTLvlRange,
  getTLvlInputs,
  rangeSummary,
  setTLvlInputs,
  TLVL_BASELINE,
  TLVL_CEILING,
  TLVL_FLOOR,
  type TLvlBreakdown,
} from "@/lib/tlvl";
import type { TLvlInputs } from "@/lib/store";

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

export default function TLvlPage() {
  const { activeDate, short, isToday, label } = useActiveDate();
  const [inputs, setInputsState] = useState<TLvlInputs>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!activeDate) return;
    setInputsState(getTLvlInputs(activeDate));
    setShowAdvanced(false);
  }, [activeDate]);

  function save(patch: Partial<TLvlInputs>) {
    if (!activeDate) return;
    const next = { ...inputs, ...patch };
    setInputsState(next);
    setTLvlInputs(activeDate, patch);
    setTick((t) => t + 1);
  }

  const today = useMemo<TLvlBreakdown | null>(() => {
    if (!activeDate) return null;
    return computeTLvl(activeDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, tick, inputs.sleepHours, inputs.stressLevel, inputs.alcohol, inputs.cardioMin]);

  const yesterday = useMemo<TLvlBreakdown | null>(() => {
    if (!activeDate) return null;
    const prev = addDays(activeDate, -1);
    return computeTLvl(prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, tick]);

  const weekly = useMemo(() => {
    if (!activeDate) return null;
    const from = addDays(activeDate, -6);
    const prevFrom = addDays(activeDate, -13);
    const prevTo = addDays(activeDate, -7);
    const cur = computeTLvlRange(from, activeDate);
    const prev = computeTLvlRange(prevFrom, prevTo);
    return { cur, summary: rangeSummary(cur, prev) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, tick]);

  const monthly = useMemo(() => {
    if (!activeDate) return null;
    const from = addDays(activeDate, -29);
    const prevFrom = addDays(activeDate, -59);
    const prevTo = addDays(activeDate, -30);
    const cur = computeTLvlRange(from, activeDate);
    const prev = computeTLvlRange(prevFrom, prevTo);
    return { cur, summary: rangeSummary(cur, prev) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, tick]);

  const score = today?.score ?? TLVL_BASELINE;
  const delta = today && yesterday ? score - yesterday.score : 0;
  const scoreColor =
    score >= 110 ? "#e8ff47" : score >= 100 ? "#47ffb8" : score >= 90 ? "#ffffff" : "#ff6b6b";

  function sleepStep(delta: number) {
    const cur = inputs.sleepHours ?? 7.5;
    const next = Math.max(0, Math.min(12, +(cur + delta).toFixed(1)));
    save({ sleepHours: next });
  }

  function clearSleep() {
    const next = { ...inputs };
    delete next.sleepHours;
    setInputsState(next);
    if (!activeDate) return;
    setTLvlInputs(activeDate, { sleepHours: undefined });
    setTick((t) => t + 1);
  }

  return (
    <main className="sub-page tlvl-page">
      <header className="sub-head">
        <Link href="/" className="sub-back">← HOME</Link>
        <div className="sub-title">T-LVL</div>
        <div className="sub-sub mono">{isToday ? label : short}</div>
      </header>

      <div className="tlvl-scroll">
        <div className="tlvl-score-card">
          <div className="tlvl-score-label mono">CURRENT SCORE</div>
          <div className="tlvl-score-num" style={{ color: scoreColor }}>
            {Math.round(score)}
          </div>
          <div className={`tlvl-score-delta mono ${deltaClass(delta)}`}>
            {delta >= 0 ? "▲" : "▼"} {fmtDelta(delta, 1)} pts vs yesterday
          </div>
          <div className="tlvl-score-range mono">
            BASELINE {TLVL_BASELINE} · {TLVL_FLOOR}–{TLVL_CEILING}
          </div>
        </div>

        <div className="tlvl-inputs">
          <div className="tlvl-block">
            <div className="tlvl-block-head">
              <span className="tlvl-block-label mono">SLEEP</span>
              {inputs.sleepHours !== undefined && (
                <button type="button" className="tlvl-clear mono" onClick={clearSleep}>
                  CLEAR
                </button>
              )}
            </div>
            <div className="tlvl-stepper">
              <button type="button" className="tlvl-step-btn" onClick={() => sleepStep(-0.5)}>−</button>
              <div className="tlvl-step-val">
                <span className="tlvl-step-num">
                  {inputs.sleepHours !== undefined ? inputs.sleepHours.toFixed(1) : "—"}
                </span>
                <span className="tlvl-step-unit mono">hours</span>
              </div>
              <button type="button" className="tlvl-step-btn" onClick={() => sleepStep(0.5)}>+</button>
            </div>
          </div>

          <div className="tlvl-block">
            <div className="tlvl-block-head">
              <span className="tlvl-block-label mono">STRESS</span>
              <span className="tlvl-block-hint mono">
                {inputs.stressLevel === undefined
                  ? "not set"
                  : inputs.stressLevel <= 3
                  ? "chill"
                  : inputs.stressLevel <= 5
                  ? "steady"
                  : inputs.stressLevel <= 7
                  ? "tense"
                  : "maxed"}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={inputs.stressLevel ?? 5}
              onChange={(e) => save({ stressLevel: Number(e.target.value) })}
              className="tlvl-range"
            />
            <div className="tlvl-range-ticks mono">
              <span>0</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          <button
            type="button"
            className={`cl-row${inputs.alcohol ? " checked" : ""} tlvl-alcohol`}
            onClick={() => save({ alcohol: !inputs.alcohol })}
          >
            <span className="cl-box">{inputs.alcohol ? "✓" : "□"}</span>
            <span className="cl-label">Alcohol today</span>
          </button>

          <button
            type="button"
            className="tlvl-advanced-toggle mono"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "− HIDE" : "+ MORE"} advanced
          </button>

          {showAdvanced && (
            <div className="tlvl-block">
              <div className="tlvl-block-head">
                <span className="tlvl-block-label mono">CARDIO MIN</span>
                <span className="tlvl-block-hint mono">penalty only &gt; 75 min</span>
              </div>
              <div className="tlvl-stepper">
                <button
                  type="button"
                  className="tlvl-step-btn"
                  onClick={() =>
                    save({ cardioMin: Math.max(0, (inputs.cardioMin ?? 0) - 5) })
                  }
                >
                  −
                </button>
                <div className="tlvl-step-val">
                  <span className="tlvl-step-num">{inputs.cardioMin ?? 0}</span>
                  <span className="tlvl-step-unit mono">min</span>
                </div>
                <button
                  type="button"
                  className="tlvl-step-btn"
                  onClick={() => save({ cardioMin: (inputs.cardioMin ?? 0) + 5 })}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {today && (
          <>
            <div className="tlvl-section-label mono">// TODAY&apos;S FACTORS</div>
            <div className="tlvl-factor-list">
              {today.factors.map((f) => {
                const cls = f.pp > 0 ? "up" : f.pp < 0 ? "down" : "flat";
                return (
                  <div key={f.key} className={`tlvl-factor ${cls}`}>
                    <div className="tlvl-factor-head">
                      <span className="tlvl-factor-label">{f.label}</span>
                      {f.auto && <span className="tlvl-factor-auto mono">AUTO</span>}
                      <span className={`tlvl-factor-pp mono ${cls}`}>{fmtDelta(f.pp, 1)} pp</span>
                    </div>
                    <div className="tlvl-factor-hint mono">{f.hint}</div>
                  </div>
                );
              })}
              <div className="tlvl-factor total">
                <div className="tlvl-factor-head">
                  <span className="tlvl-factor-label">TODAY TOTAL (capped ±4)</span>
                  <span className={`tlvl-factor-pp mono ${deltaClass(today.delta_pp)}`}>
                    {fmtDelta(today.delta_pp, 1)} pp
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {weekly && <ReportCard title="7-DAY REPORT" span={7} data={weekly.cur} summary={weekly.summary} />}
        {monthly && (
          <ReportCard title="30-DAY REPORT" span={30} data={monthly.cur} summary={monthly.summary} />
        )}

        <div className="tlvl-disclaimer mono">
          Behavior proxy — not a clinical measurement. Derived from logged sleep, stress, alcohol,
          meals, and workouts. Compound daily delta capped at ±4 pp with regression to 100.
        </div>

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
