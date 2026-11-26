"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getTodayCondition,
  readMetabolicSnapshot,
  setTodayCondition,
} from "@/lib/metabolicData";
import {
  computeMetabolicSnapshot,
  type BodyBuildEstimate,
  type DailyPosture,
  type DeficitPace,
  type MetabolicProfile,
  type SittingBand,
  type TodayCondition,
  type TypicalStepsBand,
} from "@/lib/metabolicEngine";
import { sendOrQueue } from "@/lib/offlineOutbox";
import { getProfile, patchProfile } from "@/lib/settings";
import { getLatestMeasurement } from "@/lib/measurements";
import { getMealsForDate, isCustomItem } from "@/lib/store";
import { macrosFor } from "@/lib/ingredients";
import { burnReader } from "@/lib/burnData";
import { getAllSleep } from "@/lib/sleep";
import { todayKey } from "@/lib/targets";
import { syncResolvedTargets } from "@/lib/targetSync";
import type { AccountSetup } from "@/lib/setup";
import { useAccountSetup } from "../SetupProvider";
import "./metabolic-sheet.css";

const SITTING_OPTS: { id: SittingBand; label: string }[] = [
  { id: "10plus", label: "10+ jam" },
  { id: "7to9", label: "7–9 jam" },
  { id: "4to6", label: "4–6 jam" },
  { id: "lt4", label: "<4 jam" },
];

const POSTURE_OPTS: { id: DailyPosture; label: string }[] = [
  { id: "desk", label: "WFH / Meja" },
  { id: "mixed", label: "Duduk + Jalan" },
  { id: "standing", label: "Banyak Berdiri" },
  { id: "physical", label: "Aktif Fisik" },
];

const STEPS_OPTS: { id: TypicalStepsBand; label: string }[] = [
  { id: "lt3k", label: "<3.000 langkah" },
  { id: "3k_5500", label: "3k–5,5k" },
  { id: "5500_8500", label: "5,5k–8,5k" },
  { id: "gt8500", label: "8.500+" },
];

const PACE_OPTS: { id: DeficitPace; label: string }[] = [
  { id: "gentle", label: "Santai (−250)" },
  { id: "steady", label: "Stabil (−350)" },
  { id: "focused", label: "Fokus (−450)" },
  { id: "maintain", label: "Maintain (0)" },
];

const BUILD_OPTS: { id: BodyBuildEstimate; label: string }[] = [
  { id: "lean", label: "Kering / Athletic" },
  { id: "average", label: "Proporsional" },
  { id: "soft", label: "Berisi" },
  { id: "high", label: "Lemak Tinggi" },
];

const CONDITION_OPTS: {
  id: TodayCondition;
  label: string;
  femaleOnly?: boolean;
}[] = [
  { id: "normal", label: "Normal" },
  { id: "low_sleep", label: "Kurang Tidur" },
  { id: "period_pms", label: "Haid / PMS", femaleOnly: true },
  { id: "recovering", label: "Pemulihan" },
  { id: "extra_active", label: "Super Aktif" },
];

function legacyActivityFromMeta(meta: MetabolicProfile): number {
  if (meta.dailyPosture === "physical" || meta.typicalSteps === "gt8500") return 1.55;
  if (meta.dailyPosture === "standing" || meta.typicalSteps === "5500_8500") return 1.375;
  return 1.2;
}

