"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import {
  STREAK_LABEL,
  type Celebration,
  type StreakKey,
} from "@/lib/motivation";
import AnimatedNumber from "./AnimatedNumber";
import TodayRings from "./TodayRings";
import Icon, { type IconName } from "../ui/Icon";

const id = (n: number) => Math.round(n).toLocaleString("id-ID");
const STREAK_ICON: Record<StreakKey, IconName> = {
  meal: "flame",
  workout: "workout",
  weigh: "scale",
};

/** A bar that grows from the old fraction to the new one (CSS animation,
 *  opt-in under prefers-reduced-motion). */
function GrowBar({ from, to }: { from: number; to: number }) {
  return (
    <span className="cel-bar" aria-hidden="true">
      <span
        style={
          {
            ["--p" as string]: Math.min(1, to),
            ["--from" as string]: Math.min(1, from),
          } as CSSProperties
        }
      />
    </span>
  );
}

/**
 * Peak-end moment after a log: a light sheet that counts up, from the records
 * before the save to the records after it, exactly what changed.
 */
export default function ProgressCelebration({
  c,
  title,
  onClose,
}: {
  c: Celebration;
  title: string;
  onClose: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // "Lanjut" is the sheet's only control: keep focus on it while the sheet
    // is open, and hand focus back to where it was when it closes.
    const previous = document.activeElement as HTMLElement | null;
    button.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        e.preventDefault();
        button.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);
  const { before, after } = c;
  const proteinLeft = Math.max(0, after.proteinTarget - after.protein);
  const subtitle =
    c.kind === "meal"
      ? `+${id(c.added.kcal)} kkal · +${id(c.added.protein)} g protein`
      : c.week
        ? `Latihan ke-${c.week.to} minggu ini`
        : "Sesi tersimpan";
  // The streak this kind of log feeds is shown when today (this week) is
  // really covered; it only counts up, with a +1, when it actually moved.
  const ownKey: StreakKey = c.kind === "meal" ? "meal" : "workout";
  const own = c.kind === "meal" ? after.meal : after.workoutWeeks;
  const ownMoved = c.streaks.some((x) => x.key === ownKey);
  let row = 0;
  return (
    <div className="cel-backdrop" onClick={onClose}>
      <div
        className="cel-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cel-title"
        aria-describedby="cel-sub"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cel-burst" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              className="cel-spark"
              style={{ ["--a" as string]: `${i * 45}deg` } as CSSProperties}
            />
          ))}
          <span className="cel-check">
            <Icon name="check" size={30} />
          </span>
        </div>
        <h2 id="cel-title">{title}</h2>
        <p id="cel-sub" className="cel-sub">
          {subtitle}
        </p>

        {c.kind === "meal" && (
          <div className="cel-today">
            <TodayRings
              size={104}
              kcal={after.kcal}
              kcalTarget={after.kcalTarget}
              protein={after.protein}
              proteinTarget={after.proteinTarget}
              fromKcal={before.kcal}
              fromProtein={before.protein}
            />
            <dl>
              <div className="protein">
                <dt>Protein hari ini</dt>
                <dd>
                  <AnimatedNumber
                    value={after.protein}
                    from={before.protein}
                    durationMs={900}
                    format={id}
                  />
                  <small> / {id(after.proteinTarget)} g</small>
                </dd>
              </div>
              <div className="kcal">
                <dt>Kalori tersisa</dt>
                <dd>
                  <AnimatedNumber
                    value={Math.max(0, after.kcalTarget - after.kcal)}
                    from={Math.max(0, before.kcalTarget - before.kcal)}
                    durationMs={900}
                    format={id}
                  />
                  <small> kkal</small>
                </dd>
              </div>
            </dl>
          </div>
        )}

        <ul className="cel-changes">
          {c.proteinReached && (
            <li
              className="cel-row reached stagger-item"
              style={{ ["--i" as string]: row++ } as CSSProperties}
            >
              <span className="cel-icon protein">
                <Icon name="check" size={18} />
              </span>
              <span className="cel-label">Target protein hari ini tercapai</span>
            </li>
          )}
          {c.week && (
            <li
              className="cel-row stagger-item"
              style={{ ["--i" as string]: row++ } as CSSProperties}
            >
              <span className="cel-icon workout">
                <Icon name="workout" size={18} />
              </span>
              <span className="cel-label">
                Latihan minggu ini
                {c.week.planned > 0 && (
                  <GrowBar
                    from={c.week.from / c.week.planned}
                    to={c.week.to / c.week.planned}
                  />
                )}
              </span>
              <strong className="cel-value">
                <AnimatedNumber value={c.week.to} from={c.week.from} durationMs={900} />
                {c.week.planned > 0 && <small> / {c.week.planned}</small>}
              </strong>
            </li>
          )}
          {c.streaks.map((s) => (
            <li
              key={s.key}
              className="cel-row stagger-item"
              style={{ ["--i" as string]: row++ } as CSSProperties}
            >
              <span className={`cel-icon ${s.key}`}>
                <Icon name={STREAK_ICON[s.key]} size={18} />
              </span>
              <span className="cel-label">{s.label}</span>
              <strong className="cel-value">
                <AnimatedNumber value={s.to} from={s.from} durationMs={900} />
                <small> {s.unit}</small>
                {s.to > s.from && <em className="cel-plus">+{s.to - s.from}</em>}
              </strong>
            </li>
          ))}
          {!ownMoved && own.todayDone && own.count > 0 && (
            <li
              className="cel-row stagger-item"
              style={{ ["--i" as string]: row++ } as CSSProperties}
            >
              <span className={`cel-icon ${ownKey}`}>
                <Icon name={STREAK_ICON[ownKey]} size={18} />
              </span>
              <span className="cel-label">
                {STREAK_LABEL[ownKey].label}
                <small>
                  {c.kind === "meal" ? "Hari ini sudah aman" : "Pekan ini sudah aman"}
                </small>
              </span>
              <strong className="cel-value">
                {own.count}
                <small> {STREAK_LABEL[ownKey].unit}</small>
              </strong>
            </li>
          )}
          {c.badges.slice(0, 2).map((b) => (
            <li
              key={b.key}
              className="cel-row stagger-item"
              style={{ ["--i" as string]: row++ } as CSSProperties}
            >
              <span className="cel-icon badge">
                <Icon name="medal" size={18} />
              </span>
              <span className="cel-label">
                Lencana {b.label}
                <GrowBar from={b.from / b.target} to={b.to / b.target} />
                <small>{b.milestone}</small>
              </span>
              <strong className="cel-value">
                <AnimatedNumber
                  value={Math.min(b.to, b.target)}
                  from={Math.min(b.from, b.target)}
                  durationMs={900}
                />
                <small> / {b.target}</small>
              </strong>
            </li>
          ))}
          {c.kind === "workout" && after.proteinTarget > 0 && (
            <li
              className="cel-row quiet stagger-item"
              style={{ ["--i" as string]: row++ } as CSSProperties}
            >
              <span className="cel-icon protein">
                <Icon name="meal" size={18} />
              </span>
              <span className="cel-label">
                {proteinLeft > 0
                  ? `Protein hari ini: ${id(proteinLeft)} g lagi`
                  : "Protein hari ini sudah tercapai"}
              </span>
            </li>
          )}
        </ul>

        <button
          ref={button}
          type="button"
          className="primary-button cel-close"
          onClick={onClose}
        >
          Lanjut
        </button>
      </div>
    </div>
  );
}
