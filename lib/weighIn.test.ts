import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatKg,
  jumpFromPrevious,
  parseWeightInput,
  relativeDay,
  sanitizeWeightInput,
  stepWeight,
  weighCelebration,
  weighChange,
  weighContext,
} from "./weighIn.ts";
import { hasChanges, snapshot, type MotivationInput } from "./motivation.ts";
import type { Measurement } from "./measurements";

const TODAY = "2026-11-21"; // a Saturday
const day = (n: number) =>
  new Date(Date.parse(TODAY + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);

function snap(rows: Measurement[]) {
  const input: MotivationInput = {
    today: TODAY,
    intake: {},
    workouts: [],
    weighIns: rows.filter((r) => Number(r.weightKg) > 0).map((r) => r.date),
    target: () => ({ kcal: 2000, protein: 150 }),
    isGymDay: () => false,
  };
  return snapshot(input);
}

test("sanitize keeps digits and one decimal, shown with a comma", () => {
  assert.equal(sanitizeWeightInput("72.4"), "72,4");
  assert.equal(sanitizeWeightInput("72,45"), "72,4");
  assert.equal(sanitizeWeightInput("72,,4"), "72,4");
  assert.equal(sanitizeWeightInput("7a2 kg"), "72");
  assert.equal(sanitizeWeightInput("1234"), "123");
  assert.equal(sanitizeWeightInput(",5"), "0,5");
  assert.equal(sanitizeWeightInput(""), "");
});

test("parse accepts id-ID comma and dot, one decimal, 20-300 kg", () => {
  assert.equal(parseWeightInput("72,4"), 72.4);
  assert.equal(parseWeightInput("72.4"), 72.4);
  assert.equal(parseWeightInput(" 72,4 "), 72.4);
  assert.equal(parseWeightInput("72"), 72);
  assert.equal(parseWeightInput("72,"), 72);
  assert.equal(parseWeightInput(""), null);
  assert.equal(parseWeightInput("19,9"), null);
  assert.equal(parseWeightInput("300,1"), null);
  assert.equal(parseWeightInput("72,45"), null);
  assert.equal(parseWeightInput("7a"), null);
});

test("format and step use one decimal and never drift", () => {
  assert.equal(formatKg(72), "72,0");
  assert.equal(formatKg(72.4), "72,4");
  assert.equal(stepWeight("72,4", -0.1), "72,3");
  assert.equal(stepWeight("72,9", 0.1), "73,0");
  // Ten small steps land exactly, without floating-point residue.
  let t = "70,0";
  for (let i = 0; i < 10; i++) t = stepWeight(t, 0.1);
  assert.equal(t, "71,0");
  assert.equal(stepWeight("300,0", 0.1), "300,0");
  assert.equal(stepWeight("20,0", -0.1), "20,0");
  assert.equal(stepWeight("", 0.1), "");
});

test("relative day reads naturally in Bahasa Indonesia", () => {
  assert.equal(relativeDay(TODAY, TODAY), "hari ini");
  assert.equal(relativeDay(day(-1), TODAY), "kemarin");
  assert.equal(relativeDay(day(-2), TODAY), "Kamis");
  assert.equal(relativeDay(day(-10), TODAY), "11 Nov");
});

test("context: today's weight and the last one before today", () => {
  const rows: Measurement[] = [
    { date: day(-3), weightKg: 73.1 },
    { date: day(-1), waistCm: 84 }, // waist only: not a weigh-in
    { date: day(-2), weightKg: 72.8 },
    { date: day(1), weightKg: 70 }, // future rows never count
  ];
  assert.deepEqual(weighContext(rows, TODAY), {
    today: null,
    previous: { date: day(-2), kg: 72.8 },
  });
  const withToday = [...rows, { date: TODAY, weightKg: 72.5, waistCm: 84 }];
  assert.deepEqual(weighContext(withToday, TODAY), {
    today: 72.5,
    previous: { date: day(-2), kg: 72.8 },
  });
  assert.deepEqual(weighContext([], TODAY), { today: null, previous: null });
});

test("a jump hint only for a large gap from the last weigh-in", () => {
  const prev = { date: day(-1), kg: 72.4 };
  assert.equal(jumpFromPrevious(72.1, prev), null);
  assert.equal(jumpFromPrevious(27.4, prev), 45);
  assert.equal(jumpFromPrevious(75.4, prev), 3);
  assert.equal(jumpFromPrevious(72.4, null), null);
});

test("weigh change: first weigh-in today, no trend before 3 weigh-ins", () => {
  const before: Measurement[] = [{ date: day(-1), weightKg: 72.6 }];
  const after = [...before, { date: TODAY, weightKg: 72.4 }];
  assert.deepEqual(weighChange(before, after, TODAY), {
    kg: 72.4,
    replaced: null,
    changed: true,
    trend: null,
    trendCount: 2,
  });
});

test("weigh change: the third weigh-in in 7 days starts the trend", () => {
  const before: Measurement[] = [
    { date: day(-8), weightKg: 74 }, // outside the 7-day window
    { date: day(-3), weightKg: 72.9 },
    { date: day(-1), weightKg: 72.6 },
  ];
  const after = [...before, { date: TODAY, weightKg: 72.3 }];
  const w = weighChange(before, after, TODAY);
  assert.deepEqual(w.trend, { from: null, to: 72.6 });
  assert.equal(w.trendCount, 3);
});

test("weigh change: an existing trend counts from before to after", () => {
  const before: Measurement[] = [
    { date: day(-4), weightKg: 73.2 },
    { date: day(-2), weightKg: 72.9 },
    { date: day(-1), weightKg: 72.6 },
  ];
  const after = [...before, { date: TODAY, weightKg: 72.1 }];
  assert.deepEqual(weighChange(before, after, TODAY).trend, {
    from: 72.9,
    to: 72.7,
  });
});

test("weigh change: re-saving the same weight changes nothing", () => {
  const before: Measurement[] = [
    { date: day(-2), weightKg: 72.9 },
    { date: day(-1), weightKg: 72.6 },
    { date: TODAY, weightKg: 72.4 },
  ];
  const w = weighChange(before, before, TODAY);
  assert.equal(w.changed, false);
  assert.equal(w.replaced, 72.4);
  assert.equal(w.trend, null);
});

test("weigh change: correcting today's weight lists the old value", () => {
  const before: Measurement[] = [
    { date: day(-2), weightKg: 72.9 },
    { date: day(-1), weightKg: 72.6 },
    { date: TODAY, weightKg: 27.4 },
  ];
  const after = before.map((r) =>
    r.date === TODAY ? { ...r, weightKg: 72.4 } : r,
  );
  const w = weighChange(before, after, TODAY);
  assert.equal(w.replaced, 27.4);
  assert.equal(w.changed, true);
  assert.deepEqual(w.trend, { from: 57.6, to: 72.6 });
});

test("weigh celebration: the streak moves +1 and is the only streak", () => {
  const before: Measurement[] = [
    { date: day(-2), weightKg: 72.9 },
    { date: day(-1), weightKg: 72.6 },
  ];
  const after = [...before, { date: TODAY, weightKg: 72.4 }];
  const c = weighCelebration(snap(before), snap(after), before, after, TODAY);
  assert.equal(c.kind, "weigh");
  assert.deepEqual(
    c.streaks.map((s) => [s.key, s.from, s.to]),
    [["weigh", 2, 3]],
  );
  assert.deepEqual(c.weigh?.trend, { from: null, to: 72.6 });
  assert.deepEqual(c.added, { kcal: 0, protein: 0 });
  assert.equal(hasChanges(c), true);
});

test("weigh celebration: a repeat save with the same weight shows no sheet", () => {
  const rows: Measurement[] = [
    { date: day(-1), weightKg: 72.6 },
    { date: TODAY, weightKg: 72.4 },
  ];
  const c = weighCelebration(snap(rows), snap(rows), rows, rows, TODAY);
  assert.equal(c.streaks.length, 0);
  assert.equal(hasChanges(c), false);
});
