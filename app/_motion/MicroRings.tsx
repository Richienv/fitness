"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

export type MicroRing = {
  key: string;
  label: string; // short: K, MG, FE…
  value: number;
  target: number;
  unit: string;
  kind: "hit" | "cap";
  color: string;
};

function Ring({ r }: { r: MicroRing }) {
  const size = 52;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;

  const ratio = r.target > 0 ? r.value / r.target : 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  const hit = r.kind === "hit" ? ratio >= 1 : ratio <= 1;
  const capOver = r.kind === "cap" && ratio > 1;

  const targetOffset = c - clamped * c;
  // Fill in from empty on mount (iOS-timer style).
  const [offset, setOffset] = useState(c);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOffset(targetOffset));
    return () => cancelAnimationFrame(raf);
  }, [targetOffset]);

  const stroke2 =
    capOver ? "var(--danger)" : hit ? "var(--accent)" : r.color;

  return (
    <div className={`mr-ring${hit && r.kind === "hit" ? " hit" : ""}${capOver ? " over" : ""}`}>
      <div className="mr-ring-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#222" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke2}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{
              transition: "stroke-dashoffset var(--dur-ring) var(--ease-out), stroke var(--dur-base) var(--ease-standard)",
            }}
          />
        </svg>
        <div className="mr-ring-center mono">
          {r.label}
          {hit && r.kind === "hit" ? <span className="mr-star">★</span> : null}
        </div>
      </div>
      <div className="mr-ring-pct mono">{Math.round(ratio * 100)}%</div>
    </div>
  );
}

/**
 * Compact Apple-Activity-style rings row for the micros, brought to the
 * Today detail page. Each ring fills in on mount and turns gold when its
 * hit-target is reached (or red when a cap is blown). The whole strip is a
 * tap-through to the full nutrient chart on the stats hub.
 */
export default function MicroRings({ rings }: { rings: MicroRing[] }) {
  const maxed = rings.filter((r) => (r.kind === "hit" ? r.value >= r.target : r.value <= r.target)).length;
  const hitTotal = rings.filter((r) => r.kind === "hit").length;
  return (
    <Link href="/dashboard" className="mr" aria-label="View full nutrient chart">
      <div className="mr-head mono">
        <span className="mr-title">MICROS TODAY</span>
        <span className="mr-count">
          {maxed}/{hitTotal} ★ <span className="mr-more">FULL CHART ›</span>
        </span>
      </div>
      <div className="mr-grid">
        {rings.map((r, i) => (
          <div
            key={r.key}
            className="mr-cell stagger-item"
            style={{ ["--i" as string]: i } as CSSProperties}
          >
            <Ring r={r} />
          </div>
        ))}
      </div>
    </Link>
  );
}
