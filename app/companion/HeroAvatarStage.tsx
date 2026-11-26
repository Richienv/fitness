"use client";
// Minimalist frosted-glass HUD overlaid on the collectible level avatar.
// - Top bar: quiet Live status pill (left) + frosted Detail trigger (right).
// - Top-center above avatar head: anchor weight → projected weight
//   with sliding frosted toggle between "Tanpa air" and "+ Air".
// - Balanced 2-left / 2-right orbital frosted chips:
//   Left: Live deficit & Active workout burn.
//   Right: Makan/protein progress & interactive Water tracker (+250 ml / −250 ml).
import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { dayFractionCST, energyBalance } from "@/lib/energyBalance";
import type { EnergyView } from "@/lib/energyBalanceData";
import {
  unlockRequirementForLevel,
  type Character,
  type CompanionGoal,
} from "@/lib/companionProgress";
import type { Snapshot } from "@/lib/motivation";
import { haptic } from "@/lib/haptics";
import { useSecondTick } from "@/lib/useSecondTick";
import AvatarPlayer from "./AvatarPlayer";
import StagePickerSheet from "./StagePickerSheet";
import Icon from "../ui/Icon";
import { getAvatarLevelMeta, TIER_META } from "@/lib/avatarLevels";
import {
  DEFAULT_STAGE_ID,
  FREE_STARTER_STAGE_IDS,
  getStageBackground,
  RARITY_TAG,
  STAGE_BACKGROUNDS,
  type StageBackgroundId,
} from "@/lib/stageBackgrounds";
import type { HealthAchievementProgress } from "@/lib/healthAchievements";
import { formatWeighTime } from "@/lib/weighIn";
import "./hero-stage.css";

