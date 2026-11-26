"use client";

import type { CSSProperties } from "react";
import { getStreakTier, type StreakTierId } from "@/lib/streakTiers";

export default function StreakFlame({
  count,
  size = 16,
  tierOverride,
  className = "",
}: {
  count: number;
  size?: number;
  tierOverride?: StreakTierId;
  className?: string;
}) {
  const tier = getStreakTier(count);
  const id = tierOverride ?? tier.id;

  return (
    <span
      className={`streak-flame-emblem tier-${id}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, ["--flame-glow" as string]: tier.glow } as CSSProperties}
      aria-hidden="true"
    >
      {id === "dormant" && (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <path
            d="M12.2 3.2c.4 3-1.4 4.8-2.8 6.4-1.3 1.5-2.1 2.9-2.1 4.8a4.7 4.7 0 0 0 9.4 0c0-2.6-1.5-4.7-3.1-6.5-.5 1.1-1.3 1.7-2 1.8.8-2 .9-4.2.6-6.5Z"
            stroke="#94a3b8"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {id === "ember" && (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <path
            d="M12.3 2.7c.7 3.2-1.5 5-2.9 6.6-1.3 1.6-2.2 3-2.2 5a4.8 4.8 0 0 0 9.6 0c0-2.8-1.6-5.2-3.4-7-.3 1.2-1 1.9-1.9 2 .9-2 1.1-4.3.8-6.6Z"
            fill="#fb923c"
            stroke="#ea580c"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M12 12.2c.9 1.2 1.5 2 1.5 3.1a1.9 1.9 0 0 1-3.8 0c0-1 .7-1.9 2.3-3.1Z"
            fill="#fef08a"
          />
        </svg>
      )}

      {id === "blaze" && (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <path
            d="M12.6 2c.6 3.1-1.7 5-3.2 6.8C7.8 10.6 6.8 12.3 6.8 14.5a5.2 5.2 0 0 0 10.4 0c0-2.8-1.4-5-3-7 .1 1.4-.5 2.4-1.4 2.7.5-2.4.7-5.1-.2-8.2Z"
            fill="#f97316"
            stroke="#dc2626"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M12.1 10.5c1.5 1.7 2.4 3 2.4 4.5a2.6 2.6 0 0 1-5.2 0c0-1.5 1-2.8 2.8-4.5Z"
            fill="#fde047"
          />
          <circle cx="6.2" cy="8.5" r="1.2" fill="#ef4444" />
          <circle cx="18.2" cy="7.5" r="1.1" fill="#f97316" />
        </svg>
      )}

      {id === "blue_flame" && (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <path
            d="M12.6 2c.7 3.2-1.7 5-3.2 6.8C7.8 10.6 6.7 12.3 6.7 14.6a5.3 5.3 0 0 0 10.6 0c0-2.9-1.5-5.3-3.2-7.3.1 1.5-.6 2.5-1.5 2.8.6-2.5.7-5.1 0-8.1Z"
            fill="#38bdf8"
            stroke="#0284c7"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M12 10c1.6 1.8 2.5 3.1 2.5 4.7a2.6 2.6 0 0 1-5.2 0c0-1.6.9-2.9 2.7-4.7Z"
            fill="#e0f2fe"
          />
          <circle cx="5.8" cy="7.8" r="1.1" fill="#38bdf8" />
          <circle cx="18.3" cy="6.6" r="1" fill="#0ea5e9" />
        </svg>
      )}

      {id === "lightning" && (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <path
            d="M12.5 2.2c.7 3-1.5 4.8-3 6.5C7.9 10.4 6.8 12.2 6.8 14.6a5.2 5.2 0 0 0 10.4 0c0-2.8-1.5-5.2-3.2-7.2.2 1.4-.5 2.4-1.4 2.7.5-2.4.7-4.9-.1-7.9Z"
            fill="#a855f7"
            stroke="#6d28d9"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M13 8.8 9.7 14h2.5l-.9 4 3.5-5h-2.5l.7-4.2Z"
            fill="#fef08a"
            stroke="#fde047"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {id === "golden" && (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <path
            d="m7.5 5.4 1.6 1.5L12 4.2l2.9 2.7 1.6-1.5-.7 3.2H8.2l-.7-3.2Z"
            fill="#facc15"
            stroke="#b45309"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path
            d="M12.4 7.8c.5 1.8-1.1 3-2.2 4.2-1.2 1.3-2.1 2.4-2.1 4.2a4 4 0 0 0 8 0c0-2.2-1.2-4-2.7-5.6-.1 1-.6 1.6-1.2 1.8.4-1.5.5-3.1.2-4.6Z"
            fill="#fbbf24"
            stroke="#d97706"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="15.8" r="1.4" fill="#fef9c3" />
        </svg>
      )}

      {id === "godfire" && (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <path
            d="M12 1.6 13.3 4l2.7-.5-.9 2.5 2.3 1.3-2.2 1.6c1.5 1.9 2.3 3.7 2.3 5.8a5.5 5.5 0 0 1-11 0c0-2.4 1.2-4.4 2.9-6.3L7.2 7l2.2-1.3-.8-2.3 2.5.4L12 1.6Z"
            fill="#ec4899"
            stroke="#7c3aed"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M12 8.2c1.8 2 2.9 3.6 2.9 5.5a2.9 2.9 0 0 1-5.8 0c0-1.9 1.1-3.5 2.9-5.5Z"
            fill="#fde047"
          />
          <circle cx="12" cy="14.2" r="1.3" fill="#ffffff" />
        </svg>
      )}
    </span>
  );
}
