"use client";

import { useMemo, type CSSProperties } from "react";
import AnimatedNumber from "./AnimatedNumber";
import { bestTopUps, type Gap, type TopUp } from "@/lib/nutrientSuggest";

const LABEL: Record<string, string> = {
  protein: "PROTEIN", fiber: "FIBER", omega3: "ω3", k: "K", mg: "MG",
  fe: "FE", zn: "ZN", ca: "CA",
};

type Props = {
  gaps: Gap[];
};

/**
 * Hero "EAT THIS ONE THING" card — looks at every unmet hit-nutrient and
 * surfaces the single library food whose one serving closes the most across
 * all of them, normalised for calorie cost. Foods that touch ≥3 different
 * gaps get a "SYNERGY" tag.
 */
export default function TopUpCard({ gaps }: Props) {
  const picks = useMemo<TopUp[]>(() => bestTopUps(gaps, { limit: 3 }), [gaps]);
  if (picks.length === 0) return null;
  const hero = picks[0];
  const alts = picks.slice(1);

  return (
    <section className="tup">
      <div className="tup-head mono">
        <span className="tup-title">CLOSE ALL GAPS WITH</span>
        {hero.hitsMultiple >= 3 && (
          <span className="tup-synergy mono">SYNERGY · {hero.hitsMultiple} NUTRIENTS</span>
        )}
      </div>

      <div className="tup-hero stagger-item" style={{ ["--i" as string]: 0 } as CSSProperties}>
        <div className="tup-hero-qty">×{hero.qty}</div>
        <div className="tup-hero-main">
          <div className="tup-hero-name">{hero.name}</div>
          <div className="tup-hero-unit mono">
            {hero.unit} · {hero.kcal} kcal
          </div>
          <div className="tup-hero-breakdown">
            {hero.contributions
              .filter((c) => c.pctOfTarget > 0.01)
              .slice(0, 5)
              .map((c) => (
                <span key={c.key} className="tup-chip mono">
                  <span className="tup-chip-key">{LABEL[c.key] ?? c.key.toUpperCase()}</span>
                  <span className="tup-chip-pct">
                    +<AnimatedNumber value={Math.round(c.pctOfTarget * 100)} />%
                  </span>
                </span>
              ))}
          </div>
        </div>
      </div>

      {alts.length > 0 && (
        <div className="tup-alts mono">
          <span className="tup-alts-label">OR</span>
          {alts.map((a, i) => (
            <span
              key={a.id}
              className="tup-alt stagger-item"
              style={{ ["--i" as string]: i + 1 } as CSSProperties}
            >
              ×{a.qty} {a.name}{" "}
              <span className="tup-alt-cost">
                {a.kcal}kcal · closes {Math.round(a.totalClose * 100)}%
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
