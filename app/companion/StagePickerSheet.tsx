"use client";

import { useEffect } from "react";
import { haptic } from "@/lib/haptics";
import { useModalScrollLock } from "@/lib/scrollLock";
import {
  FREE_STARTER_STAGE_IDS,
  RARITY_TAG,
  STAGE_BACKGROUNDS,
  type StageBackgroundId,
} from "@/lib/stageBackgrounds";
import type { HealthAchievementProgress } from "@/lib/healthAchievements";
import Icon from "../ui/Icon";

export default function StagePickerSheet({
  open,
  onClose,
  selectedId,
  onSelect,
  achievements,
  unlockedStageIds,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: StageBackgroundId;
  onSelect: (id: StageBackgroundId) => void;
  achievements: HealthAchievementProgress[];
  unlockedStageIds: Set<StageBackgroundId>;
}) {
  useModalScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const byKey = new Map<string, HealthAchievementProgress>(
    achievements.map((a) => [a.key, a]),
  );
  const unlockedCount = unlockedStageIds.size;

  return (
    <div
      className="stage-sheet-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="stage-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="stage-sheet-head">
          <div>
            <h2 id="stage-picker-title">Latar Panggung &amp; Pencapaian</h2>
            <p className="stage-sheet-sub">
              {unlockedCount} / {STAGE_BACKGROUNDS.length} latar terbuka — 3 bawaan gratis + 8 pencapaian kebiasaan sehat
            </p>
          </div>
          <button
            type="button"
            className="stage-sheet-close"
            onClick={onClose}
            aria-label="Tutup pemilih latar"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="stage-grid">
          {STAGE_BACKGROUNDS.map((stage) => {
            const ach = stage.achievementKey ? byKey.get(stage.achievementKey) : null;
            const isStarter = FREE_STARTER_STAGE_IDS.includes(stage.id);
            const unlocked = isStarter || unlockedStageIds.has(stage.id);
            const active = selectedId === stage.id;
            const pct = ach ? Math.round(ach.pct * 100) : 100;

            return (
              <button
                key={stage.id}
                type="button"
                className={`stage-card${active ? " is-active" : ""}${unlocked ? " is-unlocked" : " is-locked"}`}
                onClick={() => {
                  if (!unlocked) {
                    haptic("error");
                    return;
                  }
                  haptic("success");
                  onSelect(stage.id);
                  onClose();
                }}
                aria-pressed={active}
                aria-disabled={!unlocked}
              >
                <div
                  className="stage-swatch"
                  data-foil={stage.foilStyle}
                  style={{ background: stage.previewGradient }}
                >
                  <div className="stage-swatch-meta">
                    <span className="stage-swatch-code">{stage.cardCode}</span>
                    <span className="stage-swatch-label">
                      ★ {stage.badgeLabel} · {RARITY_TAG[stage.rarity]}
                    </span>
                  </div>
                  {active ? (
                    <span className="stage-badge active">Dipakai ✓</span>
                  ) : unlocked ? (
                    <span className="stage-badge open">Terbuka</span>
                  ) : (
                    <span className="stage-badge locked">
                      <Icon name="lock" size={11} />
                      <span>Terkunci</span>
                    </span>
                  )}
                </div>

                <div className="stage-card-body">
                  <strong>{stage.name}</strong>
                  <p className="stage-card-desc">
                    {ach ? ach.description : stage.tagline}
                  </p>

                  {ach ? (
                    <>
                      <div className="stage-progress-row">
                        <div className="stage-progress-track" aria-hidden="true">
                          <span
                            className="stage-progress-fill"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: unlocked ? "#16a34a" : stage.accent,
                            }}
                          />
                        </div>
                        <span className="stage-progress-num">
                          {ach.current}/{ach.target} {ach.unitLabel}
                        </span>
                      </div>
                      <small className="stage-science">{ach.scienceNote}</small>
                    </>
                  ) : isStarter ? (
                    <small className="stage-science">Bawaan gratis · siap pakai</small>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
