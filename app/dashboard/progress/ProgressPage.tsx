"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getLatestMeasurement,
  saveMeasurement,
  shoulderWaistRatio,
  type Measurement,
} from "@/lib/measurements";
import { useActiveDate } from "@/lib/activeDate";
import { weekNumber } from "@/lib/workouts";
import { parseDate } from "@/lib/activeDate";

const RATIO_TARGET = 1.45;

export default function ProgressPage() {
  const { activeDate } = useActiveDate();
  const [latest, setLatest] = useState<Measurement | null>(null);
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState<Measurement>({
    date: "",
    weightKg: undefined,
    waistCm: undefined,
    shoulderCm: undefined,
  });

  useEffect(() => {
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, []);

  useEffect(() => {
    const m = getLatestMeasurement();
    setLatest(m);
    if (activeDate) {
      setForm({
        date: activeDate,
        weightKg: m?.weightKg,
        waistCm: m?.waistCm,
        shoulderCm: m?.shoulderCm,
      });
    }
  }, [activeDate]);

  const wk = activeDate ? weekNumber(parseDate(activeDate)) : 1;
  const ratio = latest ? shoulderWaistRatio(latest) : null;

  const ratioPct = useMemo(() => {
    if (!ratio) return 0;
    const start = 1.3;
    return Math.min(100, Math.max(0, Math.round(((ratio - start) / (RATIO_TARGET - start)) * 100)));
  }, [ratio]);

  function save() {
    if (!form.date) return;
    saveMeasurement(form);
    setLatest(form);
    setSheet(false);
  }

  function setField(k: keyof Measurement, v: string) {
    const num = v === "" ? undefined : Number(v);
    setForm((f) => ({ ...f, [k]: num }));
  }

  const milestones = [
    { wk: 1, label: "START" },
    { wk: 6, label: "MID" },
    { wk: 12, label: "GOAL" },
  ];

  return (
    <main className="sub-page">
      <header className="sub-head">
        <Link href="/dashboard" className="sub-back">← STATS</Link>
        <div className="sub-title">PROGRESS</div>
        <div className="sub-sub mono">12 WEEK PROGRAM</div>
      </header>

      <div className="progress-stats">
        <div className="ps-row">
          <span className="ps-label mono">WEIGHT</span>
          <span className="ps-val">{latest?.weightKg ? `${latest.weightKg} kg` : "—"}</span>
        </div>
        <div className="ps-row">
          <span className="ps-label mono">WAIST</span>
          <span className="ps-val">{latest?.waistCm ? `${latest.waistCm} cm` : "—"}</span>
        </div>
        <div className="ps-row">
          <span className="ps-label mono">SHOULDER</span>
          <span className="ps-val">{latest?.shoulderCm ? `${latest.shoulderCm} cm` : "—"}</span>
        </div>
      </div>

      <div className="ratio-block">
        <div className="ratio-head mono">SHOULDER : WAIST</div>
        <div className="ratio-row">
          <span className="ratio-val">{ratio ? ratio.toFixed(2) : "—"}</span>
          <span className="ratio-arrow mono">→ TARGET {RATIO_TARGET}</span>
        </div>
        <div className="ratio-track">
          <div className="ratio-fill" style={{ width: `${ratioPct}%` }} />
        </div>
      </div>

      <div className="milestones">
        {milestones.map((m, i) => {
          const state = wk > m.wk ? "done" : wk === m.wk ? "now" : "next";
          return (
            <div key={m.wk} className={`milestone ${state}`}>
              <div className="ms-dot">{state === "done" ? "✓" : state === "now" ? "●" : "○"}</div>
              <div className="ms-wk mono">WK {m.wk}</div>
              <div className="ms-label mono">{m.label}</div>
              {i < milestones.length - 1 && <div className="ms-line" />}
            </div>
          );
        })}
      </div>

      <button type="button" className="share-btn" onClick={() => setSheet(true)}>
        📏 TAKE MEASUREMENTS
      </button>

      {sheet && (
        <div className="set-modal-overlay" onClick={() => setSheet(false)}>
          <div className="set-modal" onClick={(e) => e.stopPropagation()}>
            <div className="set-modal-body">
              <div className="set-modal-head">
                <div className="set-modal-ex">MEASUREMENTS</div>
              </div>
              <label className="ms-field">
                <span className="mono">WEIGHT (kg)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.weightKg ?? ""}
                  onChange={(e) => setField("weightKg", e.target.value)}
                />
              </label>
              <label className="ms-field">
                <span className="mono">WAIST (cm)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.waistCm ?? ""}
                  onChange={(e) => setField("waistCm", e.target.value)}
                />
              </label>
              <label className="ms-field">
                <span className="mono">SHOULDER (cm)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.shoulderCm ?? ""}
                  onChange={(e) => setField("shoulderCm", e.target.value)}
                />
              </label>
            </div>
            <div className="set-modal-actions">
              <button type="button" className="next-btn ghost" onClick={() => setSheet(false)}>
                CANCEL
              </button>
              <button type="button" className="next-btn" onClick={save}>
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
