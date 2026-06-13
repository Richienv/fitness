"use client";

import { useAnimatedNumber } from "@/lib/useAnimatedNumber";

type Props = {
  value: number;
  /** 0 = whole-number tween, 1 = one decimal, etc. */
  decimals?: number;
  /** Localized formatting. Defaults to en-US thousands. */
  format?: (n: number) => string;
  /** Override tween length. */
  durationMs?: number;
  className?: string;
  ariaLabel?: string;
};

/**
 * <AnimatedNumber value={1079} /> — ticks from previous to next over ~700ms
 * with an ease-out curve. Uses tabular-nums so width never jitters.
 */
export default function AnimatedNumber({
  value,
  decimals = 0,
  format,
  durationMs = 700,
  className,
  ariaLabel,
}: Props) {
  const live = useAnimatedNumber(value, durationMs);
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(live * factor) / factor;
  const text = format
    ? format(rounded)
    : decimals === 0
      ? rounded.toLocaleString()
      : rounded.toFixed(decimals);

  return (
    <span
      className={["tnum", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
    >
      {text}
    </span>
  );
}
