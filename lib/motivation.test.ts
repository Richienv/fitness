import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addedMealType,
  celebrationDiff,
  dailyStreak,
  hasChanges,
  mealSlotForHour,
  nextAction,
  snapshot,
  weeklyStreak,
  weekStart,
  type MotivationInput,
} from "./motivation.ts";

const TODAY = "2026-11-20"; // a Friday
const day = (n: number) =>
  new Date(Date.parse(TODAY + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);

function input(over: Partial<MotivationInput> = {}): MotivationInput {
  return {
    today: TODAY,
    intake: {},
    workouts: [],
    weighIns: [],
    target: () => ({ kcal: 2000, protein: 150 }),
    isGymDay: (d) => [1, 3, 5].includes(new Date(d + "T12:00:00Z").getUTCDay()),
    ...over,
  };
}

test("daily streak: an empty today does not break it", () => {
  const hits = new Set([day(-1), day(-2), day(-3)]);
  assert.deepEqual(dailyStreak((d) => hits.has(d), TODAY), {
    count: 3,
    todayDone: false,
  });
  hits.add(TODAY);
  assert.deepEqual(dailyStreak((d) => hits.has(d), TODAY), {
    count: 4,
    todayDone: true,
  });
});

test("daily streak: a gap before yesterday ends it, a gap yesterday resets it", () => {
  const hits = new Set([day(-1), day(-3), day(-4)]);
  assert.equal(dailyStreak((d) => hits.has(d), TODAY).count, 1);
  const old = new Set([day(-2), day(-3)]);
  assert.equal(dailyStreak((d) => old.has(d), TODAY).count, 0);
});

test("weeks start on Monday", () => {
  assert.equal(weekStart("2026-11-20"), "2026-11-16");
  assert.equal(weekStart("2026-11-16"), "2026-11-16");
  assert.equal(weekStart("2026-11-22"), "2026-11-16"); // Sunday
});

test("weekly workout streak: an empty current week does not break it", () => {
  const dates = [day(-5), day(-12), day(-19)]; // Sun 15, Sun 8, Sun 1 Nov
  assert.deepEqual(weeklyStreak(dates, TODAY), { count: 3, todayDone: false });
  assert.deepEqual(weeklyStreak([...dates, day(-1)], TODAY), {
    count: 4,
    todayDone: true,
  });
  assert.deepEqual(weeklyStreak([day(-12)], TODAY), {
    count: 0,
    todayDone: false,
  });
});

test("snapshot counts only completed workouts and real weigh-ins", () => {
  const s = snapshot(
    input({
      workouts: [
        { date: day(-1), completed: true, weighted: true },
        { date: TODAY, completed: false, weighted: true },
        { date: day(-3), completed: true, weighted: false },
      ],
      weighIns: [day(-1), day(-2)],
      intake: { [TODAY]: { kcal: 480, protein: 32 } },
    }),
  );
  assert.equal(s.workoutToday, false);
  assert.equal(s.weekWorkouts, 2);
  assert.equal(s.weekPlanned, 3); // Mon, Wed, Fri
  assert.equal(s.weigh.count, 2);
  assert.equal(s.meal.count, 1);
  assert.equal(s.meal.todayDone, true);
  assert.equal(s.kcal, 480);
  assert.equal(s.proteinTarget, 150);
  const century = s.badges.find((b) => b.key === "century")!;
  const iron = s.badges.find((b) => b.key === "iron")!;
  assert.equal(century.progress, 2);
  assert.equal(iron.progress, 1);
});

test("a day with zero kcal is not a logged day", () => {
  const s = snapshot(
    input({
      intake: {
        [day(-1)]: { kcal: 0, protein: 0 },
        [day(-2)]: { kcal: 300, protein: 10 },
      },
    }),
  );
  assert.equal(s.meal.count, 0);
});

test("week strip runs Monday to Sunday with protein progress and workouts", () => {
  const s = snapshot(
    input({
      intake: {
        [day(-4)]: { kcal: 1800, protein: 160 }, // Monday, target met
        [day(-3)]: { kcal: 1500, protein: 75 }, // Tuesday, half
      },
      workouts: [{ date: day(-4), completed: true, weighted: true }],
    }),
  );
  assert.deepEqual(
    s.week.map((d) => d.letter),
    ["S", "S", "R", "K", "J", "S", "M"],
  );
  const [mon, tue, wed, , fri, sat] = s.week;
  assert.equal(mon.proteinHit, true);
  assert.equal(mon.workout, true);
  assert.equal(tue.proteinRatio, 0.5);
  assert.equal(tue.proteinHit, false);
  assert.equal(wed.planned, true);
  assert.equal(wed.workout, false);
  assert.equal(fri.isToday, true);
  assert.equal(sat.isFuture, true);
});

test("badges only cover definitions the records can prove", () => {
  const s = snapshot(input());
  assert.deepEqual(s.badges.map((b) => b.key).sort(), [
    "century",
    "consistent",
    "iron",
    "protein",
  ]);
});

test("protein badge counts days at that day's target", () => {
  const s = snapshot(
    input({
      intake: {
        [day(-1)]: { kcal: 2000, protein: 150 },
        [day(-2)]: { kcal: 2000, protein: 149 },
        [day(-9)]: { kcal: 2000, protein: 180 },
        [day(1)]: { kcal: 2000, protein: 180 }, // future rows never count
      },
    }),
  );
  assert.equal(s.badges.find((b) => b.key === "protein")!.progress, 2);
});

test("celebration diff for a meal shows only what changed", () => {
  const base = input({
    intake: {
      [day(-1)]: { kcal: 1900, protein: 140 },
      [day(-2)]: { kcal: 1900, protein: 155 },
    },
  });
  const before = snapshot(base);
  const after = snapshot({
    ...base,
    intake: { ...base.intake, [TODAY]: { kcal: 600, protein: 45 } },
  });
  const c = celebrationDiff(before, after, "meal");
  assert.deepEqual(c.added, { kcal: 600, protein: 45 });
  assert.deepEqual(
    c.streaks.map((x) => [x.key, x.from, x.to]),
    [["meal", 2, 3]],
  );
  assert.equal(c.week, null);
  assert.deepEqual(
    c.badges.map((b) => [b.key, b.from, b.to]),
    [["consistent", 2, 3]],
  );
  assert.equal(c.proteinReached, false);
});

test("celebration diff marks the moment the protein target is reached", () => {
  const base = input({ intake: { [TODAY]: { kcal: 1500, protein: 120 } } });
  const before = snapshot(base);
  const after = snapshot({
    ...base,
    intake: { [TODAY]: { kcal: 1900, protein: 160 } },
  });
  const c = celebrationDiff(before, after, "meal");
  assert.equal(c.proteinReached, true);
  assert.deepEqual(c.streaks, []); // today was already logged
  assert.deepEqual(
    c.badges.map((b) => [b.key, b.from, b.to]),
    [["protein", 0, 1]],
  );
});

test("celebration diff for a workout shows the week and badges", () => {
  const base = input({
    workouts: [{ date: day(-4), completed: true, weighted: true }],
  });
  const before = snapshot(base);
  const after = snapshot({
    ...base,
    workouts: [
      ...base.workouts,
      { date: TODAY, completed: true, weighted: true },
    ],
  });
  const c = celebrationDiff(before, after, "workout");
  assert.deepEqual(c.week, { from: 1, to: 2, planned: 3 });
  assert.deepEqual(c.streaks, []); // this week already counted
  assert.deepEqual(
    c.badges.map((b) => [b.key, b.from, b.to]),
    [
      ["century", 1, 2],
      ["iron", 1, 2],
    ],
  );
});

test("meal slots follow the Makan page windows", () => {
  assert.equal(mealSlotForHour(6), "breakfast");
  assert.equal(mealSlotForHour(12), "lunch");
  assert.equal(mealSlotForHour(16), "snack");
  assert.equal(mealSlotForHour(20), "dinner");
  assert.equal(mealSlotForHour(2), "dinner");
});

test("next action: a workout in progress always comes first", () => {
  const s = snapshot(input());
  const a = nextAction(s, {
    hour: 7,
    activeWorkoutId: "w1",
    slotLogged: false,
    weightGoal: true,
  });
  assert.equal(a.key, "resume");
  assert.equal(a.href, "/workout/session/w1");
});

test("next action: morning weigh-in, then the meal slot", () => {
  const s = snapshot(input({ weighIns: [day(-1), day(-2)] }));
  const ctx = { hour: 7, activeWorkoutId: null, slotLogged: false, weightGoal: false };
  const a = nextAction(s, ctx);
  assert.equal(a.key, "weigh");
  assert.match(a.hint, /3 hari/);
  const b = nextAction(s, { ...ctx, hour: 12 });
  assert.equal(b.key, "meal");
  assert.equal(b.title, "Catat makan siang");
});

test("next action: no weigh-in nudge for someone who never weighs", () => {
  const s = snapshot(input());
  const a = nextAction(s, {
    hour: 7,
    activeWorkoutId: null,
    slotLogged: false,
    weightGoal: false,
  });
  assert.equal(a.key, "meal");
  assert.equal(a.title, "Catat sarapan");
});

test("next action: a meal hint continues the streak", () => {
  const s = snapshot(
    input({
      intake: {
        [day(-1)]: { kcal: 1800, protein: 100 },
        [day(-2)]: { kcal: 1800, protein: 100 },
      },
    }),
  );
  const a = nextAction(s, {
    hour: 12,
    activeWorkoutId: null,
    slotLogged: false,
    weightGoal: false,
  });
  assert.equal(a.hint, "Catat makan beruntun jadi 3 hari");
});

test("next action: training day, then protein, then done", () => {
  const ctx = { hour: 19, activeWorkoutId: null, slotLogged: true, weightGoal: false };
  const s = snapshot(
    input({
      intake: { [TODAY]: { kcal: 1500, protein: 90 } },
      workouts: [{ date: day(-4), completed: true, weighted: true }],
    }),
  );
  const a = nextAction(s, ctx);
  assert.equal(a.key, "workout");
  assert.equal(a.hint, "Latihan ke-2 dari 3 minggu ini");
  const trained = snapshot(
    input({
      intake: { [TODAY]: { kcal: 1500, protein: 90 } },
      workouts: [{ date: TODAY, completed: true, weighted: true }],
    }),
  );
  const b = nextAction(trained, ctx);
  assert.equal(b.key, "protein");
  assert.equal(b.hint, "60 g protein lagi hari ini");
  const full = snapshot(
    input({
      intake: { [TODAY]: { kcal: 2000, protein: 155 } },
      workouts: [{ date: TODAY, completed: true, weighted: true }],
    }),
  );
  assert.equal(nextAction(full, ctx).key, "done");
});

test("next action: a rest day skips the workout step", () => {
  const s = snapshot(
    input({
      today: "2026-11-19", // Thursday, not a training day
      intake: { "2026-11-19": { kcal: 2000, protein: 160 } },
    }),
  );
  const a = nextAction(s, {
    hour: 19,
    activeWorkoutId: null,
    slotLogged: true,
    weightGoal: false,
  });
  assert.equal(a.key, "done");
});

test("the week counts training days, not sessions", () => {
  const s = snapshot(
    input({
      workouts: [
        { date: day(-4), completed: true, weighted: true },
        { date: day(-4), completed: true, weighted: false },
        { date: day(-4), completed: true, weighted: true },
      ],
    }),
  );
  assert.equal(s.weekWorkouts, 1);
  assert.equal(s.badges.find((b) => b.key === "century")!.progress, 3);
  assert.equal(s.badges.find((b) => b.key === "iron")!.progress, 2);
});

test("a second session on the same day does not move the week", () => {
  const base = input({
    workouts: [{ date: TODAY, completed: true, weighted: true }],
  });
  const c = celebrationDiff(
    snapshot(base),
    snapshot({
      ...base,
      workouts: [...base.workouts, { date: TODAY, completed: true, weighted: true }],
    }),
    "workout",
  );
  assert.equal(c.week, null);
  assert.equal(hasChanges(c), true); // CENTURY still moved
});

test("each day's protein is judged against that day's own target", () => {
  const s = snapshot(
    input({
      // Rest days (Thu) ask for 100 g, training days 150 g.
      target: (d) => ({
        kcal: 2000,
        protein: new Date(d + "T12:00:00Z").getUTCDay() === 4 ? 100 : 150,
      }),
      intake: {
        [day(-1)]: { kcal: 1800, protein: 120 }, // Thu: met
        [day(-2)]: { kcal: 1800, protein: 120 }, // Wed: not met
      },
    }),
  );
  assert.equal(s.badges.find((b) => b.key === "protein")!.progress, 1);
  assert.equal(s.week[3].proteinHit, true);
  assert.equal(s.week[2].proteinHit, false);
});

test("a 0 kcal log changes nothing worth celebrating", () => {
  const base = input({ intake: { [day(-1)]: { kcal: 1800, protein: 100 } } });
  const before = snapshot(base);
  const after = snapshot({
    ...base,
    intake: { ...base.intake, [TODAY]: { kcal: 0, protein: 0 } },
  });
  const c = celebrationDiff(before, after, "meal");
  assert.equal(after.meal.todayDone, false);
  assert.deepEqual(c.streaks, []);
  assert.equal(hasChanges(c), false);
});

test("protein reached only fires on the log that crosses the target", () => {
  const base = input({ intake: { [TODAY]: { kcal: 1800, protein: 160 } } });
  const c = celebrationDiff(
    snapshot(base),
    snapshot({ ...base, intake: { [TODAY]: { kcal: 2000, protein: 175 } } }),
    "meal",
  );
  assert.equal(c.proteinReached, false);
  assert.equal(hasChanges(c), true);
});

test("no morning weigh-in prompt between midnight and 04:00", () => {
  const s = snapshot(input({ weighIns: [day(-1)] }));
  const a = nextAction(s, {
    hour: 0,
    activeWorkoutId: null,
    slotLogged: true,
    weightGoal: true,
  });
  assert.notEqual(a.key, "weigh");
});

test("an empty snack slot never outranks the training day", () => {
  const s = snapshot(input({ intake: { [TODAY]: { kcal: 900, protein: 60 } } }));
  const a = nextAction(s, {
    hour: 16,
    activeWorkoutId: null,
    slotLogged: false,
    weightGoal: false,
  });
  assert.equal(a.key, "workout");
});

test("addedMealType names the slot that gained food that day", () => {
  const before = [
    { date: TODAY, mealType: "breakfast" as const, items: [1] },
    { date: day(-1), mealType: "lunch" as const, items: [1] },
  ];
  const after = [
    { date: TODAY, mealType: "breakfast" as const, items: [1] },
    { date: TODAY, mealType: "lunch" as const, items: [1, 2] },
    { date: day(-1), mealType: "lunch" as const, items: [1, 2, 3] },
  ];
  assert.equal(addedMealType(before, after, TODAY), "lunch");
  assert.equal(addedMealType(after, after, TODAY), null);
});
