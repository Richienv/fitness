import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAR_GROUPS,
  MUSCLE_BAR_GROUP,
  addDaysToKey,
  addWorkoutLoad,
  countedSets,
  defForLog,
  groupLoad,
  mondayOfKey,
  muscleOfLog,
  sameWeek,
  weekdayOfKey,
  withinLastDays,
  type MuscleLoad,
} from "./trainingLoad.ts";
import type { MuscleKey } from "./muscles.ts";

const push = [
  { name: "Bench Press", primary: ["chest"] as MuscleKey[] },
  { name: "OHP", primary: ["frontDelt"] as MuscleKey[] },
  { name: "Tricep Pushdown", primary: ["tricep"] as MuscleKey[] },
];
const done = (n: number) => Array.from({ length: n }, () => ({ reps: 8 }));
const catalogue: Record<string, MuscleKey> = {
  "pec deck": "chest",
  "cable curl": "bicep",
};
const muscleOfName = (name: string) => catalogue[name.toLowerCase()];

function load(
  exercises: Parameters<typeof addWorkoutLoad>[1]["exercises"],
  defs = push,
): MuscleLoad {
  const out: MuscleLoad = {};
  addWorkoutLoad(out, { exercises }, defs, muscleOfName);
  return out;
}

test("a session counts the sets that were done, by muscle", () => {
  assert.deepEqual(
    load([
      { exerciseName: "Bench Press", sets: done(4) },
      { exerciseName: "OHP", sets: done(3) },
      { exerciseName: "Tricep Pushdown", sets: done(2) },
    ]),
    { chest: 4, frontDelt: 3, tricep: 2 },
  );
});

test("sets without reps, skipped exercises and untouched exercises count for nothing", () => {
  assert.deepEqual(
    load([
      { exerciseName: "Bench Press", sets: [{ reps: 8 }, { reps: 0 }, { reps: 0 }] },
      { exerciseName: "OHP", sets: done(3), skipped: true },
      { exerciseName: "Tricep Pushdown", sets: [] },
    ]),
    { chest: 1 },
  );
  assert.equal(countedSets([{ reps: 0 }, {}, { reps: 5 }, { reps: -2 }]), 1);
  assert.equal(countedSets(undefined), 0);
});

test("a swapped exercise counts for the muscle of what it was swapped to", () => {
  // Bench Press swapped to Cable Curl (a different muscle): credit the curl.
  assert.deepEqual(
    load([{ exerciseName: "Bench Press", swappedTo: "Cable Curl", sets: done(3) }]),
    { bicep: 3 },
  );
  // Name lookup ignores case.
  assert.deepEqual(
    load([{ exerciseName: "Bench Press", swappedTo: "PEC DECK", sets: done(2) }]),
    { chest: 2 },
  );
});

test("a swap to a name the app does not know keeps the original muscle", () => {
  // Most swap alternatives ("DB Floor Press") are not in the catalogue; they
  // are offered for the same muscle, so the original exercise's muscle stands.
  assert.deepEqual(
    load([{ exerciseName: "OHP", swappedTo: "Arnold Press", sets: done(3) }]),
    { frontDelt: 3 },
  );
});

test("exercises are matched by position first, then by name", () => {
  const defs = [
    { name: "Plank", primary: ["abs"] as MuscleKey[] },
    { name: "Plank", primary: ["quad"] as MuscleKey[] },
  ];
  // Same name twice: each log takes the definition at its own position.
  assert.equal(defForLog(defs, { exerciseName: "Plank" }, 1), defs[1]);
  assert.equal(defForLog(defs, { exerciseName: "Plank" }, 0), defs[0]);
  // The list drifted (a machine appended earlier): the name finds its own
  // definition instead of the neighbour at that position.
  assert.equal(defForLog(push, { exerciseName: "Tricep Pushdown" }, 0), push[2]);
  // Unknown name: the definition at the position, like workoutBurn.
  assert.equal(defForLog(push, { exerciseName: "Mystery" }, 1), push[1]);
  // Nothing at all: no muscle, nothing counted.
  assert.equal(muscleOfLog([], { exerciseName: "Mystery", sets: [] }, 0, muscleOfName), undefined);
  assert.deepEqual(load([{ exerciseName: "Mystery", sets: done(3) }], []), {});
});

test("a session whose names changed still counts by position", () => {
  assert.deepEqual(load([{ exerciseName: "Renamed bench", sets: done(3) }]), { chest: 3 });
});

test("front delt work lands in the shoulder bar, not the chest bar", () => {
  const bars = groupLoad({ chest: 4, frontDelt: 3, sideDelt: 2, bicep: 3, tricep: 2, quad: 5, calf: 1 });
  assert.deepEqual(bars, { chest: 4, back: 0, shoulders: 5, arms: 5, legs: 6, abs: 0 });
  for (const m of Object.keys(MUSCLE_BAR_GROUP) as MuscleKey[]) {
    assert.ok(MUSCLE_BAR_GROUP[m], `${m} has a bar group`);
    assert.ok(BAR_GROUPS.some((g) => g.key === MUSCLE_BAR_GROUP[m]));
  }
});

test("week keys do not depend on the device's time zone", () => {
  // 24 Nov 2026 is a Tuesday; its week starts on Monday 23 Nov.
  assert.equal(weekdayOfKey("2026-11-24"), 2);
  assert.equal(weekdayOfKey("2026-11-22"), 0);
  assert.equal(mondayOfKey("2026-11-24"), "2026-11-23");
  assert.equal(mondayOfKey("2026-11-23"), "2026-11-23");
  assert.equal(mondayOfKey("2026-11-29"), "2026-11-23");
  assert.equal(mondayOfKey("2026-11-30"), "2026-11-30");
  assert.equal(mondayOfKey("2026-03-01"), "2026-02-23");
  assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysToKey("nope", 1), null);
  assert.equal(sameWeek("2026-11-29", "2026-11-24"), true);
  assert.equal(sameWeek("2026-11-22", "2026-11-24"), false);
  assert.equal(sameWeek("2026-11-30", "2026-11-24"), false);
});

test("the last 7 days include the end date and the six before it", () => {
  assert.equal(withinLastDays("2026-11-24", "2026-11-24", 7), true);
  assert.equal(withinLastDays("2026-11-18", "2026-11-24", 7), true);
  assert.equal(withinLastDays("2026-11-17", "2026-11-24", 7), false);
  assert.equal(withinLastDays("2026-11-25", "2026-11-24", 7), false);
  // Across a month and a year boundary.
  assert.equal(withinLastDays("2026-12-28", "2027-01-03", 7), true);
  assert.equal(withinLastDays("2026-12-27", "2027-01-03", 7), false);
  assert.equal(withinLastDays("garbage", "2026-11-24", 7), false);
});
