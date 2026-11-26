"use client";
// Minimalist frosted-glass HUD overlaid on the collectible level avatar.
// - Top bar: quiet Live status pill (left) + frosted Detail trigger (right).
// - Top-center above avatar head: anchor weight → projected weight
//   with sliding frosted toggle between "Tanpa air" and "+ Air".
// - Balanced 2-left / 2-right orbital frosted chips:
//   Left: Live deficit & Active workout burn.
//   Right: Makan/protein progress & interactive Water tracker (+250 ml / −250 ml).
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { dayFractionCST, energyBalance } from "@/lib/energyBalance";
import type { EnergyView } from "@/lib/energyBalanceData";
import {
  unlockRequirementForLevel,
  type Character,
  type CompanionGoal,
} from "@/lib/companionProgress";
import type { Snapshot } from "@/lib/motivation";
import { haptic } from "@/lib/haptics";
import AvatarPlayer from "./AvatarPlayer";
import Icon from "../ui/Icon";
import { getAvatarLevelMeta, TIER_META } from "@/lib/avatarLevels";
import { formatWeighTime } from "@/lib/weighIn";
import "./hero-stage.css";

const idInt = (n: number) => Math.round(Math.abs(n)).toLocaleString("id-ID");
const dec = (n: number, d = 1) =>
  n.toLocaleString("id-ID", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

export default function HeroAvatarStage({
  character,
  level,
  highestLevel,
  demoted,
  demotedFrom,
  weighedAt,
  fallbackBaselineKg,
  goal,
  currentKg,
  energy,
  snap,
  waterMl,
  onAddWater,
  detailOpen,
  onToggleDetail,
  onOpenWeigh,
}: {
  character: Character;
  level: number;
  highestLevel?: number | null;
  demoted?: boolean;
  demotedFrom?: number | null;
  weighedAt?: string | null;
  fallbackBaselineKg?: number | null;
  goal: CompanionGoal | null;
  currentKg: number | null;
  energy: EnergyView | null;
  snap: Snapshot | null;
  waterMl: number;
  onAddWater: (deltaMl: number) => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
  onOpenWeigh: () => void;
}) {
  const unlockedLevel = Math.max(1, Math.min(12, Math.round(level)));
  const [viewLevel, setViewLevel] = useState(unlockedLevel);
  const [includeWater, setIncludeWater] = useState(false);
  const [tick, setTick] = useState<number | null>(null);
  const [waterPulsed, setWaterPulsed] = useState(false);
  const waterPopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (waterPopTimerRef.current) clearTimeout(waterPopTimerRef.current);
    };
  }, []);

  const handleWaterDelta = (deltaMl: number) => {
    onAddWater(deltaMl);
    if (waterPopTimerRef.current) clearTimeout(waterPopTimerRef.current);
    setWaterPulsed(false);
    requestAnimationFrame(() => {
      setWaterPulsed(true);
      waterPopTimerRef.current = setTimeout(() => {
        setWaterPulsed(false);
        waterPopTimerRef.current = null;
      }, 340);
    });
  };

  useEffect(() => {
    setViewLevel(unlockedLevel);
  }, [unlockedLevel, character]);

  const isLocked = viewLevel > unlockedLevel;
  const isPeeking = viewLevel !== unlockedLevel;
  const isDemotedLock = Boolean(isLocked && highestLevel && viewLevel <= highestLevel);
  const weighTime = formatWeighTime(weighedAt);
  const unlockReq = useMemo(
    () =>
      isLocked
        ? unlockRequirementForLevel(goal, viewLevel, currentKg, fallbackBaselineKg)
        : null,
    [isLocked, goal, viewLevel, currentKg, fallbackBaselineKg],
  );

  const stepLevel = (delta: number) => {
    setViewLevel((prev) => {
      const next = Math.max(1, Math.min(12, prev + delta));
      if (next !== prev) haptic("tap");
      return next;
    });
  };

  const resetToUnlocked = () => {
    if (viewLevel !== unlockedLevel) {
      haptic("tap");
      setViewLevel(unlockedLevel);
    }
  };

  const isToday = energy?.status === "ok" && energy.isToday;

  useEffect(() => {
    if (!isToday) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      setTick(Date.now());
      timer = setInterval(() => setTick(Date.now()), 1000);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    if (!document.hidden) start();
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isToday]);

  const live = useMemo(() => {
    if (!energy || energy.status !== "ok") return null;
    if (!energy.isToday || tick === null) return energy.balance;
    return (
      energyBalance({
        ...energy.input,
        waterMl,
        dayFraction: dayFractionCST(new Date(tick)),
      }) ?? energy.balance
    );
  }, [energy, tick, waterMl]);

  const anchorKg = energy?.status === "ok" ? energy.kg : null;
  const targetWeightNow = live
    ? includeWater
      ? live.stopEating.weightWithWaterKg
      : live.stopEating.weightKg
    : null;

  const deltaKg =
    anchorKg !== null && targetWeightNow !== null
      ? anchorKg - targetWeightNow // positive = losing weight
      : null;

  const nowDeficit = live ? live.soFar.balanceExact : null;
  const nowDeltaKg = live ? live.soFar.weight.bodyKg : null;
  const waterL = waterMl / 1000;

  return (
    <section className="hero-stage" aria-label="Ringkasan berat dan progres real time">
      {/* Dedicated utility strip: quiet status badge left, frosted Detail trigger right */}
      <div className="hero-stage-top">
        <span className={`hero-live-badge${isToday ? " is-live" : ""}`}>
          <span className="hero-live-dot" aria-hidden="true" />
          <span>{isToday ? "Live" : "Proyeksi"}</span>
        </span>
        <button
          type="button"
          className={`hero-detail-btn${detailOpen ? " is-open" : ""}`}
          onClick={onToggleDetail}
          aria-expanded={detailOpen}
          aria-label={detailOpen ? "Tutup detail perhitungan" : "Lihat detail perhitungan"}
        >
          <Icon name="info" size={14} />
          <span>{detailOpen ? "Tutup" : "Detail"}</span>
        </button>
      </div>

      {/* Top-center focal readout above avatar head */}
      <div className="hero-head-weight">
        {anchorKg !== null && targetWeightNow !== null && live ? (
          <>
            <button
              type="button"
              className="hero-weight-transition"
              onClick={onOpenWeigh}
              aria-label={`Berat dari ${dec(anchorKg, 1)} kg menjadi perkiraan ${dec(targetWeightNow, 1)} kg`}
            >
              <span className="hero-weight-old">{dec(anchorKg, 1)}</span>
              <span className="hero-weight-arrow" aria-hidden="true">
                →
              </span>
              <strong
                className={`hero-weight-new${
                  deltaKg !== null && deltaKg > 0.02
                    ? " down"
                    : deltaKg !== null && deltaKg < -0.02
                      ? " up"
                      : ""
                }`}
              >
                {dec(targetWeightNow, 1)}
                <small> kg</small>
              </strong>
            </button>

            <div className="hero-weight-sub">
              {includeWater ? (
                <span>
                  Timbangan (+{dec(waterL, 2)} L air) · bersih{" "}
                  <strong>{dec(live.stopEating.weightKg, 2)} kg</strong>
                </span>
              ) : (
                <>
                  <span>
                    {deltaKg !== null && Math.abs(deltaKg) >= 0.005
                      ? `${deltaKg > 0 ? "−" : "+"}${dec(Math.abs(deltaKg), 2)} kg`
                      : "≈ 0,00 kg"}{" "}
                    kalau stop makan
                  </span>
                  {nowDeltaKg !== null && isToday && (
                    <span className="hero-live-pill">
                      <em className="hero-live-tick">
                        {nowDeltaKg >= 0 ? "−" : "+"}
                        {dec(Math.abs(nowDeltaKg), 4)} kg
                      </em>{" "}
                      skrg
                    </span>
                  )}
                  {weighTime && (
                    <span className="hero-weigh-time">Timbang pukul {weighTime}</span>
                  )}
                </>
              )}
            </div>

            <div
              className={`hero-water-switch${includeWater ? " is-water" : ""}`}
              role="group"
              aria-label="Mode berat air minum"
            >
              <span className="hero-water-thumb" aria-hidden="true" />
              <button
                type="button"
                className={!includeWater ? "is-active" : undefined}
                aria-pressed={!includeWater}
                onClick={() => {
                  if (includeWater) haptic("tap");
                  setIncludeWater(false);
                }}
              >
                Tanpa air
              </button>
              <button
                type="button"
                className={includeWater ? "is-active" : undefined}
                aria-pressed={includeWater}
                onClick={() => {
                  if (!includeWater) haptic("tap");
                  setIncludeWater(true);
                }}
              >
                + Air{waterMl > 0 ? ` (${dec(waterL, 1)}L)` : ""}
              </button>
            </div>
          </>
        ) : (
          <Link href="/settings" className="hero-setup-pill">
            Lengkapi data tubuh untuk proyeksi berat →
          </Link>
        )}
      </div>

      {/* Avatar canvas with symmetrical 2-left / 2-right orbital HUD; locked levels show mystery silhouette */}
      <div className={`hero-avatar-canvas${isLocked ? " is-locked" : ""}`}>
        <AvatarPlayer
          character={character}
          level={viewLevel}
          locked={isLocked}
          autoPlay={false}
          minimalControls
        />

        {isLocked && unlockReq && (
          <div className="hero-locked-overlay" role="status" aria-live="polite">
            <div className="hero-locked-head">
              <span className="hero-locked-badge">
                <Icon name="lock" size={14} />
                <strong>{isDemotedLock ? "LOCKED · MUNDUR" : "LOCKED"}</strong>
              </span>
              <span className="hero-locked-level">Level {viewLevel}</span>
            </div>

            {unlockReq.kind === "weight" && (
              <>
                <p className="hero-locked-target">
                  {isDemotedLock
                    ? `Berat naik — capai ${dec(unlockReq.requiredKg, 1)} kg lagi buat balik ke Lv ${viewLevel}`
                    : `Capai ${dec(unlockReq.requiredKg, 1)} kg buat unlock`}
                </p>
                {unlockReq.remainingKg !== null &&
                !unlockReq.alreadyReached &&
                unlockReq.remainingKg >= 0.05 ? (
                  <span className="hero-locked-sub">
                    {isDemotedLock
                      ? `${unlockReq.direction === "loss" ? "Turun" : "Naik"} ${dec(unlockReq.remainingKg, 1)} kg lagi untuk buka kembali`
                      : `Tinggal ${dec(unlockReq.remainingKg, 1)} kg lagi`}
                  </span>
                ) : unlockReq.estimated ? (
                  <span className="hero-locked-sub">
                    Estimasi dari berat awal — sentuh target langsung unlock
                  </span>
                ) : (
                  <span className="hero-locked-sub">
                    Sentuh {dec(unlockReq.requiredKg, 1)} kg langsung unlock
                  </span>
                )}
              </>
            )}

            {unlockReq.kind === "recomp" && (
              <>
                <p className="hero-locked-target">
                  Capai pinggang {dec(unlockReq.requiredWaistCm, 1)} cm &amp;{" "}
                  {unlockReq.exercise} {dec(unlockReq.requiredLiftKg, 1)} kg ×{" "}
                  {unlockReq.reps} buat unlock
                </p>
                <span className="hero-locked-sub">
                  Target rekomposisi bertahan
                </span>
              </>
            )}

            {unlockReq.kind === "unconfigured" && (
              <>
                <p className="hero-locked-target">
                  Atur target berat buat unlock
                </p>
                <Link href="/companion#goals" className="hero-locked-cta">
                  Atur target →
                </Link>
              </>
            )}
          </div>
        )}

        {/* Orbital left HUD: Energy out (Deficit + Workout burn) */}
        <div className="hero-hud-left" aria-hidden={isLocked || undefined}>
          {live && (
            <button
              type="button"
              className="hero-chip tone-deficit slot-tl"
              onClick={onToggleDetail}
              tabIndex={isLocked ? -1 : undefined}
              aria-label="Defisit detik ini"
            >
              <span className="hero-chip-ico">
                <Icon name="zap" size={13} />
              </span>
              <span className="hero-chip-body">
                <strong>
                  {nowDeficit !== null && nowDeficit >= 0 ? "−" : "+"}
                  {idInt(nowDeficit ?? 0)}
                  <small> kkal</small>
                </strong>
                <em>−{dec(live.rate.bodyGramsPerHour, 0)} g/jam</em>
              </span>
            </button>
          )}

          {live && (
            <Link
              href="/workout"
              className="hero-chip tone-burn slot-bl"
              tabIndex={isLocked ? -1 : undefined}
              aria-label="Olahraga hari ini"
            >
              <span className="hero-chip-ico">
                <Icon name="workout" size={13} />
              </span>
              <span className="hero-chip-body">
                <strong>
                  {idInt(live.active)}
                  <small> kkal</small>
                </strong>
                <em>olahraga</em>
              </span>
            </Link>
          )}
        </div>

        {/* Orbital right HUD: Intake & Hydration (Makan/Protein + Air Minum) */}
        <div className="hero-hud-right" aria-hidden={isLocked || undefined}>
          {snap && (
            <Link
              href="/meal"
              className="hero-chip tone-meal slot-tr"
              tabIndex={isLocked ? -1 : undefined}
              aria-label="Makan hari ini"
            >
              <span className="hero-chip-ico">
                <Icon name="meal" size={13} />
              </span>
              <span className="hero-chip-body">
                <strong>
                  {idInt(snap.kcal)}
                  <small>/{idInt(snap.kcalTarget)}</small>
                </strong>
                <em>{idInt(snap.protein)}g protein</em>
                <span className="hero-chip-meter" aria-hidden="true">
                  <span
                    className="hero-chip-meter-fill meal"
                    style={{
                      transform: `scaleX(${Math.min(1, snap.kcalTarget > 0 ? snap.kcal / snap.kcalTarget : 0)})`,
                    }}
                  />
                </span>
              </span>
            </Link>
          )}

          <div
            className={`hero-water-chip slot-br${waterPulsed ? " is-pulsed" : ""}`}
            aria-label={`Air minum ${waterMl} ml`}
          >
            <div className="hero-water-top">
              <span className="hero-chip-ico water">
                <Icon name="droplet" size={13} />
              </span>
              <span className="hero-chip-body">
                <strong>
                  {dec(waterL, 2)}
                  <small> L</small>
                </strong>
                <em>+{dec(waterL, 2)} kg</em>
              </span>
            </div>
            <span className="hero-chip-meter water" aria-hidden="true">
              <span
                className="hero-chip-meter-fill water"
                style={{ transform: `scaleX(${Math.min(1, waterMl / 2500)})` }}
              />
            </span>
            <div className="hero-water-btns">
              {waterMl > 0 && (
                <button
                  type="button"
                  className="hero-water-minus"
                  onClick={() => handleWaterDelta(-250)}
                  tabIndex={isLocked ? -1 : undefined}
                  aria-label="Kurangi 250 ml air"
                >
                  −
                </button>
              )}
              <button
                type="button"
                className="hero-water-plus"
                onClick={() => handleWaterDelta(250)}
                tabIndex={isLocked ? -1 : undefined}
                aria-label="Tambah 250 ml air"
              >
                +250
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom peek bar: Prev / Next to check next mystery silhouette, or Kembali to current level */}
      <div className="hero-peek-bar" aria-label="Jelajahi level avatar">
        <button
          type="button"
          className="hero-peek-btn"
          onClick={() => stepLevel(-1)}
          disabled={viewLevel <= 1}
          aria-label="Level sebelumnya"
        >
          <span aria-hidden="true">‹</span>
        </button>

        <div className="hero-peek-center">
          {(() => {
            const meta = getAvatarLevelMeta(character, viewLevel);
            const tier = TIER_META[meta.tier];
            return (
              <Link
                href="/companion"
                className={`hero-level-pill${isLocked ? " is-locked" : ""}`}
              >
                {isLocked ? (
                  <>
                    <Icon name="lock" size={12} />
                    <span>
                      {character === "richie" ? "Richie" : "Renita"} · Lv {viewLevel} / 12 · Rahasia
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="hero-level-dot"
                      style={{ backgroundColor: tier.accent }}
                      aria-hidden="true"
                    />
                    <span>
                      {character === "richie" ? "Richie" : "Renita"} · Lv {meta.level} ·{" "}
                      <strong>{meta.title}</strong>
                    </span>
                  </>
                )}
              </Link>
            );
          })()}
          {!isLocked && demoted && demotedFrom && (
            <span className="hero-demoted-pill" role="status">
              ↓ Mundur dari Lv {demotedFrom}
            </span>
          )}
          {isPeeking && (
            <button
              type="button"
              className="hero-peek-reset"
              onClick={resetToUnlocked}
              aria-label={`Kembali ke level aktif (Level ${unlockedLevel})`}
            >
              Kembali · Lv {unlockedLevel}
            </button>
          )}
        </div>

        <button
          type="button"
          className="hero-peek-btn"
          onClick={() => stepLevel(1)}
          disabled={viewLevel >= 12}
          aria-label="Cek level berikutnya"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}
