"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  getExerciseDemo,
  getExerciseDetail,
  youtubeSearchUrl,
} from "@/lib/exerciseData";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** "Cara": how to do one exercise, from Latihan in one tap. Two demo frames
 *  alternate (still under reduced motion), then the muscle, the feel, the
 *  form cues and the common mistakes, and a video search as a fallback. */
export default function ExerciseGuide({
  name,
  sets,
  onClose,
}: {
  name: string;
  sets?: string;
  onClose: () => void;
}) {
  const demo = getExerciseDemo(name);
  const detail = getExerciseDetail(name);
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  const hasDemo = !!demo;
  useEffect(() => {
    if (!hasDemo || reduced) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % 2), 900);
    return () => clearInterval(t);
  }, [hasDemo, reduced, name]);
  // Rendered into <body>: Latihan's page wrapper is transformed, which would
  // make a fixed sheet position against the page instead of the screen.
  return createPortal(
    <div className="mk-sheet-backdrop" onClick={onClose}>
      <div
        className="mk-sheet lt-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lt-guide-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h2 id="lt-guide-title">{name}</h2>
        {sets && <p>{sets}</p>}
        {demo && !failed ? (
          <img
            className="lt-guide-img"
            src={demo.frames[frame]}
            alt={`Contoh gerakan ${name}`}
            onError={() => setFailed(true)}
          />
        ) : (
          <p className="lt-empty">
            Gambar contoh belum tersedia untuk gerakan ini.
          </p>
        )}
        {detail && (
          <dl className="lt-guide-facts">
            <div>
              <dt>Otot utama</dt>
              <dd>{detail.primary}</dd>
            </div>
            {detail.secondary && (
              <div>
                <dt>Ikut bekerja</dt>
                <dd>{detail.secondary}</dd>
              </div>
            )}
            <div>
              <dt>Terasa di</dt>
              <dd>{detail.feelIt}</dd>
            </div>
          </dl>
        )}
        {detail && detail.formTips.length > 0 && (
          <>
            <h3>Cara melakukannya</h3>
            <ol className="lt-guide-list">
              {detail.formTips.slice(0, 5).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </>
        )}
        {detail && detail.mistakes.length > 0 && (
          <>
            <h3>Hindari</h3>
            <ul className="lt-guide-list">
              {detail.mistakes.slice(0, 3).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
        <a
          className="secondary-button mk-sheet-wide"
          href={youtubeSearchUrl(name)}
          target="_blank"
          rel="noreferrer"
        >
          Tonton video contoh
        </a>
        <button
          type="button"
          className="primary-button mk-sheet-wide"
          onClick={onClose}
        >
          Tutup
        </button>
      </div>
    </div>,
    document.body,
  );
}
