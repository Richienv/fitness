"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getAllMeasurements,
  getLatestMeasurement,
  saveMeasurement,
  shoulderWaistRatio,
  waistHipRatio,
  weightRollingAvg,
  type Measurement,
} from "@/lib/measurements";
import { useActiveDate } from "@/lib/activeDate";
import { getAllWorkouts, weekNumber } from "@/lib/workouts";
import { parseDate } from "@/lib/activeDate";
import { haptic } from "@/lib/haptics";
import { getProfile, type Profile } from "@/lib/settings";
import { cycleInfo, suppressWeightWarning } from "@/lib/cycle";
import {
  bodyFatRange,
  strengthLevel,
  whrLabel,
  WHR_HEALTHY_MAX,
} from "@/lib/standards";
import { toast } from "../../Toast";

const RATIO_TARGET = 1.45;

export default function ProgressPage() {
  const { activeDate } = useActiveDate();
  const [latest, setLatest] = useState<Measurement | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState<Measurement>({
    date: "",
    weightKg: undefined,
    waistCm: undefined,
    hipCm: undefined,
    shoulderCm: undefined,
  });

  useEffect(() => {
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, []);

  useEffect(() => {
    setProfile(getProfile());
  }, []);

  useEffect(() => {
    const m = getLatestMeasurement();
    setLatest(m);
    if (activeDate) {
      setForm({
        date: activeDate,
        weightKg: m?.weightKg,
        waistCm: m?.waistCm,
        hipCm: m?.hipCm,
        shoulderCm: m?.shoulderCm,
      });
    }
  }, [activeDate]);

  const isFemale = profile?.sex === "female";

  const wk = activeDate ? weekNumber(parseDate(activeDate)) : 1;
  const ratio = latest ? shoulderWaistRatio(latest) : null;

  const ratioPct = useMemo(() => {
    if (!ratio) return 0;
    const start = 1.3;
    return Math.min(100, Math.max(0, Math.round(((ratio - start) / (RATIO_TARGET - start)) * 100)));
  }, [ratio]);

  // ---- Female-only derived metrics ----
  const rollingAvg = useMemo(() => {
    if (!isFemale) return null;
    const series = weightRollingAvg(getAllMeasurements());
    return series.length ? series[series.length - 1].avg : null;
  }, [isFemale, latest]);

  const whr = latest && isFemale ? waistHipRatio(latest) : null;

  const suppressGain = isFemale
    ? suppressWeightWarning(
        profile?.cycleStartDate ?? null,
        profile?.menstrualTrackingEnabled ?? false
      )
    : false;

  const cycle =
    isFemale && profile?.menstrualTrackingEnabled && profile?.cycleStartDate
      ? cycleInfo(profile.cycleStartDate)
      : null;

  const bfRange = isFemale ? bodyFatRange("female") : null;

  // Strength badge: estimate 1RM (Epley: w*(1+reps/30)) from the best logged
  // set of a key female lift — hip thrust, falling back to squat.
  const strength = useMemo(() => {
    if (!isFemale) return null;
    const bw = latest?.weightKg ?? profile?.weightKg ?? null;
    if (!bw) return null;
    const workouts = getAllWorkouts();
    const lifts: { key: string; match: string; label: string }[] = [
      { key: "hipThrust", match: "hip thrust", label: "HIP THRUST" },
      { key: "squat", match: "squat", label: "SQUAT" },
    ];
    for (const lift of lifts) {
      let best1rm = 0;
      for (const w of workouts) {
        for (const ex of w.exercises) {
          if (!ex.exerciseName.toLowerCase().includes(lift.match)) continue;
          for (const s of ex.sets) {
            if (s.weight > 0 && s.reps > 0) {
              const est = s.weight * (1 + s.reps / 30);
              if (est > best1rm) best1rm = est;
            }
          }
        }
      }
      if (best1rm > 0) {
        return {
          label: lift.label,
          oneRm: Math.round(best1rm),
          level: strengthLevel("female", lift.key, best1rm, bw),
        };
      }
    }
    return null;
  }, [isFemale, latest, profile]);

  function save() {
    if (!form.date) return;
    saveMeasurement(form);
    setLatest(form);
    haptic("success");
    toast("Saved ✓", "success");
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

      {!isFemale && (
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
      )}

      {isFemale && (
        <>
          {cycle && (
            <div
              style={{
                marginTop: 14,
                padding: "13px 15px",
                borderRadius: 14,
                background: "rgba(238,60,48,.07)",
                border: "1px solid rgba(238,60,48,.28)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-dm-mono), monospace",
                  fontSize: 11,
                  letterSpacing: ".08em",
                  color: "#ffb39e",
                }}
              >
                <span
                  style={{
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: "rgba(238,60,48,.18)",
                    border: "1px solid rgba(238,60,48,.4)",
                    color: "#ffd0c2",
                  }}
                >
                  {cycle.label} · HARI {cycle.day}
                </span>
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontFamily: "var(--font-dm-mono), monospace",
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: "#cbb6b0",
                }}
              >
                {cycle.note}
              </div>
            </div>
          )}

          <div className="ratio-block">
            <div className="ratio-head mono">BERAT · RATA-RATA 7 HARI</div>
            <div className="ratio-row">
              <span className="ratio-val">
                {rollingAvg != null ? `${rollingAvg} kg` : "—"}
              </span>
              <span className="ratio-arrow mono">
                {latest?.weightKg ? `TERBARU ${latest.weightKg} kg` : ""}
              </span>
            </div>
            {suppressGain && (
              <div
                style={{
                  marginTop: 8,
                  fontFamily: "var(--font-dm-mono), monospace",
                  fontSize: 10.5,
                  lineHeight: 1.5,
                  color: "#9a938d",
                }}
              >
                Fase luteal — retensi air normal, bukan lemak.
              </div>
            )}
          </div>

          <div className="ratio-block">
            <div className="ratio-head mono">WAIST : HIP (WHR)</div>
            <div className="ratio-row">
              <span className="ratio-val">{whr ? whr.toFixed(2) : "—"}</span>
              <span
                className="ratio-arrow mono"
                style={{
                  color:
                    whr && whrLabel("female", whr) === "watch"
                      ? "#ff8a72"
                      : undefined,
                }}
              >
                {whr
                  ? whrLabel("female", whr) === "healthy"
                    ? `SEHAT < ${WHR_HEALTHY_MAX.female}`
                    : `PANTAU · > ${WHR_HEALTHY_MAX.female}`
                  : `SEHAT < ${WHR_HEALTHY_MAX.female}`}
              </span>
            </div>
          </div>

          <div className="ratio-block">
            <div className="ratio-head mono">BODY FAT · REFERENSI</div>
            <div className="ratio-row">
              <span className="ratio-val">
                {bfRange ? `${bfRange.min}–${bfRange.max}%` : "—"}
              </span>
              <span className="ratio-arrow mono">SEHAT</span>
            </div>
          </div>

          <div className="ratio-block">
            <div className="ratio-head mono">
              LEVEL KEKUATAN{strength ? ` · ${strength.label}` : ""}
            </div>
            <div className="ratio-row">
              <span className="ratio-val" style={{ textTransform: "uppercase" }}>
                {strength ? strength.level : "belum ada data"}
              </span>
              {strength && (
                <span className="ratio-arrow mono">
                  ~1RM {strength.oneRm} kg
                </span>
              )}
            </div>
          </div>
        </>
      )}

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
              {isFemale && (
                <label className="ms-field">
                  <span className="mono">HIP (cm)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.hipCm ?? ""}
                    onChange={(e) => setField("hipCm", e.target.value)}
                  />
                </label>
              )}
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
