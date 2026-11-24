import { test } from "node:test";
import assert from "node:assert/strict";
import { isRecord, previousPerformance, suggestNext, type HistWorkout } from "./exerciseHistory.ts";

const w = (id: string, date: string, startedAt: number, ex: HistWorkout["exercises"]): HistWorkout => ({
  id,
  date,
  startedAt,
  exercises: ex,
});
const set = (weight: number, reps: number) => ({ weight, reps });

test("last time is the latest EARLIER session, never the one being logged", () => {
  const all = [
    w("a", "2026-11-17", 1, [{ exerciseName: "Bench Press", sets: [set(60, 8), set(62.5, 8)] }]),
    w("b", "2026-11-20", 2, [{ exerciseName: "Bench Press", sets: [set(65, 6)] }]),
    w("now", "2026-11-24", 3, [{ exerciseName: "Bench Press", sets: [set(70, 5)] }]),
  ];
  const p = previousPerformance(all, "Bench Press", "now")!;
  assert.deepEqual([p.weight, p.reps, p.date], [65, 6, "2026-11-20"]);
  assert.deepEqual(p.best, { weight: 65, reps: 6 });
  // Without excluding it, today's own set would be echoed back.
  assert.equal(previousPerformance(all, "Bench Press")!.weight, 70);
});

test("a swapped exercise is found under the exercise actually done", () => {
  const all = [
    w("a", "2026-11-17", 1, [
      { exerciseName: "Bench Press", swappedTo: "Chest Press Machine", sets: [set(40, 10)] },
    ]),
  ];
  assert.equal(previousPerformance(all, "Bench Press"), null);
  assert.equal(previousPerformance(all, "Chest Press Machine")!.weight, 40);
});

test("empty sets and skipped exercises are not performances", () => {
  const all = [
    w("a", "2026-11-17", 1, [{ exerciseName: "Dips", sets: [set(0, 0)] }]),
    w("b", "2026-11-18", 2, [{ exerciseName: "Dips", skipped: true, sets: [set(0, 9)] }]),
    w("c", "2026-11-19", 3, [{ exerciseName: "Dips", sets: [set(0, 10)] }]),
  ];
  const p = previousPerformance(all, "Dips")!;
  assert.equal(p.reps, 10);
  assert.equal(p.date, "2026-11-19");
});

test("a record must beat the best before it; the first time is not a record", () => {
  assert.equal(isRecord(null, set(60, 8)), false);
  assert.equal(isRecord({ weight: 60, reps: 8 }, set(62.5, 5)), true);
  assert.equal(isRecord({ weight: 60, reps: 8 }, set(60, 9)), true);
  assert.equal(isRecord({ weight: 60, reps: 8 }, set(60, 8)), false);
  assert.equal(isRecord({ weight: 60, reps: 8 }, set(55, 12)), false);
  assert.equal(isRecord({ weight: 60, reps: 8 }, set(70, 0)), false);
});

test("the next try follows double progression", () => {
  const t = { targetReps: 8, increment: 2.5 };
  assert.deepEqual(suggestNext(set(60, 10), t), { weight: 62.5, reps: 8, note: "naik 2,5 kg" });
  assert.deepEqual(suggestNext(set(60, 8), t), { weight: 60, reps: 9, note: "tambah 1 rep" });
  assert.deepEqual(suggestNext(set(60, 6), t), { weight: 60, reps: 8, note: "kejar target rep" });
  // Bodyweight never gets "naik kg".
  assert.deepEqual(suggestNext(set(0, 12), t), { weight: 0, reps: 13, note: "tambah 1 rep" });
  assert.equal(suggestNext(null, t), null);
});