const idInt = (n: number) => Math.round(Math.abs(n)).toLocaleString("id-ID");
const dec = (n: number, d = 1) =>
  n.toLocaleString("id-ID", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

function useLiveEnergyBalance(energy: EnergyView | null, waterMl: number) {
  const isToday = energy?.status === "ok" && energy.isToday;
  const tick = useSecondTick(Boolean(isToday));
  return useMemo(() => {
    if (!energy || energy.status !== "ok") return null;
    if (!energy.isToday || tick === null) {
      if (waterMl === energy.waterMl) return energy.balance;
      return (
        energyBalance({
          ...energy.input,
          waterMl,
          dayFraction: energy.isToday ? dayFractionCST() : 1,
        }) ?? energy.balance
      );
    }
    return (
      energyBalance({
        ...energy.input,
        waterMl,
        dayFraction: dayFractionCST(new Date(tick)),
      }) ?? energy.balance
    );
  }, [energy, tick, waterMl]);
}

const LiveNowWeightPill = memo(function LiveNowWeightPill({
  energy,
  waterMl,
}: {
  energy: EnergyView;
  waterMl: number;
}) {
  const live = useLiveEnergyBalance(energy, waterMl);
  const nowDeltaKg = live ? live.soFar.weight.bodyKg : null;
  if (nowDeltaKg === null) return null;
  return (
    <span className="hero-live-pill">
      <em className="hero-live-tick">
        {nowDeltaKg >= 0 ? "−" : "+"}
        {dec(Math.abs(nowDeltaKg), 4)} kg
      </em>{" "}
      skrg
    </span>
  );
});

const LiveDeficitChip = memo(function LiveDeficitChip({
  energy,
  waterMl,
  isLocked,
  onToggleDetail,
}: {
  energy: EnergyView;
  waterMl: number;
  isLocked: boolean;
  onToggleDetail: () => void;
}) {
  const live = useLiveEnergyBalance(energy, waterMl);
  if (!live) return null;
  const nowDeficit = live.soFar.balanceExact;
  return (
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
          {nowDeficit >= 0 ? "−" : "+"}
          {idInt(nowDeficit)}
          <small> kkal</small>
        </strong>
        <em>−{dec(live.rate.bodyGramsPerHour, 0)} g/jam</em>
      </span>
    </button>
  );
});

function HeroAvatarStage({
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
  stageId = DEFAULT_STAGE_ID,
  onSelectStage,
  achievements = [],
  unlockedStageIds,
  accuracyScore = null,
  accuracyAlert = null,
  onOpenCalibrate,
  onOpenReveal,
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
  stageId?: StageBackgroundId;
  onSelectStage?: (id: StageBackgroundId) => void;
  achievements?: HealthAchievementProgress[];
  unlockedStageIds?: Set<StageBackgroundId>;
  accuracyScore?: number | null;
  accuracyAlert?: string | null;
  onOpenCalibrate?: () => void;
  onOpenReveal?: (level?: number) => void;
}) {
  const unlockedLevel = Math.max(1, Math.min(12, Math.round(level)));
  const [viewLevel, setViewLevel] = useState(unlockedLevel);
  const [includeWater, setIncludeWater] = useState(false);
  const [waterPulsed, setWaterPulsed] = useState(false);
  const [stageSheetOpen, setStageSheetOpen] = useState(false);
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

  const baseLive = useMemo(() => {
    if (!energy || energy.status !== "ok") return null;
    if (waterMl === energy.waterMl) return energy.balance;
    return (
      energyBalance({
        ...energy.input,
        waterMl,
        dayFraction: energy.isToday ? dayFractionCST() : 1,
      }) ?? energy.balance
    );
  }, [energy, waterMl]);

  const anchorKg = energy?.status === "ok" ? energy.kg : null;
  const targetWeightNow = baseLive
    ? includeWater
      ? baseLive.stopEating.weightWithWaterKg
      : baseLive.stopEating.weightKg
    : null;

  const deltaKg =
    anchorKg !== null && targetWeightNow !== null
      ? anchorKg - targetWeightNow // positive = losing weight
      : null;

  const waterL = waterMl / 1000;
  const resolvedUnlockedStages =
    unlockedStageIds ?? new Set<StageBackgroundId>(FREE_STARTER_STAGE_IDS);
  const effectiveStage = getStageBackground(
    resolvedUnlockedStages.has(stageId) ? stageId : DEFAULT_STAGE_ID,
  );
  const currentMeta = getAvatarLevelMeta(character, viewLevel);

  const showLightning =
    effectiveStage.foilStyle === "gold" ||
    effectiveStage.id === "ember-forge" ||
    currentMeta.tier === "legendaris";

  return (
    <section
      className="hero-stage"
      data-stage={effectiveStage.id}
      data-tier={currentMeta.tier}
      data-foil={effectiveStage.foilStyle}
      data-rarity={effectiveStage.rarity}
      aria-label="Ringkasan berat dan progres real time"
    >
      {/* Decorative static TCG / UNITE holographic collector card layers */}
      <div className="hero-card-art" aria-hidden="true">
        <div className="hero-card-pattern" />
        <div className="hero-card-rays" />
        <div className="hero-card-frame" />
        {showLightning && (
          <svg className="hero-card-lightning" viewBox="0 0 360 440" fill="none">
            <path
              d="M22 84 L74 128 L52 152 L106 196"
              stroke="rgba(255,255,255,0.68)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M336 96 L282 142 L306 164 L256 212"
              stroke="rgba(254,240,138,0.78)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M34 316 L88 276 L72 254 L122 222"
              stroke="rgba(255,255,255,0.52)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      {/* Dedicated utility strip: quiet status badge left, Stage + Detail triggers right */}
      <div className="hero-stage-top">
        <span className={`hero-live-badge${isToday ? " is-live" : ""}`}>
          <span className="hero-live-dot" aria-hidden="true" />
          <span>{isToday ? "Live" : "Proyeksi"}</span>
        </span>
        <div className="hero-stage-actions">
          {onOpenCalibrate && (
            <button
              type="button"
              className={`hero-accuracy-btn${accuracyAlert ? " is-alert" : ""}`}
              onClick={onOpenCalibrate}
              aria-label="Kalibrasi akurasi kalori & siklus"
            >
              <span className="hero-acc-dot" aria-hidden="true" />
              <span>
                {typeof accuracyScore === "number"
                  ? `Akurasi ${accuracyScore}%`
                  : "Kalibrasi"}
              </span>
            </button>
          )}
          {onSelectStage && (
            <button
              type="button"
              className="hero-detail-btn"
              onClick={() => {
                haptic("tap");
                setStageSheetOpen(true);
              }}
              aria-label={`Pilih latar panggung (${effectiveStage.name})`}
            >
              <span
                className="hero-stage-swatch"
                style={{ backgroundColor: effectiveStage.accent }}
                aria-hidden="true"
              />
              <span>Ganti Latar</span>
              <span className="hero-stage-badge">
                {resolvedUnlockedStages.size}/{STAGE_BACKGROUNDS.length}
              </span>
            </button>
          )}
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
      </div>

      {/* Top-center focal readout above avatar head + Collector Card Badge */}
      <div className="hero-head-weight">
        <div className="hero-card-badge-row">
          <span
            className="hero-card-badge-pill"
            style={{ background: effectiveStage.foilGradient }}
          >
            ★ {effectiveStage.badgeLabel} · {effectiveStage.cardCode}
          </span>
          <span className="hero-card-rarity-tag">{RARITY_TAG[effectiveStage.rarity]}</span>
        </div>
        {anchorKg !== null && targetWeightNow !== null && baseLive ? (
          <div className="hero-weight-plate">
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
                  <strong>{dec(baseLive.stopEating.weightKg, 2)} kg</strong>
                </span>
              ) : (
                <>
                  <span>
                    {deltaKg !== null && Math.abs(deltaKg) >= 0.005
                      ? `${deltaKg > 0 ? "−" : "+"}${dec(Math.abs(deltaKg), 2)} kg`
                      : "≈ 0,00 kg"}{" "}
                    kalau stop makan
                  </span>
                  {isToday && energy && (
                    <LiveNowWeightPill energy={energy} waterMl={waterMl} />
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
          </div>
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
          {baseLive && energy && (
            <LiveDeficitChip
              energy={energy}
              waterMl={waterMl}
              isLocked={isLocked}
              onToggleDetail={onToggleDetail}
            />
          )}

          {baseLive && (
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
                  {idInt(baseLive.active)}
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

      {onSelectStage && (
        <div className="hero-stage-swatches" role="group" aria-label="Ganti cepat latar panggung">
          <span className="hero-swatch-label">Latar:</span>
          {FREE_STARTER_STAGE_IDS.map((sid) => {
            const st = getStageBackground(sid);
            const active = effectiveStage.id === sid;
            return (
              <button
                key={sid}
                type="button"
                className={`hero-swatch-btn${active ? " is-active" : ""}`}
                onClick={() => {
                  haptic("tap");
                  onSelectStage(sid);
                }}
                aria-pressed={active}
                aria-label={`Pakai latar ${st.name}`}
                title={st.name}
              >
                <span style={{ background: st.previewGradient }} />
              </button>
            );
          })}
          <button
            type="button"
            className="hero-swatch-more"
            onClick={() => {
              haptic("tap");
              setStageSheetOpen(true);
            }}
          >
            Semua ({resolvedUnlockedStages.size}/{STAGE_BACKGROUNDS.length})
          </button>
          {!isLocked && onOpenReveal && (
            <button
              type="button"
              className="hero-reveal-btn"
              onClick={() => {
                haptic("tap");
                onOpenReveal(viewLevel);
              }}
              aria-label={`Putar animasi Legendary Reveal Level ${viewLevel}`}
            >
              ✨ Reveal
            </button>
          )}
        </div>
      )}
      {onSelectStage && (
        <StagePickerSheet
          open={stageSheetOpen}
          onClose={() => setStageSheetOpen(false)}
          selectedId={effectiveStage.id}
          onSelect={onSelectStage}
          achievements={achievements}
          unlockedStageIds={resolvedUnlockedStages}
        />
      )}
    </section>
  );
}

export default memo(HeroAvatarStage);
