"use client";

import { useEffect } from "react";
import { haptic } from "@/lib/haptics";
import { useModalScrollLock } from "@/lib/scrollLock";
import {
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
              {unlockedCount} / {STAGE_BACKGROUNDS.length} latar terbuka — dibuka lewat kebiasaan sehat harian
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
            const unlocked = stage.id === "clean-studio" || unlockedStageIds.has(stage.id);
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
                  style={{ background: stage.previewGradient }}
                >
                  <span
                    className="stage-swatch-dot"
                    style={{ backgroundColor: stage.accent }}
                    aria-hidden="true"
                  />
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
                  ) : (
                    <small className="stage-science">Tampilan default bersih &amp; terang</small>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
