import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newSetupDraft,
  buildSetup,
  validDate,
  sameMeasurement,
} from "./setup.ts";
import { loginPerson, loginBucket, LOGIN_WINDOW_MS } from "./privateLogin.ts";
const today = "2026-11-15";
const valid = (person: "richie" | "renita" = "richie") => ({
  ...newSetupDraft(person, today),
  age: "24",
  height: "170",
  weight: "76",
  activity: "1.375",
  trainingDays: [1, 3, 5],
  foodStyle: "bebas",
  allergyMode: "none" as const,
  bodyMeasured: "later" as const,
});
test("targets are account specific and baseline is never invented", () => {
  assert.equal(newSetupDraft("richie", today).target, "73");
  assert.equal(newSetupDraft("renita", today).target, "43");
  assert.equal(newSetupDraft("renita", today).weight, "");
  assert.throws(
    () => buildSetup({ ...valid(), weight: "" }, "richie", today),
    /timbangan/,
  );
});
test("server identity wins over posted identity and unrelated fields", () => {
  const s = buildSetup(
    {
      ...valid("renita"),
      person: "richie",
      userId: "some-other-user",
      weight: "45.6",
    },
    "renita",
    today,
  );
  assert.equal(s.person, "renita");
  assert.equal(s.targetWeightKg, 43);
  assert.equal(s.profile.weightKg, 45.6);
  assert.equal("userId" in s, false);
  assert.equal(s.measurement.waistCm, undefined);
  assert.equal(s.companionGoal.baselineWeight, 45.6);
});
test("future and impossible scale dates are rejected", () => {
  assert.equal(validDate("2026-02-30"), false);
  for (const date of ["2026-11-16", "2026-02-30"])
    assert.throws(
      () => buildSetup({ ...valid(), measurementDate: date }, "richie", today),
      /tanggal/i,
    );
});
test("unknown body metrics and unchecked allergies require explicit decisions", () => {
  assert.throws(
    () => buildSetup({ ...valid(), bodyMeasured: "" }, "richie", today),
    /ukuran/,
  );
  assert.throws(
    () =>
      buildSetup(
        { ...valid(), allergyMode: "list", allergies: "" },
        "richie",
        today,
      ),
    /alergi/,
  );
  const s = buildSetup(
    {
      ...valid(),
      bodyMeasured: "yes",
      waist: "82",
      hip: "95",
      shoulder: "110",
    },
    "richie",
    today,
  );
  assert.deepEqual(s.measurement, {
    date: today,
    weightKg: 76,
    waistCm: 82,
    hipCm: 95,
    shoulderCm: 110,
  });
});
test("editing settings preserves the original progress baseline", () => {
  const a = buildSetup(valid(), "richie", today);
  const b = buildSetup(
    { ...valid(), weight: "75", target: "72" },
    "richie",
    today,
    a,
  );
  assert.equal(b.companionGoal.baselineWeight, 76);
  assert.equal(b.targetWeightKg, 72);
  assert.equal(b.completedAt, a.completedAt);
});
test("invalid activity, routine and macro contradictions fail server validation", () => {
  assert.throws(
    () => buildSetup({ ...valid(), activity: "9" }, "richie", today),
    /aktivitas/i,
  );
  assert.throws(
    () => buildSetup({ ...valid(), trainingDays: [1, 1] }, "richie", today),
    /hari/,
  );
  assert.throws(
    () =>
      buildSetup(
        {
          ...valid(),
          nutritionMode: "manual",
          gymKcal: "1000",
          restKcal: "1000",
          protein: "350",
        },
        "richie",
        today,
      ),
    /Kalori/,
  );
});
test("login accepts only allowlisted identities; throttle keys hide addresses and rotate", () => {
  assert.equal(loginPerson("richie"), "richie");
  assert.equal(loginPerson("renita"), "renita");
  assert.equal(loginPerson("admin"), null);
  assert.equal(loginPerson("kid@example.test"), null);
  const a = loginBucket("203.0.113.1", "test-secret", 1234),
    b = loginBucket("203.0.113.1", "test-secret", 1235),
    c = loginBucket("203.0.113.1", "test-secret", 1234 + LOGIN_WINDOW_MS);
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, c.key);
  assert.equal(a.key.includes("203.0.113.1"), false);
  assert.notEqual(a.key, loginBucket("203.0.113.2", "test-secret", 1234).key);
});

test("settings-only edits cannot rewrite newer scale records through key-order changes", () => {
  assert.equal(
    sameMeasurement(
      { weightKg: 76, waistCm: 82, date: today },
      { date: today, weightKg: 76, waistCm: 82 },
    ),
    true,
  );
  assert.equal(
    sameMeasurement(
      { date: today, weightKg: 76 },
      { date: today, weightKg: 75 },
    ),
    false,
  );
});
