import { test } from "node:test";
import assert from "node:assert/strict";
import { combineDay, parseHealthPayload, parseLooseNumber } from "./healthImport.ts";

test("numbers arrive however Shortcuts formats them", () => {
  assert.equal(parseLooseNumber(6200), 6200);
  assert.equal(parseLooseNumber("6200"), 6200);
  assert.equal(parseLooseNumber("6.200"), 6200); // id-ID thousands
  assert.equal(parseLooseNumber("6,200"), 6200); // en-US thousands
  assert.equal(parseLooseNumber("1.234.567"), 1234567);
  assert.equal(parseLooseNumber("410,5 kkal"), 410.5); // id-ID decimal
  assert.equal(parseLooseNumber("410.5 kcal"), 410.5);
  assert.equal(parseLooseNumber("1.061,5"), 1061.5);
  assert.equal(parseLooseNumber("5,12 km"), 5.12);
  assert.equal(parseLooseNumber(""), null);
  assert.equal(parseLooseNumber("abc"), null);
  assert.equal(parseLooseNumber(null), null);
});

test("a payload is read with English or Indonesian keys, today by default", () => {
  assert.deepEqual(
    parseHealthPayload({ steps: "6.200", activeKcal: "410,5" }, "2026-11-21"),
    { ok: true, day: { date: "2026-11-21", steps: 6200, activeKcal: 410.5, distanceKm: null } },
  );
  assert.deepEqual(
    parseHealthPayload(
      { tanggal: "2026-11-20", langkah: 9000, kalori_aktif: 512, jarak_km: "6,4" },
      "2026-11-21",
    ),
    { ok: true, day: { date: "2026-11-20", steps: 9000, activeKcal: 512, distanceKm: 6.4 } },
  );
});

test("bad payloads are refused with a reason in Bahasa", () => {
  const none = parseHealthPayload({}, "2026-11-21");
  assert.equal(none.ok, false);
  const bad = parseHealthPayload({ steps: 5000, date: "21/11/2026" }, "2026-11-21");
  assert.equal(bad.ok, false);
  const future = parseHealthPayload({ steps: 5000, date: "2026-11-25" }, "2026-11-21");
  assert.equal(future.ok, false);
  // Absurd numbers are clamped rather than stored.
  const big = parseHealthPayload({ steps: 9_000_000, activeKcal: 50_000 }, "2026-11-21");
  assert.equal(big.ok, false);
  assert.ok(!none.ok && /langkah|kalori/.test(none.error));
});

const est = [
  { key: "gym:w1", kind: "gym" as const, kcal: 120 },
  { key: "act:a1", kind: "sepeda" as const, kcal: 200 },
  { key: "act:a2", kind: "langkah" as const, kcal: 150 },
];

test("without Apple Health the estimates add up", () => {
  const d = combineDay(est, null, () => 0);
  assert.equal(d.source, "estimate");
  assert.equal(d.total, 470);
  assert.deepEqual(d.excluded, []);
});

test("Apple Health active energy is the total; nothing is counted twice", () => {
  const d = combineDay(
    est,
    { date: "2026-11-21", steps: 6200, activeKcal: 410, distanceKm: null },
    () => 999,
  );
  assert.equal(d.source, "health");
  assert.equal(d.total, 410);
  assert.deepEqual(d.excluded.sort(), ["act:a1", "act:a2", "gym:w1"]);
});

test("Apple Health steps alone replace hand-logged steps only", () => {
  const d = combineDay(
    est,
    { date: "2026-11-21", steps: 6200, activeKcal: null, distanceKm: null },
    (steps) => steps * 0.03,
  );
  assert.equal(d.source, "estimate");
  assert.equal(d.healthStepsKcal, 186);
  assert.equal(d.total, 120 + 200 + 186);
  assert.deepEqual(d.excluded, ["act:a2"]);
});
