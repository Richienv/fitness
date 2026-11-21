"use client";

import type { CSSProperties } from "react";
import AnimatedNumber from "./AnimatedNumber";
import Icon from "../ui/Icon";

type Props = {
  kcal: number;
  kcalTarget: number;
  protein: number;
  proteinTarget: number;
  /** Values to fill from (a celebration counts from before to after). */
  fromKcal?: number;
  fromProtein?: number;
  size?: number;
};

const ratio = (v: number, t: number) =>
  t > 0 ? Math.max(0, Math.min(1, v / t)) : 0;
const id = (n: number) => Math.round(n).toLocaleString("id-ID");

/** One arc. It fills from `from` to `to` on mount with a CSS animation
 *  (opt-in under prefers-reduced-motion) and glides on later updates. */
function Arc({
  r,
  stroke,
  from,
  to,
  className,
  size,
}: {
  r: number;
  stroke: number;
  from: number;
  to: number;
  className: string;
  size: number;
}) {
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <>
      <circle
        className="tr-track"
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      {to > 0 && (
        <circle
          className={`tr-arc ${className}`}
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          transform={`rotate(-90 ${mid} ${mid})`}
          style={
            {
              strokeDashoffset: c - to * c,
              ["--tr-from" as string]: c - from * c,
            } as CSSProperties
          }
        />
      )}
    </>
  );
}

/**
 * Today's two targets as concentric rings: kcal outside, protein inside.
 * The centre counts what protein is still missing, the number Richie acts on.
 */
export default function TodayRings({
  kcal,
  kcalTarget,
  protein,
  proteinTarget,
  fromKcal = 0,
  fromProtein = 0,
  size = 128,
}: Props) {
  const stroke = Math.round(size * 0.09);
  const outer = size / 2 - stroke / 2 - 1;
  const inner = outer - stroke - 4;
  const left = Math.max(0, proteinTarget - protein);
  const leftBefore = Math.max(0, proteinTarget - fromProtein);
  const hit = proteinTarget > 0 && protein >= proteinTarget;
  return (
    <div
      className="tr"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Kalori ${id(kcal)} dari ${id(kcalTarget)} kkal. Protein ${id(protein)} dari ${id(proteinTarget)} gram.`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Arc
          r={outer}
          stroke={stroke}
          size={size}
          from={ratio(fromKcal, kcalTarget)}
          to={ratio(kcal, kcalTarget)}
          className="kcal"
        />
        <Arc
          r={inner}
          stroke={stroke}
          size={size}
          from={ratio(fromProtein, proteinTarget)}
          to={ratio(protein, proteinTarget)}
          className="protein"
        />
      </svg>
      <div className="tr-center" aria-hidden="true">
        {hit ? (
          <span className="tr-hit">
            <Icon name="check" size={22} />
            <small>protein tercapai</small>
          </span>
        ) : (
          <>
            <strong>
              <AnimatedNumber value={left} from={leftBefore} format={id} />
              <small> g</small>
            </strong>
            <small>protein lagi</small>
          </>
        )}
      </div>
    </div>
  );
}