export default function MetabolicCalibrationSheet({
  open,
  onClose,
  dateKey,
}: {
  open: boolean;
  onClose: () => void;
  dateKey?: string;
}) {
  const account = useAccountSetup();
  const activeDate = dateKey || todayKey();

  const [sittingHours, setSittingHours] = useState<SittingBand>("7to9");
  const [dailyPosture, setDailyPosture] = useState<DailyPosture>("desk");
  const [typicalSteps, setTypicalSteps] = useState<TypicalStepsBand>("lt3k");
  const [deficitPace, setDeficitPace] = useState<DeficitPace>("steady");
  const [bodyBuild, setBodyBuild] = useState<BodyBuildEstimate | null>(null);
  const [bodyFatInput, setBodyFatInput] = useState<string>("");
  const [todayCond, setTodayCond] = useState<TodayCondition>("normal");
  const [menstrualEnabled, setMenstrualEnabled] = useState<boolean>(false);
  const [cycleStart, setCycleStart] = useState<string>("");
  const [cycleLen, setCycleLen] = useState<number>(28);
  const [saving, setSaving] = useState<boolean>(false);

  const profile = useMemo(() => (open ? getProfile() : getProfile()), [open]);
  const isFemale = profile.sex === "female";

  useEffect(() => {
    if (!open) return;
    const p = getProfile();
    const m = p.metabolic ?? {};
    setSittingHours(m.sittingHours ?? "7to9");
    setDailyPosture(m.dailyPosture ?? (p.activity >= 1.5 ? "mixed" : "desk"));
    setTypicalSteps(
      m.typicalSteps ?? (p.activity >= 1.5 ? "5500_8500" : "3k_5500"),
    );
    setDeficitPace(
      m.deficitPace ??
        (p.goal === "muscle_gain" || p.goal === "maintain"
          ? "maintain"
          : p.goal === "recomp"
            ? "gentle"
            : "steady"),
    );
    setBodyBuild(m.bodyBuild ?? null);
    setBodyFatInput(
      typeof m.bodyFatPct === "number" && Number.isFinite(m.bodyFatPct)
        ? String(m.bodyFatPct)
        : "",
    );
    setMenstrualEnabled(Boolean(p.menstrualTrackingEnabled));
    setCycleStart(p.cycleStartDate ?? "");
    setCycleLen(m.cycleLengthDays ?? 28);
    setTodayCond(getTodayCondition(activeDate));
  }, [open, activeDate]);

  const draftMetabolic = useMemo<MetabolicProfile>(() => {
    const parsedBf = Number(bodyFatInput.replace(",", "."));
    const validBf =
      bodyFatInput.trim() !== "" &&
      Number.isFinite(parsedBf) &&
      parsedBf >= 5 &&
      parsedBf <= 60
        ? Math.round(parsedBf * 10) / 10
        : null;
    return {
      sittingHours,
      dailyPosture,
      typicalSteps,
      deficitPace,
      bodyBuild,
      bodyFatPct: validBf,
      cycleLengthDays: cycleLen,
    };
  }, [
    sittingHours,
    dailyPosture,
    typicalSteps,
    deficitPace,
    bodyBuild,
    bodyFatInput,
    cycleLen,
  ]);

  const baseSnapshot = useMemo(
    () => (open ? readMetabolicSnapshot(activeDate) : null),
    [open, activeDate],
  );

  const preview = useMemo(() => {
    if (!open || !profile.sex || !profile.heightCm || !profile.age) return null;
    const latest = getLatestMeasurement();
    const kg = latest?.weightKg ?? profile.weightKg;
    if (typeof kg !== "number" || !Number.isFinite(kg) || kg <= 0) return null;

    const burn = burnReader()(activeDate);
    const hasWatch = burn.source === "health" && burn.total > 0;
    const meals = getMealsForDate(activeDate);
    let kcal = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;
    for (const meal of meals) {
      for (const item of meal.items) {
        if (isCustomItem(item)) {
          kcal += Number(item.kcal) || 0;
          proteinG += Number(item.protein) || 0;
          carbsG += Number(item.carbs) || 0;
          fatG += Number(item.fat) || 0;
        } else {
          const m = macrosFor(item.id, item.qty);
          kcal += m.kcal;
          proteinG += m.protein;
          carbsG += m.carbs;
          fatG += m.fat;
        }
      }
    }
    const sleepMin = getAllSleep()[activeDate]?.durationMin ?? null;

    const live = computeMetabolicSnapshot({
      sex: profile.sex,
      goal: profile.goal,
      kg,
      cm: profile.heightCm,
      age: profile.age,
      waistCm: latest?.waistCm ?? null,
      hipCm: latest?.hipCm ?? null,
      metabolic: draftMetabolic,
      fallbackActivity: profile.activity,
      menstrualTrackingEnabled: isFemale ? menstrualEnabled : false,
      cycleStartDate: isFemale && cycleStart ? cycleStart : null,
      activeBurnDay: burn.total,
      hasWatchActive: hasWatch,
      eatenToday: { kcal, proteinG, carbsG, fatG },
      sleepMin,
      todayCondition: todayCond,
      history: [],
      date: activeDate,
    });

    if (baseSnapshot?.calibration) {
      const offset = baseSnapshot.calibration.adaptiveOffsetKcal;
      const adjustedNormal = Math.max(
        Math.round(live.bmr * 0.88),
        live.normalBurnDay + offset,
      );
      const adjustedTotal = adjustedNormal + live.activeBurnDay;
      const baseGap = live.totalBurnDay - live.recommendedTargetKcal;
      const adjustedTarget = Math.max(
        live.calorieFloor,
        Math.round((adjustedTotal - baseGap) / 10) * 10,
      );
      return {
        ...live,
        adaptiveOffsetKcal: offset,
        normalBurnDay: adjustedNormal,
        totalBurnDay: adjustedTotal,
        recommendedTargetKcal: adjustedTarget,
        recommendedDeficit: Math.max(0, adjustedTotal - adjustedTarget),
        floored: adjustedTarget === live.calorieFloor && adjustedTotal - baseGap < live.calorieFloor,
        calibration: baseSnapshot.calibration,
      };
    }

    return live;
  }, [
    open,
    profile,
    activeDate,
    draftMetabolic,
    isFemale,
    menstrualEnabled,
    cycleStart,
    todayCond,
    baseSnapshot,
  ]);

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    const nowIso = new Date().toISOString();
    const finalMetabolic: MetabolicProfile = {
      ...draftMetabolic,
      calibratedAt: nowIso,
    };
    const nextActivity = legacyActivityFromMeta(finalMetabolic);
    const cleanCycleDate =
      isFemale && /^\d{4}-\d{2}-\d{2}$/.test(cycleStart.trim())
        ? cycleStart.trim()
        : null;

    setTodayCondition(activeDate, todayCond);
    patchProfile({
      activity: nextActivity,
      metabolic: finalMetabolic,
      ...(isFemale
        ? {
            menstrualTrackingEnabled: menstrualEnabled,
            cycleStartDate: cleanCycleDate,
          }
        : {}),
    });
    window.dispatchEvent(new Event("r2:data"));
    syncResolvedTargets();

    const res = await sendOrQueue({
      url: "/api/setup",
      method: "PATCH",
      dedupeKey: "setup:metabolic",
      body: {
        metabolicProfile: finalMetabolic,
        activity: nextActivity,
        ...(isFemale
          ? {
              menstrualTrackingEnabled: menstrualEnabled,
              cycleStartDate: cleanCycleDate,
            }
          : {}),
      },
    });
    if (res.ok && res.response) {
      try {
        const data = (await res.response.json()) as {
          setup?: AccountSetup | null;
          displayName?: string;
        };
        if (data?.setup && account?.accept) {
          account.accept(data.setup, data.displayName);
        }
      } catch {}
    }
    setSaving(false);
    onClose();
  }

  return (
    <div
      className="mc-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mc-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mc-sheet">
        <div className="mc-head">
          <div>
            <h2 id="mc-title">Kalibrasi Akurasi Kalori &amp; Siklus</h2>
            <p>
              Jawab singkat supaya bakar normal tidak ketinggian, target aman terjaga, &amp;
              fluktuasi hormon terbaca jujur.
            </p>
          </div>
          <button
            type="button"
            className="mc-close"
            onClick={onClose}
            aria-label="Tutup kalibrasi"
          >
            ✕
          </button>
        </div>

        {preview && (
          <div className="mc-summary">
            <div className="mc-acc-row">
              <span className="mc-acc-label">
                Skor Akurasi Model · {preview.accuracyLabel}
              </span>
              <span className="mc-acc-badge">{preview.accuracyScore}%</span>
            </div>
            <div className="mc-acc-track">
              <span
                className="mc-acc-fill"
                style={{ width: `${preview.accuracyScore}%` }}
              />
            </div>

            <div className="mc-metrics">
              <div className="mc-metric">
                <span>Bakar Asli/Hari</span>
                <strong>{preview.totalBurnDay.toLocaleString("id-ID")}</strong>
                <small>
                  BMR {preview.bmr} · ×{preview.neatFactor.toFixed(2)}
                </small>
              </div>
              <div className="mc-metric">
                <span>Target Makan</span>
                <strong>{preview.recommendedTargetKcal.toLocaleString("id-ID")}</strong>
                <small>
                  {preview.floored
                    ? `Batas aman min ${preview.calorieFloor}`
                    : `Defisit ~${preview.recommendedDeficit} kkal`}
                </small>
              </div>
              <div className="mc-metric">
                <span>Protein Min</span>
                <strong>{preview.proteinTargetG} g</strong>
                <small>TEF {preview.tefDeltaKcal >= 0 ? "+" : ""}{preview.tefDeltaKcal} kkal</small>
              </div>
            </div>

            {preview.alerts.length > 0 && (
              <div className="mc-alerts">
                {preview.alerts.map((msg, i) => (
                  <div key={i} className="mc-alert">
                    {msg}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mc-group">
          <div className="mc-group-title">
            <span>Kondisi Tubuh Hari Ini</span>
            <small>Efek langsung ke bakar hari ini</small>
          </div>
          <div className="mc-chips">
            {CONDITION_OPTS.filter((o) => !o.femaleOnly || isFemale).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`mc-chip${todayCond === opt.id ? " is-active" : ""}${
                  opt.id === "period_pms" && todayCond === opt.id ? " is-period" : ""
                }`}
                onClick={() => setTodayCond(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mc-group">
          <div className="mc-group-title">
            <span>Lama Duduk per Hari</span>
            <small>Mencegah NEAT kebesaran</small>
          </div>
          <div className="mc-chips">
            {SITTING_OPTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`mc-chip${sittingHours === opt.id ? " is-active" : ""}`}
                onClick={() => setSittingHours(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mc-group">
          <div className="mc-group-title">
            <span>Aktivitas Harian (Di Luar Olahraga)</span>
          </div>
          <div className="mc-chips">
            {POSTURE_OPTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`mc-chip${dailyPosture === opt.id ? " is-active" : ""}`}
                onClick={() => setDailyPosture(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mc-group">
          <div className="mc-group-title">
            <span>Rata-Rata Langkah Harian</span>
          </div>
          <div className="mc-chips">
            {STEPS_OPTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`mc-chip${typicalSteps === opt.id ? " is-active" : ""}`}
                onClick={() => setTypicalSteps(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mc-group">
          <div className="mc-group-title">
            <span>Laju Defisit yang Diinginkan</span>
            <small>Tetap dijaga batas aman</small>
          </div>
          <div className="mc-chips">
            {PACE_OPTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`mc-chip${deficitPace === opt.id ? " is-active" : ""}`}
                onClick={() => setDeficitPace(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {isFemale && (
          <div className="mc-cycle-box">
            <div className="mc-cycle-top">
              <strong style={{ fontSize: "13.5px", color: "#881337" }}>
                Siklus Menstruasi &amp; Retensi Air
              </strong>
              <div className="mc-chips">
                <button
                  type="button"
                  className={`mc-chip${menstrualEnabled ? " is-period" : ""}`}
                  onClick={() => setMenstrualEnabled((v) => !v)}
                >
                  {menstrualEnabled ? "Aktif" : "Nonaktif"}
                </button>
                <button
                  type="button"
                  className="mc-chip"
                  onClick={() => {
                    setMenstrualEnabled(true);
                    setCycleStart(activeDate);
                  }}
                >
                  🩸 Mulai Haid Hari Ini
                </button>
              </div>
            </div>

            {menstrualEnabled && (
              <>
                <div className="mc-inline-row">
                  <label style={{ fontSize: "12px", fontWeight: 650, color: "#881337" }}>
                    Hari ke-1 terakhir:
                  </label>
                  <input
                    type="date"
                    className="mc-input"
                    value={cycleStart}
                    max={todayKey()}
                    onChange={(e) => setCycleStart(e.target.value)}
                  />
                </div>
                <div className="mc-inline-row">
                  <span style={{ fontSize: "12px", fontWeight: 650, color: "#881337" }}>
                    Panjang siklus:
                  </span>
                  {[26, 28, 30, 32].map((len) => (
                    <button
                      key={len}
                      type="button"
                      className={`mc-chip${cycleLen === len ? " is-period" : ""}`}
                      onClick={() => setCycleLen(len)}
                    >
                      {len} hr
                    </button>
                  ))}
                </div>
                {preview?.cycleEffect.active && (
                  <p className="mc-cycle-note">
                    <strong>
                      {preview.cycleEffect.label} · Hari {preview.cycleEffect.day}:
                    </strong>{" "}
                    {preview.cycleEffect.guidance}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="mc-group">
          <div className="mc-group-title">
            <span>Perkiraan Komposisi Tubuh (Opsional)</span>
            <small>Untuk rumus BMR otot (Katch)</small>
          </div>
          <div className="mc-chips">
            {BUILD_OPTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`mc-chip${bodyBuild === opt.id ? " is-active" : ""}`}
                onClick={() => setBodyBuild((cur) => (cur === opt.id ? null : opt.id))}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mc-inline-row">
            <label htmlFor="mc-bf" style={{ fontSize: "12px", color: "#475569" }}>
              Atau isi % lemak jika tahu (InBody/timbangan):
            </label>
            <input
              id="mc-bf"
              type="number"
              min={5}
              max={60}
              step={0.5}
              placeholder="cth 24"
              className="mc-input mc-bf-input"
              value={bodyFatInput}
              onChange={(e) => setBodyFatInput(e.target.value)}
            />
          </div>
        </div>

        {preview && (
          <div className="mc-calib-card">
            <strong>
              Kalibrasi Realita 14–28 Hari (
              {preview.calibration.status === "calibrated"
                ? `Aktif · ${preview.calibration.confidencePct}% yakin`
                : `Mengumpulkan data · ${preview.calibration.validFoodDays}/7 hari makan, ${preview.calibration.weighDays}/3 timbang`}
              )
            </strong>
            {preview.calibration.status === "calibrated" ? (
              <span>
                Rumus memperkirakan {preview.calibration.formulaTotalTdee} kkal/hari, tren
                timbangan + makan membuktikan bakar nyatamu{" "}
                <strong>{preview.calibration.observedTotalTdee} kkal/hari</strong> (penyesuaian{" "}
                {preview.calibration.adaptiveOffsetKcal >= 0 ? "+" : ""}
                {preview.calibration.adaptiveOffsetKcal} kkal).
              </span>
            ) : (
              <span>
                Sistem otomatis belajar dari log makan + tren berat bersihmu (lonjakan air haid
                otomatis disaring) setelah cukup data.
              </span>
            )}
          </div>
        )}

        <div className="mc-actions">
          <button type="button" className="mc-btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="mc-btn-primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Menyimpan..." : "Simpan & Terapkan"}
          </button>
        </div>
      </div>
    </div>
  );
}
