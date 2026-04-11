"use client";

import type { MuscleGroup } from "@/lib/exerciseData";

/**
 * Simple front-view body silhouette with one muscle group highlighted.
 * Kept intentionally minimal: cartoon-ish shapes, no anatomical accuracy.
 */
export default function BodyDiagram({ group }: { group: MuscleGroup }) {
  const active = (g: MuscleGroup) => (g === group ? "muscle-active" : "muscle-base");
  return (
    <div className="body-diagram" aria-hidden>
      <svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg">
        {/* head */}
        <circle cx="60" cy="18" r="11" className="body-outline" />
        {/* neck */}
        <line x1="60" y1="29" x2="60" y2="36" className="body-outline" />
        {/* torso outline */}
        <path
          d="M30 42 Q60 34 90 42 L94 98 Q60 108 26 98 Z"
          className="body-outline"
        />
        {/* arms outline */}
        <path d="M30 44 L16 96 L22 104 L36 60" className="body-outline" />
        <path d="M90 44 L104 96 L98 104 L84 60" className="body-outline" />
        {/* legs outline */}
        <path d="M40 100 L34 180 L46 184 L54 108" className="body-outline" />
        <path d="M80 100 L86 180 L74 184 L66 108" className="body-outline" />

        {/* Muscle regions (highlighted when active) */}
        {/* chest */}
        <path
          d="M38 46 Q60 40 82 46 L78 64 Q60 72 42 64 Z"
          className={active("chest")}
        />
        {/* shoulders — two caps */}
        <ellipse cx="28" cy="46" rx="8" ry="6" className={active("shoulders")} />
        <ellipse cx="92" cy="46" rx="8" ry="6" className={active("shoulders")} />
        {/* back (shown as upper torso shading when active) */}
        {group === "back" && (
          <path
            d="M34 50 Q60 46 86 50 L84 86 Q60 92 36 86 Z"
            className="muscle-active"
            opacity="0.8"
          />
        )}
        {/* abs */}
        <rect x="52" y="72" width="16" height="26" rx="3" className={active("abs")} />
        {/* arms — biceps */}
        <ellipse cx="22" cy="68" rx="5" ry="10" className={active("arms")} />
        <ellipse cx="98" cy="68" rx="5" ry="10" className={active("arms")} />
        {/* legs — quads */}
        <ellipse cx="46" cy="130" rx="9" ry="22" className={active("legs")} />
        <ellipse cx="74" cy="130" rx="9" ry="22" className={active("legs")} />
      </svg>
    </div>
  );
}
