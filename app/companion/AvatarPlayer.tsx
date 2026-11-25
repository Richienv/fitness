"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { Character } from "@/lib/companionProgress";
import {
  avatarImageSrc,
  clampAvatarLevel,
  getAvatarLevelMeta,
  TIER_META,
} from "@/lib/avatarLevels";
import { haptic } from "@/lib/haptics";

export default function AvatarPlayer({
  character = "richie",
  level = 1,
  duo = false,
  locked = false,
  autoPlay = false,
  minimalControls = false,
  showPlaybackControl = false,
}: {
  character?: Character;
  level?: number;
  duo?: boolean;
  /** Mystery-silhouette lock for levels above current unlocked progress. */
  locked?: boolean;
  /** Used for the duo 6-frame turnaround animation. */
  autoPlay?: boolean;
  /** Compact stage presentation used on the Home hero overlay. */
  minimalControls?: boolean;
  showPlaybackControl?: boolean;
}) {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(autoPlay),
    [engaged, setEngaged] = useState(autoPlay),
    [frame, setFrame] = useState(0),
    [loaded, setLoaded] = useState(false),
    [bouncing, setBouncing] = useState(false);
  const host = useRef<HTMLDivElement>(null),
    visible = useRef(true),
    drag = useRef<{ x: number; frame: number } | null>(null),
    bounceTimer = useRef<number | null>(null);

  // Duo mode keeps the existing 6-frame 3×2 turnaround sheet on /login, /companion, AuthFrame.
  const count = 6,
    columns = 3;
  const sheet = "/avatars/v2/duo-sheet.webp",
    poster = "/avatars/v2/duo-poster.webp";

  useEffect(() => {
    if (!duo) return;
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
  }, [duo, sheet, engaged]);

  useEffect(() => {
    if (!duo) return;
    const o = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
    });
    if (host.current) o.observe(host.current);
    return () => o.disconnect();
  }, [duo]);

  useEffect(() => {
    if (!duo || !playing || reduced || !loaded) return;
    const t = setInterval(() => {
      if (!document.hidden && visible.current)
        setFrame((f) => (f + 1) % count);
    }, 420);
    return () => clearInterval(t);
  }, [duo, playing, reduced, loaded, count]);

  useEffect(() => {
    return () => {
      if (bounceTimer.current !== null) window.clearTimeout(bounceTimer.current);
    };
  }, []);

  if (duo) {
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
      <div className="avatar-player avatar-duo" ref={host}>
        <div
          className="avatar-art"
          role="img"
          aria-label="Richie dan Renita"
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
        {showPlaybackControl && !reduced && (
          <button
            className="entry-animation-control"
            type="button"
            aria-label={playing ? "Jeda animasi" : "Putar animasi"}
            onClick={togglePlay}
          >
            {playing ? "Jeda" : "Putar"}
          </button>
        )}
      </div>
    );
  }

  const clamped = clampAvatarLevel(level);
  const meta = getAvatarLevelMeta(character, clamped);
  const tier = TIER_META[meta.tier];
  const src = avatarImageSrc(character, clamped);
  const who = character === "richie" ? "Richie" : "Renita";

  const triggerBounce = () => {
    if (locked || reduced) return;
    haptic("tap");
    setBouncing(false);
    if (bounceTimer.current !== null) window.clearTimeout(bounceTimer.current);
    requestAnimationFrame(() => {
      setBouncing(true);
      bounceTimer.current = window.setTimeout(() => {
        setBouncing(false);
        bounceTimer.current = null;
      }, 520);
    });
  };

  return (
    <div
      className={`avatar-player avatar-showcase${locked ? " is-locked" : ` tier-${meta.tier}`}${minimalControls ? " avatar-minimal" : ""}`}
      ref={host}
      style={locked ? undefined : ({ ["--avatar-aura" as string]: tier.aura } as CSSProperties)}
    >
      {!locked && <span className="avatar-aura" aria-hidden="true" />}
      <button
        type="button"
        className={`avatar-stage-btn${bouncing ? " is-bouncing" : ""}`}
        onClick={triggerBounce}
        disabled={locked}
        tabIndex={locked ? -1 : undefined}
        aria-label={
          locked
            ? `${who} level ${clamped}, terkunci (siluet rahasia)`
            : `${who} level ${clamped}, ${meta.title}`
        }
      >
        <img
          key={`${character}-${clamped}`}
          src={src}
          alt={
            locked
              ? `${who} level ${clamped} (siluet terkunci)`
              : `${who} level ${clamped} — ${meta.title}`
          }
          className="avatar-stage-img"
          width={576}
          height={768}
          decoding="async"
          draggable={false}
        />
      </button>
    </div>
  );
}
