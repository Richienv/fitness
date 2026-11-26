"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  avatarImageSrc,
  avatarLivingSheetSrc,
  clampAvatarLevel,
  getAvatarLevelMeta,
  POSE_LABELS,
  POSE_QUIPS,
  type AvatarTier,
} from "@/lib/avatarLevels";
import type { Character } from "@/lib/companionProgress";
import { haptic } from "@/lib/haptics";
import {
  playLegendaryRevealSound,
  playRevealPoseTapSound,
  type RevealRarity,
} from "@/lib/revealSound";
import { useModalScrollLock } from "@/lib/scrollLock";
import {
  DEFAULT_STAGE_ID,
  getStageBackground,
  RARITY_TAG,
  type StageBackgroundId,
} from "@/lib/stageBackgrounds";
import "./legendary-reveal.css";

export type LegendaryRevealPayload = {
  character: Character;
  level: number;
  stageId?: StageBackgroundId;
  eyebrow?: string;
  customTitle?: string;
  customSubtitle?: string;
  rarityOverride?: RevealRarity;
};

const MUTE_KEY = "r2.revealMuted.v1";

const TIER_TO_RARITY: Record<AvatarTier, RevealRarity> = {
  pemula: "rare",
  naik_kelas: "epic",
  keren: "gold",
  legendaris: "legendary",
};

const PARTICLE_SEEDS = Array.from({ length: 28 }, (_, i) => {
  const angle = (i / 28) * Math.PI * 2 + (i % 3) * 0.14;
  const dist = 120 + ((i * 53) % 190);
  const px = Math.round(Math.cos(angle) * dist);
  const py = Math.round(Math.sin(angle) * dist - 30);
  const size = 4 + ((i * 3) % 6);
  const dur = (1.35 + ((i * 19) % 85) / 100).toFixed(2);
  const delay = (1.12 + ((i * 7) % 18) / 100).toFixed(2);
  const colors = ["#ffffff", "#fde047", "#38bdf8", "#f472b6", "#c084fc"];
  return {
    id: i,
    px: `${px}px`,
    py: `${py}px`,
    ps: `${size}px`,
    pd: `${dur}s`,
    pdelay: `${delay}s`,
    pc: colors[i % colors.length],
  };
});

function readMutedPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function LegendaryRevealOverlay({
  payload,
  onClose,
}: {
  payload: LegendaryRevealPayload | null;
  onClose: () => void;
}) {
  const open = Boolean(payload);
  useModalScrollLock(open);

  const [runId, setRunId] = useState(1);
  const [muted, setMuted] = useState<boolean>(readMutedPref);
  const [poseIdx, setPoseIdx] = useState(0);
  const [livingLoaded, setLivingLoaded] = useState(false);
  const [quip, setQuip] = useState("");
  const quipTimer = useRef<number | null>(null);
  const tapCount = useRef(0);

  const clampedLevel = clampAvatarLevel(payload?.level ?? 1);
  const character = payload?.character ?? "richie";
  const stage = getStageBackground(payload?.stageId ?? DEFAULT_STAGE_ID);
  const meta = getAvatarLevelMeta(character, clampedLevel);
  const rarity: RevealRarity =
    payload?.rarityOverride ?? TIER_TO_RARITY[meta.tier] ?? stage.rarity;

  const fallbackImg = avatarImageSrc(character, clampedLevel);
  const livingSheet = avatarLivingSheetSrc(character, clampedLevel);

  useEffect(() => {
    if (!payload) return;
    setPoseIdx(0);
    setQuip("");
    setLivingLoaded(false);
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (active) setLivingLoaded(true);
    };
    img.src = livingSheet;
    return () => {
      active = false;
    };
  }, [payload, livingSheet]);

  useEffect(() => {
    if (!payload) return;
    const stopAudio = muted ? () => {} : playLegendaryRevealSound(rarity);
    const hapticTimer = window.setTimeout(() => {
      haptic("success");
    }, 1140);
    return () => {
      stopAudio();
      window.clearTimeout(hapticTimer);
    };
  }, [payload, runId, rarity, muted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (quipTimer.current !== null) window.clearTimeout(quipTimer.current);
    };
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  const handleReplay = useCallback(() => {
    haptic("tap");
    setPoseIdx(0);
    setQuip("");
    setRunId((id) => id + 1);
  }, []);

  const handleTapCard = useCallback(() => {
    haptic("tap");
    if (!muted) playRevealPoseTapSound();
    tapCount.current += 1;
    setPoseIdx((prev) => {
      const next = (prev + 1) % 5;
      const pool = POSE_QUIPS[next] ?? POSE_QUIPS[0];
      setQuip(pool[tapCount.current % pool.length]);
      return next;
    });
    if (quipTimer.current !== null) window.clearTimeout(quipTimer.current);
    quipTimer.current = window.setTimeout(() => {
      setQuip("");
      quipTimer.current = null;
    }, 1400);
  }, [muted]);

  const cardCss = useMemo(
    () =>
      ({
        ["--lr-foil" as string]: stage.foilGradient,
        ["--lr-stage-bg" as string]: stage.previewGradient,
      }) as CSSProperties,
    [stage.foilGradient, stage.previewGradient],
  );

  if (!payload) return null;

  const who = character === "richie" ? "Richie" : "Renita";
  const showLightning = rarity === "gold" || rarity === "legendary";

  return (
    <div
      className="lr-backdrop"
      data-rarity={rarity}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lr-reveal-name"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lr-flash-screen" key={`flash-${runId}`} aria-hidden="true" />

      <div className="lr-scene" key={`scene-${runId}`}>
        <div className="lr-charge-core" aria-hidden="true" />
        <div className="lr-charge-ring" aria-hidden="true" />
        <div className="lr-charge-ring r2" aria-hidden="true" />
        <div className="lr-god-rays" aria-hidden="true" />
        <div className="lr-shockwave" aria-hidden="true" />
        <div className="lr-shockwave s2" aria-hidden="true" />

        <div className="lr-silhouette-wrap" aria-hidden="true">
          <img src={fallbackImg} alt="" className="lr-silhouette-img" />
        </div>

        <div className="lr-particles" aria-hidden="true">
          {PARTICLE_SEEDS.map((p) => (
            <span
              key={p.id}
              className="lr-particle"
              style={
                {
                  "--px": p.px,
                  "--py": p.py,
                  "--ps": p.ps,
                  "--pd": p.pd,
                  "--pdelay": p.pdelay,
                  "--pc": p.pc,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <button
          type="button"
          className="lr-card"
          style={cardCss}
          onClick={handleTapCard}
          aria-label={`${who} Level ${clampedLevel} ${meta.title} — ketuk kartu untuk ganti pose`}
        >
          <div className="lr-card-inner">
            <div className="lr-card-unite-pattern" aria-hidden="true" />

            <div className="lr-card-head">
              <span className="lr-card-badge">
                ★ {stage.badgeLabel} · {RARITY_TAG[rarity]}
              </span>
              <span className="lr-card-lv">LV {clampedLevel}</span>
            </div>

            <div className="lr-card-art">
              {showLightning && (
                <svg
                  className="lr-card-lightning"
                  viewBox="0 0 300 340"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M28 52 L82 96 L58 118 L112 162"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M276 74 L218 116 L242 138 L194 186"
                    stroke="rgba(254,240,138,0.9)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M42 268 L96 226 L82 204 L132 174"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}

              {quip && <span className="lr-card-quip">{quip}</span>}

              {livingLoaded ? (
                <div
                  role="img"
                  aria-label={`${who} ${meta.title} pose ${POSE_LABELS[poseIdx]}`}
                  className="lr-card-sprite"
                  style={{
                    backgroundImage: `url('${livingSheet}')`,
                    backgroundSize: "500% 100%",
                    backgroundPosition: `${(poseIdx / 4) * 100}% 0%`,
                  }}
                >
                  <svg viewBox="0 0 3 4" style={{ height: "100%", width: "auto", display: "block" }} />
                </div>
              ) : (
                <img
                  src={fallbackImg}
                  alt={`${who} Level ${clampedLevel}`}
                  className="lr-card-img"
                />
              )}
            </div>

            <div className="lr-card-foot">
              <span>🐾 {meta.companion}</span>
              <span className="lr-card-tap-hint">Ketuk kartu · {POSE_LABELS[poseIdx]}</span>
            </div>

            <div className="lr-card-foil-sweep" aria-hidden="true" />
          </div>
        </button>

        <div className="lr-text-block">
          <span className="lr-eyebrow">
            {payload.eyebrow || `${who.toUpperCase()} · LEVEL ${clampedLevel} / 12`}
          </span>
          <h2 id="lr-reveal-name" className="lr-name">
            {payload.customTitle || meta.title}
          </h2>
          <p className="lr-sub">{payload.customSubtitle || meta.subtitle}</p>
        </div>

        <div className="lr-controls">
          <button type="button" className="lr-btn-replay" onClick={handleReplay}>
            ⚡ Putar Ulang
          </button>
          <button type="button" className="lr-btn-ghost" onClick={handleToggleMute}>
            {muted ? "🔇 Bisu" : "🔊 Suara"}
          </button>
          <button type="button" className="lr-btn-ghost" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
