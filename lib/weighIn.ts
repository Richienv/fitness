// Weigh-in sheet on Home (21 Nov 2026): the one weight field and what a
// weigh-in changed, compared from the stored records right before and right
// after the save. Pure, so the numbers can be traced to real weigh-ins.
// See docs/plans/2026-11-20-motivation-home-design.md ("Weigh-in sheet").
import type { Measurement } from "./measurements";
import {
  companionProgress,
  weightSummary,
  type CompanionGoal,
} from "./companionProgress.ts";
import {
  addDays,
  celebrationDiff,
  type Celebration,
  type Snapshot,
} from "./motivation.ts";

export const MIN_KG = 20;
export const MAX_KG = 300;
/** A gap this large from the last weigh-in is more often a typo than a body. */
export const JUMP_KG = 3;
/** Weigh-ins within 7 days before weightSummary shows a mean. */
export const TREND_MIN = 3;

export type WeighIn = { date: string; kg: number };
export type WeighLevelChange = {
  from: number;
  to: number;
  direction: "up" | "down";
};
export type WeighChange = {
  /** Today's weight after the save. */
  kg: number;
  /** Today's weight before the save, when today was already logged. */
  replaced: number | null;
  /** The save changed today's weight (a new weigh-in or a correction). */
  changed: boolean;
  /** The 7-day mean before and after; null until there are 3 weigh-ins in
   *  the window, or when the save left it unchanged. */
  trend: { from: number | null; to: number } | null;
  /** Weigh-in days in the last 7 days after the save. */
  trendCount: number;
  /** Avatar level transition caused by this weigh-in (touch-to-unlock / mundur). */
  levelChange: WeighLevelChange | null;
};

const CST_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Format an ISO weigh-in timestamp as "HH:mm" in Asia/Shanghai, or null if invalid. */
export function formatWeighTime(iso?: string | null): string | null {
  if (!iso || typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const formatted = CST_TIME_FORMATTER.format(new Date(ms));
  return /^\d{2}:\d{2}$/.test(formatted) ? formatted : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const positive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** Keep the field to digits and one decimal separator (typed as comma or
 *  dot, shown as the id-ID comma): at most 3 whole digits and 1 decimal. */
export function sanitizeWeightInput(raw: string): string {
  let whole = "",
    frac = "",
    sep = false;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      if (!sep && whole.length < 3) whole += ch;
      else if (sep && frac.length < 1) frac += ch;
    } else if ((ch === "," || ch === ".") && !sep) {
      sep = true;
    }
  }
  if (!sep) return whole;
  return `${whole || "0"},${frac}`;
}

/** The number in the field without a range check, or null. */
function readKg(text: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d?))?$/.exec(text.trim());
  if (!m) return null;
  return Number(`${m[1]}.${m[2] || "0"}`);
}

/** A weight in kg with one decimal, or null when it is not one. */
export function parseWeightInput(text: string): number | null {
  const n = readKg(text);
  if (n === null || n < MIN_KG || n > MAX_KG) return null;
  return n;
}

export function formatKg(n: number): string {
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** The −0,1 / +0,1 buttons. Works in tenths, so steps never drift. */
export function stepWeight(text: string, delta: number): string {
  const n = readKg(text);
  if (n === null) return text;
  const tenths = Math.round(n * 10) + Math.round(delta * 10);
  return formatKg(
    Math.min(MAX_KG * 10, Math.max(MIN_KG * 10, tenths)) / 10,
  );
}

/** "hari ini", "kemarin", a weekday within the week, else "11 Nov". */
export function relativeDay(date: string, today: string): string {
  if (date === today) return "hari ini";
  if (date === addDays(today, -1)) return "kemarin";
  const d = new Date(date + "T12:00:00Z");
  if (date >= addDays(today, -6) && date < today)
    return d.toLocaleDateString("id-ID", { weekday: "long", timeZone: "UTC" });
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Today's stored weight, and the last weigh-in before today. */
export function weighContext(
  rows: Measurement[],
  today: string,
): { today: number | null; previous: WeighIn | null } {
  const valid = rows
    .filter((r) => positive(r.weightKg) && r.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const todayRow = valid.filter((r) => r.date === today).at(-1);
  const prev = valid.filter((r) => r.date < today).at(-1);
  return {
    today: todayRow ? todayRow.weightKg! : null,
    previous: prev ? { date: prev.date, kg: prev.weightKg! } : null,
  };
}

/** The gap in kg when it is large enough to double-check, else null. */
export function jumpFromPrevious(
  kg: number,
  previous: WeighIn | null,
): number | null {
  if (!previous) return null;
  const gap = round1(Math.abs(kg - previous.kg));
  return gap >= JUMP_KG ? gap : null;
}

/** What this weigh-in changed: today's weight, the 7-day mean, and any avatar level shift. */
export function weighChange(
  beforeRows: Measurement[],
  afterRows: Measurement[],
  today: string,
  goal?: CompanionGoal | null,
): WeighChange {
  const replaced = weighContext(beforeRows, today).today;
  const kg = weighContext(afterRows, today).today ?? 0;
  const before = weightSummary(beforeRows, today);
  const after = weightSummary(afterRows, today);
  const from = before.mean === null ? null : round1(before.mean);
  const to = after.mean === null ? null : round1(after.mean);

  let levelChange: WeighLevelChange | null = null;
  if (goal && goal.mode === "weight") {
    const beforeProg = companionProgress(goal, beforeRows, [], today);
    const afterProg = companionProgress(goal, afterRows, [], today);
    if (afterProg.level !== null) {
      const prevLv = beforeProg.level ?? 1;
      if (afterProg.level !== prevLv) {
        levelChange = {
          from: prevLv,
          to: afterProg.level,
          direction: afterProg.level > prevLv ? "up" : "down",
        };
      }
    }
  }

  return {
    kg,
    replaced,
    changed: kg > 0 && kg !== replaced,
    trend: to !== null && to !== from ? { from, to } : null,
    trendCount: after.count,
    levelChange,
  };
}

/** The celebration for a weigh-in: the shared before/after diff (streaks,
 *  which here can only be the weigh-in streak), plus the weight itself. */
export function weighCelebration(
  before: Snapshot,
  after: Snapshot,
  beforeRows: Measurement[],
  afterRows: Measurement[],
  today: string,
  goal?: CompanionGoal | null,
): Celebration {
  return {
    ...celebrationDiff(before, after, "weigh"),
    weigh: weighChange(beforeRows, afterRows, today, goal),
  };
}
