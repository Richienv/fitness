"use client";

import { useState } from "react";
import type { ShadowRecommendation } from "@/lib/habitGraph";
import { haptic } from "@/lib/haptics";
import Icon from "./Icon";

function formatMetrics(offer: ShadowRecommendation): { lead: string; tail: string } {
  if (offer.meal) {
    const items = offer.meal.items;
    const totalGrams = items.reduce((s, i) => s + (i.grams || 0), 0);
    const portion =
      items.length > 1
        ? `${items.length} item${totalGrams > 0 ? ` · ${Math.round(totalGrams)} g` : ""}`
        : items[0]?.portionLabel || (totalGrams > 0 ? `${Math.round(totalGrams)} g` : "1 porsi");
    return {
      lead: `${Math.round(offer.meal.kcal).toLocaleString("id-ID")} kkal · ${Math.round(offer.meal.protein)} g protein`,
      tail: portion,
    };
  }
  if (offer.workout) {
    const w = offer.workout;
    const detail =
      w.kind === "activity"
        ? `${w.durationMin} mnt`
        : `${w.exercisesCount} gerakan · ${w.setsCount} set · ~${w.durationMin} mnt`;
    return {
      lead: w.estimatedKcal > 0 ? `≈ ${Math.round(w.estimatedKcal).toLocaleString("id-ID")} kkal` : `${w.setsCount} set`,
      tail: detail,
    };
  }
  return { lead: "", tail: "" };
}

export default function ShadowRecommendations({
  offers,
  variant = "home",
  title = "Tombol Bayangan",
  subtitle = "Prediksi kebiasaan",
  onConfirm,
  onQuickEdit,
  onDismiss,
}: {
  offers: ShadowRecommendation[];
  variant?: "home" | "meal" | "tray" | "workout";
  title?: string;
  subtitle?: string;
  onConfirm: (offer: ShadowRecommendation) => void;
  onQuickEdit: (offer: ShadowRecommendation) => void;
  onDismiss: (offer: ShadowRecommendation) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  if (!offers.length) return null;

  const handleConfirm = (offer: ShadowRecommendation) => {
    if (confirmingId === offer.id) return;
    haptic("success");
    setConfirmingId(offer.id);
    window.setTimeout(() => {
      setConfirmingId(null);
      onConfirm(offer);
    }, 180);
  };

  const handleDismiss = (offer: ShadowRecommendation) => {
    if (dismissingId === offer.id) return;
    haptic("tap");
    setDismissingId(offer.id);
    window.setTimeout(() => {
      setDismissingId(null);
      onDismiss(offer);
    }, 160);
  };

  return (
    <section
      className={`shadow-deck variant-${variant}`}
      aria-label={title}
    >
      <div className="shadow-deck-head">
        <h2 className="shadow-deck-title">
          <Icon name="zap" size={14} />
          <span>{title}</span>
        </h2>
        <span className="shadow-deck-pill">{subtitle}</span>
      </div>
      <div className="shadow-list">
        {offers.map((offer) => {
          const metrics = formatMetrics(offer);
          const isConfirming = confirmingId === offer.id;
          const isDismissing = dismissingId === offer.id;
          return (
            <article
              key={offer.id}
              className={`shadow-card kind-${offer.kind}${isConfirming ? " is-confirming" : ""}${isDismissing ? " is-dismissing" : ""}`}
            >
              <div className="shadow-card-body">
                <div className="shadow-card-kicker">
                  <span className="shadow-badge">{offer.badge}</span>
                  <span className="shadow-reason">{offer.reason}</span>
                </div>
                <h3 className="shadow-card-title">{offer.title}</h3>
                <div className="shadow-card-metrics">
                  <span>{metrics.tail}</span>
                  {metrics.tail && metrics.lead ? " · " : ""}
                  <strong>{metrics.lead}</strong>
                </div>
              </div>
              <div className="shadow-actions">
                <button
                  type="button"
                  className="shadow-btn-check"
                  aria-label={`Catat 1 ketuk ${offer.title}`}
                  title="Catat langsung (1 ketuk)"
                  onClick={() => handleConfirm(offer)}
                >
                  <Icon name="check" size={18} />
                </button>
                <button
                  type="button"
                  className="shadow-btn-edit"
                  aria-label={`Ubah porsi atau set ${offer.title}`}
                  title="Ubah cepat"
                  onClick={() => {
                    haptic("tap");
                    onQuickEdit(offer);
                  }}
                >
                  <Icon name="edit" size={15} />
                </button>
                <button
                  type="button"
                  className="shadow-btn-dismiss"
                  aria-label={`Sembunyikan prediksi ${offer.title}`}
                  title="Sembunyikan"
                  onClick={() => handleDismiss(offer)}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
