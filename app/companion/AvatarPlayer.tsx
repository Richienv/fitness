"use client";
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { Character } from "@/lib/companionProgress";
import {
  avatarImageSrc,
  avatarSheetSrc,
  clampAvatarLevel,
  getAvatarLevelMeta,
  TIER_META,
} from "@/lib/avatarLevels";
import { haptic } from "@/lib/haptics";

type ActionKind = "jump" | "spin" | "surge";

const ACTION_QUIPS: Record<ActionKind, readonly string[]> = {
  jump: ["Mantap! 🔥", "Gas terus! ⚡", "Keep going!"],
  spin: ["Pose 360° ✨", "Keren banget!", "On fire! 🔥"],
  surge: ["Power Surge! ⚡", "Mode Epik ✨", "Juara hari ini!"],
};

function AvatarPlayer({
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
  const [playing, setPlaying] = useState(autoPlay);
  const [engaged, setEngaged] = useState(autoPlay);
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Single-avatar living stage states
  const [action, setAction] = useState<ActionKind | null>(null);
  const [actionQuip, setActionQuip] = useState<string>("");
  const [spin360, setSpin360] = useState(false);
  const [sheetLoaded, setSheetLoaded] = useState(false);
  const [sheetFrame, setSheetFrame] = useState(0);
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });

  const host = useRef<HTMLDivElement>(null);
  const visible = useRef(true);
  const drag = useRef<{ x: number; frame: number } | null>(null);
  const singleDrag = useRef<{ x: number; frame: number; moved: boolean } | null>(null);
  const actionTimer = useRef<number | null>(null);
  const comboIndex = useRef(0);

  // Duo mode keeps the existing 6-frame 3×2 turnaround sheet on /login, /companion, AuthFrame.
  const count = 6;
  const columns = 3;
  const duoSheet = "/avatars/v2/duo-sheet.webp";
  const duoPoster = "/avatars/v2/duo-poster.webp";

  const clamped = clampAvatarLevel(level);
  const singleSheet = avatarSheetSrc(character, clamped);

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
    img.src = duoSheet;
    return () => {
      current = false;
    };
  }, [duo, duoSheet, engaged]);

  useEffect(() => {
    if (duo || locked || !spin360) return;
    setSheetLoaded(false);
    let current = true;
    const img = new Image();
    img.onload = () => {
      if (current) setSheetLoaded(true);
    };
    img.src = singleSheet;
    return () => {
      current = false;
    };
  }, [duo, locked, spin360, singleSheet]);

  useEffect(() => {
    const o = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
    });
    if (host.current) o.observe(host.current);
    return () => o.disconnect();
  }, []);

  useEffect(() => {
    if (!duo || !playing || reduced || !loaded) return;
    const t = setInterval(() => {
      if (!document.hidden && visible.current) {
        setFrame((f) => (f + 1) % count);
      }
    }, 380);
    return () => clearInterval(t);
  }, [duo, playing, reduced, loaded, count]);

  useEffect(() => {
    if (duo || locked || !spin360 || !sheetLoaded || reduced) return;
    const t = setInterval(() => {
      if (!document.hidden && visible.current && !singleDrag.current) {
        setSheetFrame((f) => (f + 1) % 8);
      }
    }, 310);
    return () => clearInterval(t);
  }, [duo, locked, spin360, sheetLoaded, reduced]);

  useEffect(() => {
    setSheetFrame(0);
  }, [character, clamped]);

  useEffect(() => {
    return () => {
      if (actionTimer.current !== null) window.clearTimeout(actionTimer.current);
    };
  }, []);

  const triggerEpicAction = useCallback(() => {
    if (locked || reduced) return;
    haptic("tap");
    const sequence: ActionKind[] = ["jump", "spin", "surge"];
    const nextKind = sequence[comboIndex.current % sequence.length];
    const pool = ACTION_QUIPS[nextKind];
    const quip = pool[Math.floor(comboIndex.current / sequence.length) % pool.length];
    comboIndex.current += 1;

    setAction(null);
    if (actionTimer.current !== null) window.clearTimeout(actionTimer.current);
    requestAnimationFrame(() => {
      setAction(nextKind);
      setActionQuip(quip);
      actionTimer.current = window.setTimeout(() => {
        setAction(null);
        setActionQuip("");
        actionTimer.current = null;
      }, 920);
    });
  }, [locked, reduced]);

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
            if (drag.current) {
              setFrame(
                (((drag.current.frame +
                  Math.round((e.clientX - drag.current.x) / 30)) %
                  count) +
                  count) %
                  count,
              );
            }
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          style={{
            backgroundImage: `url('${showSheet ? duoSheet : duoPoster}')`,
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

  const meta = getAvatarLevelMeta(character, clamped);
  const tier = TIER_META[meta.tier];
  const src = avatarImageSrc(character, clamped);
  const who = character === "richie" ? "Richie" : "Renita";
  const showTurnaround = !locked && spin360 && sheetLoaded;

  const tiltStyle =
    !locked && !reduced
      ? ({
          ["--tilt-rx" as string]: `${tilt.rx.toFixed(2)}deg`,
          ["--tilt-ry" as string]: `${tilt.ry.toFixed(2)}deg`,
          ["--avatar-aura" as string]: tier.aura,
          ["--tier-accent" as string]: tier.accent,
        } as CSSProperties)
      : locked
        ? undefined
        : ({
            ["--avatar-aura" as string]: tier.aura,
            ["--tier-accent" as string]: tier.accent,
          } as CSSProperties);

  const stageBtnClass = [
    "avatar-stage-btn",
    action === "jump" ? "is-action-jump" : "",
    action === "spin" ? "is-action-spin" : "",
    action === "surge" ? "is-action-surge" : "",
    showTurnaround ? "is-turnaround" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`avatar-player avatar-showcase${locked ? " is-locked" : ` tier-${meta.tier}`}${minimalControls ? " avatar-minimal" : ""}`}
      ref={host}
      style={tiltStyle}
    >
      {!locked && (
        <>
          <span className="avatar-aura" aria-hidden="true" />
          <span className="avatar-aura-ring" aria-hidden="true" />
          <span className="avatar-floor-shadow" aria-hidden="true" />
          <span className="avatar-motes" aria-hidden="true">
            <i className="avatar-mote m1" />
            <i className="avatar-mote m2" />
            <i className="avatar-mote m3" />
            <i className="avatar-mote m4" />
          </span>
        </>
      )}

      {action && <span className="avatar-shockwave" aria-hidden="true" />}
      {actionQuip && (
        <span className="avatar-action-quip" role="status">
          {actionQuip}
        </span>
      )}

      <button
        type="button"
        className={stageBtnClass}
        onClick={() => {
          if (singleDrag.current?.moved) return;
          triggerEpicAction();
        }}
        onPointerDown={(e) => {
          if (locked || !showTurnaround) return;
          singleDrag.current = { x: e.clientX, frame: sheetFrame, moved: false };
        }}
        onPointerMove={(e) => {
          if (locked || reduced) return;
          if (singleDrag.current && showTurnaround) {
            const dx = e.clientX - singleDrag.current.x;
            if (Math.abs(dx) > 6) singleDrag.current.moved = true;
            setSheetFrame(
              (((singleDrag.current.frame + Math.round(dx / 24)) % 8) + 8) % 8,
            );
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
          const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
          setTilt({
            rx: Math.max(-7, Math.min(7, -ny * 6)),
            ry: Math.max(-9, Math.min(9, nx * 8)),
          });
        }}
        onPointerUp={() => {
          setTimeout(() => {
            singleDrag.current = null;
          }, 0);
        }}
        onPointerLeave={() => {
          singleDrag.current = null;
          setTilt({ rx: 0, ry: 0 });
        }}
        onPointerCancel={() => {
          singleDrag.current = null;
          setTilt({ rx: 0, ry: 0 });
        }}
        disabled={locked}
        tabIndex={locked ? -1 : undefined}
        aria-label={
          locked
            ? `${who} level ${clamped}, terkunci (siluet rahasia)`
            : `${who} level ${clamped}, ${meta.title} — ketuk untuk animasi`
        }
      >
        <span className="avatar-tilt-frame">
          {showTurnaround ? (
            <div
              role="img"
              aria-label={`${who} level ${clamped} animasi 360 derajat`}
              className="avatar-turnaround-sprite"
              style={{
                backgroundImage: `url('${singleSheet}')`,
                backgroundSize: "400% 200%",
                backgroundPosition: `${((sheetFrame % 4) / 3) * 100}% ${sheetFrame >= 4 ? 100 : 0}%`,
              }}
            />
          ) : (
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
          )}
        </span>
      </button>

      {!locked && !reduced && (
        <button
          type="button"
          className={`avatar-mode-toggle${spin360 ? " is-active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            haptic("tap");
            setSpin360((v) => !v);
          }}
          aria-pressed={spin360}
          aria-label={spin360 ? "Kembali ke pose hidup" : "Putar karakter 360 derajat"}
        >
          <span aria-hidden="true">{spin360 ? "✦ Live" : "360°"}</span>
        </button>
      )}
    </div>
  );
}

export default memo(AvatarPlayer);
