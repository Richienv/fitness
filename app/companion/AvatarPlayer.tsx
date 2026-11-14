"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { Character } from "@/lib/companionProgress";
export default function AvatarPlayer({
  character = "richie",
  level = 1,
  duo = false,
  showPlaybackControl = false,
}: {
  character?: Character;
  level?: number;
  duo?: boolean;
  showPlaybackControl?: boolean;
}) {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true),
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
  useEffect(() => {
    let current = true;
    setLoaded(false);
    setFrame(0);
    const img = new Image();
    img.onload = () => {
      if (current) setLoaded(true);
    };
    img.src = sheet;
    return () => {
      current = false;
    };
  }, [sheet]);
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
  const step = (n: number) => {
    setPlaying(false);
    setFrame((f) => (f + n + count) % count);
  };
  return (
    <div className={`avatar-player${duo ? " avatar-duo" : ""}`} ref={host}>
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
        }}
        onPointerDown={(e) => {
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
          backgroundImage: `url('${loaded ? sheet : poster}')`,
          backgroundSize: loaded ? `${columns * 100}% 200%` : "100% 100%",
          backgroundPosition: loaded
            ? `${((frame % columns) / (columns - 1)) * 100}% ${frame >= columns ? 100 : 0}%`
            : "center",
        }}
      />
      {duo && showPlaybackControl && !reduced && (
        <button className="entry-animation-control" type="button"
          aria-label={playing ? "Jeda animasi" : "Putar animasi"}
          onClick={() => setPlaying((p) => !p)}>
          {playing ? "Jeda" : "Putar"}
        </button>
      )}
      {!duo && (
        <div className="avatar-controls">
          <button onClick={() => step(-1)} aria-label="Putar ke kiri">
            ‹
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing && !reduced ? "Jeda rotasi" : "Putar avatar"}
            disabled={reduced}
          >
            {playing && !reduced ? "Ⅱ" : "▷"}
          </button>
          <button onClick={() => step(1)} aria-label="Putar ke kanan">
            ›
          </button>
        </div>
      )}
    </div>
  );
}
