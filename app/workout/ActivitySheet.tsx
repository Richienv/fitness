"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ACTIVITY_BY_KEY,
  ACTIVITY_KINDS,
  activityKcal,
  type ActivityKey,
  type Intensity,
} from "@/lib/burn";

const PRESETS: Record<"steps" | "minutes" | "reps", number[]> = {
  steps: [2000, 5000, 8000, 10000],
  minutes: [15, 30, 45, 60],
  reps: [10, 20, 30, 50],
};
const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");

/** Log one activity: pick what, type how much, see the estimate, save. */
export default function ActivitySheet({
  kg,
  onSave,
  onClose,
}: {
  kg: number;
  onSave: (a: {
    kind: ActivityKey;
    steps?: number;
    minutes?: number;
    reps?: number;
    intensity?: Intensity;
  }) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ActivityKey>("langkah");
  const [amount, setAmount] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("sedang");
  const input = useRef<HTMLInputElement>(null);
  const k = ACTIVITY_BY_KEY[kind];
  const n = Number(amount.replace(/\./g, "").replace(",", "."));
  const valid = Number.isFinite(n) && n > 0 && n < 200000;
  const entry = {
    kind,
    ...(k.input === "steps" ? { steps: n } : {}),
    ...(k.input === "minutes" ? { minutes: n, intensity } : {}),
    ...(k.input === "reps" ? { reps: n } : {}),
  };
  const estimate = valid ? activityKcal(entry, kg) : 0;

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, [kind]);

  // Rendered into <body>: Latihan's page wrapper is transformed, which would
  // make a fixed sheet position against the page instead of the screen.
  return createPortal(
    <div className="mk-sheet-backdrop" onClick={onClose}>
      <div
        className="mk-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lt-act-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h2 id="lt-act-title">Catat aktivitas</h2>
        <div className="lt-kinds" role="radiogroup" aria-label="Jenis aktivitas">
          {ACTIVITY_KINDS.map((a) => (
            <button
              key={a.key}
              type="button"
              role="radio"
              aria-checked={kind === a.key}
              className={kind === a.key ? "on" : ""}
              onClick={() => {
                setKind(a.key);
                setAmount("");
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <label className="lt-field">
          <span>
            {k.input === "steps"
              ? "Jumlah langkah"
              : k.input === "minutes"
                ? "Berapa menit"
                : "Berapa kali"}
          </span>
          <span className="lt-field-row">
            <input
              ref={input}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) onSave(entry);
              }}
              placeholder="0"
            />
            <span>{k.unit}</span>
          </span>
        </label>
        <div className="lt-presets">
          {PRESETS[k.input].map((p) => (
            <button key={p} type="button" onClick={() => setAmount(String(p))}>
              {fmt(p)}
            </button>
          ))}
        </div>
        {k.input === "minutes" && kind !== "plank" && (
          <div className="segment lt-intensity" role="group" aria-label="Intensitas">
            {(["santai", "sedang", "berat"] as const).map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={intensity === i}
                onClick={() => setIntensity(i)}
              >
                {i[0].toUpperCase() + i.slice(1)}
              </button>
            ))}
          </div>
        )}
        <p className="lt-estimate" aria-live="polite">
          {valid ? (
            <>
              Perkiraan <strong>≈ {fmt(estimate)} kkal</strong>
            </>
          ) : (
            "Isi angkanya untuk melihat perkiraan kalori."
          )}
        </p>
        <div className="mk-dlg-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!valid}
            onClick={() => onSave(entry)}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
