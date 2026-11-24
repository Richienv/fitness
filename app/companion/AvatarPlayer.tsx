"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { Character } from "@/lib/companionProgress";
import Icon from "../ui/Icon";

export default function AvatarPlayer({
  character = "richie",
  level = 1,
  duo = false,
  autoPlay = false,
  minimalControls = false,
  showPlaybackControl = false,
}: {
  character?: Character;
  level?: number;
  duo?: boolean;
  /** Paused by default so the Home stage is calm & fast; user can tap Play or drag to rotate. */
  autoPlay?: boolean;
  /** Single sleek floating Play/Pause pill (used on the Home overlay stage). */
  minimalControls?: boolean;
  showPlaybackControl?: boolean;
}) {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(autoPlay),
    [engaged, setEngaged] = useState(autoPlay),
    [frame, setFrame] = useState(0),
    [loaded, setLoaded] = useState(false);
  const host = useRef<HTMLDivElement>(null),
    visible = useRef(true),
    drag = useRef<{ x: number; frame: number } | null>(null);
  const count = duo ? 6 : 8,
    columns = duo ? 3 : 4,
    base = duo
      ? "duo"
      : `${character}-level-${String(Math.max(1, Math.min(12, level))).padStart(2, "0")}`;
  const revision = base === "renita-level-07" ? "?revision=3" : "";
  const sheet = `/avatars/v2/${base}-sheet.webp${revision}`,
    poster = `/avatars/v2/${base}-poster.webp${revision}`;

  // Lazy-load the multi-frame sprite sheet only once the user plays or interacts,
  // keeping initial boot fast with the lightweight static poster.
  useEffect(() => {
    setLoaded(false);
    setFrame(0);
    if (!engaged) return;
    let current = true;
    const img = new Image();
    img.onload = () => {
      if (current) setLoaded(true);
    };
    img.src = sheet;
    return () => {
      current = false;
    };
  }, [sheet, engaged]);

  useEffect(() => {
    const o = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
    });
    if (host.current) o.observe(host.current);
    return () => o.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || reduced || !loaded) return;
    const t = setInterval(
      () => {
        if (!document.hidden && visible.current)
          setFrame((f) => (f + 1) % count);
      },
      duo ? 420 : 400,
    );
    return () => clearInterval(t);
  }, [playing, reduced, loaded, count, duo]);

  const togglePlay = () => {
    setEngaged(true);
    setPlaying((p) => !p);
  };

  const step = (n: number) => {
    setEngaged(true);
    setPlaying(false);
    setFrame((f) => (f + n + count) % count);
  };

  const showSheet = loaded && (playing || frame !== 0);

  return (
    <div
      className={`avatar-player${duo ? " avatar-duo" : ""}${minimalControls ? " avatar-minimal" : ""}`}
      ref={host}
    >
      <div
        className="avatar-art"
        role="img"
        aria-label={
          duo
            ? "Richie dan Renita"
            : `${character === "richie" ? "Richie" : "Renita"}, ilustrasi level ${level}`
        }
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            step(1);
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            step(-1);
          }
          if (e.key === " ") {
            e.preventDefault();
            if (!reduced) togglePlay();
          }
        }}
        onPointerDown={(e) => {
          setEngaged(true);
          drag.current = { x: e.clientX, frame };
          e.currentTarget.setPointerCapture(e.pointerId);
          setPlaying(false);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setFrame(
              (((drag.current.frame +
                Math.round((e.clientX - drag.current.x) / 30)) %
                count) +
                count) %
                count,
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        style={{
          backgroundImage: `url('${showSheet ? sheet : poster}')`,
          backgroundSize: showSheet ? `${columns * 100}% 200%` : "contain",
          backgroundPosition: showSheet
            ? `${((frame % columns) / (columns - 1)) * 100}% ${frame >= columns ? 100 : 0}%`
            : "center bottom",
        }}
      />
      {duo && showPlaybackControl && !reduced && (
        <button
          className="entry-animation-control"
          type="button"
          aria-label={playing ? "Jeda animasi" : "Putar animasi"}
          onClick={togglePlay}
        >
          {playing ? "Jeda" : "Putar"}
        </button>
      )}
      {!duo && minimalControls && !reduced && (
        <button
          type="button"
          className={`avatar-play-pill${playing ? " is-playing" : ""}`}
          onClick={togglePlay}
          aria-label={playing ? "Jeda rotasi avatar" : "Putar avatar 360"}
        >
          <Icon name={playing ? "pause" : "play"} size={13} />
          <span>{playing ? "Jeda" : "Putar"}</span>
        </button>
      )}
      {!duo && !minimalControls && (
        <div className="avatar-controls">
          <button type="button" onClick={() => step(-1)} aria-label="Putar ke kiri">
            ‹
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing && !reduced ? "Jeda rotasi" : "Putar avatar"}
            disabled={reduced}
          >
            {playing && !reduced ? "Ⅱ" : "▷"}
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Putar ke kanan">
            ›
          </button>
        </div>
      )}
    </div>
  );
}
