"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Snapshot, Streak } from "@/lib/motivation";
import AnimatedNumber from "../_motion/AnimatedNumber";
import TodayRings from "../_motion/TodayRings";
import Icon, { type IconName } from "../ui/Icon";

const id = (n: number) => Math.round(n).toLocaleString("id-ID");
const dayName = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

function StreakChip({
  tone,
  icon,
  streak,
  unit,
  label,
  status,
  href,
  i,
}: {
  tone: "meal" | "workout" | "weigh";
  icon: IconName;
  streak: Streak;
  unit: string;
  label: string;
  status: string;
  href: string;
  i: number;
}) {
  return (
    <Link
      href={href}
      className={`hud-streak ${tone}${streak.todayDone ? " lit" : ""} stagger-item`}
      style={{ ["--i" as string]: i } as CSSProperties}
      aria-label={`${label}: ${streak.count} ${unit}. ${status}`}
    >
      <span className="hud-streak-icon">
        <Icon name={icon} size={17} />
      </span>
      <span className="hud-streak-text" aria-hidden="true">
        <strong>
          <AnimatedNumber value={streak.count} from={0} format={id} />
          <small> {unit}</small>
        </strong>
        <span>{label}</span>
        <em>{status}</em>
      </span>
    </Link>
  );
}

/** Kind copy: an open day is an invitation, never a warning. */
function status(s: Streak, period: "hari" | "pekan", verb: string) {
  if (s.todayDone) return `aman ${period} ini`;
  if (s.count === 0) return `mulai ${period} ini`;
  return `${verb} → ${s.count + 1}`;
}

/** `bonus`: kcal training added to today's target (lib/dayBudget), when any.
 *  `weekOnly` drops the big streak cards and today's rings — those live on the avatar. */
export default function HomeHud({
  s,
  bonus = 0,
  weekOnly = false,
}: {
  s: Snapshot;
  bonus?: number;
  weekOnly?: boolean;
}) {
  const kcalLeft = s.kcalTarget - s.kcal;
  const proteinLeft = Math.max(0, s.proteinTarget - s.protein);
  const proteinDays = s.week.filter((d) => d.proteinHit).length;
  return (
    <section className="hud" aria-label="Posisimu hari ini">
      {!weekOnly && (
      <div className="hud-streaks">
        <StreakChip
          i={0}
          tone="meal"
          icon="flame"
          streak={s.meal}
          unit="hari"
          label="catat makan"
          status={status(s.meal, "hari", "catat")}
          href="/meal"
        />
        <StreakChip
          i={1}
          tone="workout"
          icon="workout"
          streak={s.workoutWeeks}
          unit="minggu"
          label="latihan"
          status={status(s.workoutWeeks, "pekan", "1 sesi")}
          href="/workout"
        />
        <StreakChip
          i={2}
          tone="weigh"
          icon="scale"
          streak={s.weigh}
          unit="hari"
          label="timbang"
          status={status(s.weigh, "hari", "timbang")}
          href="/dashboard/progress"
        />
      </div>
      )}
      {!weekOnly && (
      <Link href="/meal" className="hud-today">
        <TodayRings
          kcal={s.kcal}
          kcalTarget={s.kcalTarget}
          protein={s.protein}
          proteinTarget={s.proteinTarget}
        />
        <div className="hud-legend">
          <div className="kcal">
            <span>Kalori</span>
            <strong>
              <AnimatedNumber value={s.kcal} from={0} format={id} />
              <small> / {id(s.kcalTarget)} kkal</small>
            </strong>
            <small>
              {kcalLeft >= 0
                ? `${id(kcalLeft)} kkal tersisa`
                : `${id(-kcalLeft)} kkal di atas target`}
            </small>
            {bonus > 0 && <small className="hud-bonus">Termasuk +{id(bonus)} dari latihan</small>}
          </div>
          <div className="protein">
            <span>Protein</span>
            <strong>
              <AnimatedNumber value={s.protein} from={0} format={id} />
              <small> / {id(s.proteinTarget)} g</small>
            </strong>
            <small>
              {proteinLeft > 0 ? `${id(proteinLeft)} g lagi` : "Target tercapai"}
            </small>
          </div>
        </div>
      </Link>
      )}
      <div className="hud-week">
        <div className="hud-week-head">
          <h2>Minggu ini</h2>
          <span>
            {s.weekWorkouts}
            {s.weekPlanned ? `/${s.weekPlanned}` : ""} latihan · {proteinDays}{" "}
            hari protein
          </span>
        </div>
        <ol>
          {s.week.map((d, i) => (
            <li
              key={d.date}
              className={[
                "hud-day",
                d.isToday && "today",
                d.isFuture && "future",
                d.logged && "logged",
                d.proteinHit && "hit",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                {
                  ["--p" as string]: d.proteinRatio,
                  ["--i" as string]: i,
                } as CSSProperties
              }
              aria-label={`${dayName(d.date)}${d.isToday ? " (hari ini)" : ""}: ${
                d.logged
                  ? `protein ${Math.round(d.protein)} dari ${Math.round(d.proteinTarget)} g`
                  : "belum ada catatan makan"
              }${d.workout ? ", latihan selesai" : d.planned ? ", hari latihan" : ""}`}
            >
              <span className="hud-day-letter" aria-hidden="true">
                {d.letter}
              </span>
              <span className="hud-day-ring" aria-hidden="true">
                {d.proteinHit && <Icon name="check" size={14} />}
              </span>
              <span
                className={`hud-day-dot${d.workout ? " done" : d.planned ? " planned" : ""}`}
                aria-hidden="true"
              />
            </li>
          ))}
        </ol>
        <p className="hud-week-key">
          <span className="key-ring" aria-hidden="true" /> protein harian
          <span className="key-dot" aria-hidden="true" /> latihan selesai
          <span className="key-dot planned" aria-hidden="true" /> jadwal latihan
        </p>
      </div>
    </section>
  );
}
