import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INCREMENTS,
  autoSessionName,
  bumpIncrement,
  bumpReps,
  bumpRest,
  bumpSets,
  defaultDef,
  entriesForGroups,
  finalName,
  kgLabel,
  nbsp,
  restLabel,
  saveProblem,
  searchCatalog,
  sessionFocus,
  summaryLine,
  toTemplate,
  totalSets,
  type CatalogEntry,
} from "./sessionDraft.ts";

const entry = (name: string, muscle: CatalogEntry["muscle"], coach = false): CatalogEntry => ({
  key: name.toLowerCase(),
  name,
  muscle,
  def: defaultDef(name, muscle),
  coach,
});
const catalog = [
  entry("Bench Press", "chest", true),
  entry("Pec Deck", "chest"),
  entry("OHP", "frontDelt"),
  entry("Lateral Raise", "sideDelt"),
  entry("Barbell Curl", "bicep"),
  entry("Squat", "quad", true),
];

test("a machine starts at 3 x 10 with a 2,5 kg step and a minute of rest", () => {
  const m = defaultDef("Pec Deck", "chest");
  assert.deepEqual([m.sets, m.repsLabel, m.targetReps, m.increment, m.restSec], [3, "10", 10, 2.5, 60]);
});

test("sets, rest and weight step stay inside their limits", () => {
  const d = defaultDef("X", "chest");
  assert.equal(bumpSets({ ...d, sets: 10 }, 1).sets, 10);
  assert.equal(bumpSets({ ...d, sets: 1 }, -1).sets, 1);
  assert.equal(bumpSets(d, 1).sets, 4);
  // At a limit the same object comes back, which is how a button knows to disable.
  const top = { ...d, sets: 10 };
  assert.equal(bumpSets(top, 1), top);
  assert.equal(bumpRest(d, 1).restSec, 75);
  assert.equal(bumpRest({ ...d, restSec: 0 }, -1).restSec, 0);
  assert.equal(bumpRest({ ...d, restSec: 300 }, 1).restSec, 300);
  assert.equal(bumpIncrement(d, 1).increment, 5);
  assert.equal(bumpIncrement(d, -1).increment, 2);
  assert.equal(bumpIncrement({ ...d, increment: 10 }, 1).increment, 10);
  assert.equal(bumpIncrement({ ...d, increment: 0 }, -1).increment, 0);
  // A step the list does not have starts from the nearest one.
  assert.equal(bumpIncrement({ ...d, increment: 3 }, 1).increment, 5);
  assert.ok(INCREMENTS.includes(2.5));
});

test("reps keep their unit and turn a range into a number", () => {
  const d = { ...defaultDef("X", "chest"), repsLabel: "8-10", targetReps: 9 };
  assert.equal(bumpReps(d, 1).repsLabel, "10");
  assert.equal(bumpReps(d, -1).repsLabel, "8");
  assert.equal(bumpReps({ ...d, repsLabel: "10/side", targetReps: 10 }, 1).repsLabel, "11/side");
  // Times move by five.
  assert.equal(bumpReps({ ...d, repsLabel: "45s", targetReps: 45 }, 1).repsLabel, "50s");
  assert.equal(bumpReps({ ...d, repsLabel: "40 min", targetReps: 40 }, -1).repsLabel, "35 min");
  // "max" becomes a number; the floor is 1.
  assert.equal(bumpReps({ ...d, repsLabel: "max", targetReps: 20 }, 1).repsLabel, "21");
  assert.equal(bumpReps({ ...d, repsLabel: "1", targetReps: 1 }, -1).targetReps, 1);
});

test("numbers are written in words", () => {
  assert.equal(kgLabel(2.5), "2,5 kg");
  assert.equal(kgLabel(5), "5 kg");
  assert.equal(kgLabel(0), "Tanpa");
  assert.equal(restLabel(45), "45 dtk");
  assert.equal(restLabel(90), "90 dtk");
  assert.equal(restLabel(300), "300 dtk");
  assert.equal(restLabel(0), "Tanpa");
  assert.equal(summaryLine({ ...defaultDef("X", "chest"), sets: 4, repsLabel: "8-10" }), "4 set × 8-10 · istirahat 60 dtk");
  assert.equal(summaryLine({ ...defaultDef("X", "chest"), restSec: 0 }), "3 set × 10 · tanpa istirahat");
  assert.equal(nbsp("4 set × 8-10 · istirahat 75 dtk"), "4\u00a0set × 8-10 · istirahat 75\u00a0dtk");
  assert.equal(nbsp("2,5 kg"), "2,5\u00a0kg");
  assert.equal(totalSets([defaultDef("A", "chest"), { ...defaultDef("B", "chest"), sets: 4 }]), 7);
});

test("the name follows the exercises, then the chosen muscles, and the typed name wins", () => {
  const bench = defaultDef("Bench Press", "chest");
  const ohp = defaultDef("OHP", "frontDelt");
  const curl = defaultDef("Curl", "bicep");
  assert.equal(autoSessionName([], []), "Sesi saya");
  assert.equal(autoSessionName([], ["legs", "abs"]), "Kaki + Perut");
  // Front delt is shoulders; the same group is named once.
  assert.equal(autoSessionName([bench, ohp, curl, defaultDef("Pec Deck", "chest")], ["abs"]), "Dada + Bahu + Lengan");
  assert.equal(sessionFocus([bench, ohp], []), "Dada · Bahu");
  assert.equal(sessionFocus([], []), "Latihan bebas");
  assert.equal(finalName("  Hari dada  ", "Dada"), "Hari dada");
  assert.equal(finalName("   ", "Dada"), "Dada");
  assert.equal(finalName(null, "Dada"), "Dada");
  assert.equal(finalName("x".repeat(80), "Dada").length, 60);
});

test("save is off for an empty session, with the reason in words", () => {
  assert.match(saveProblem([]) ?? "", /minimal 1 gerakan/);
  assert.equal(saveProblem([defaultDef("A", "chest")]), null);
});

test("the template keeps what was edited and cleans the rest", () => {
  const t = toTemplate(
    [{ ...defaultDef("  Bench Press ", "chest"), sets: 4, repsLabel: " ", targetReps: 9, restSec: 90, increment: 5 }],
    [],
    null,
  );
  assert.equal(t.name, "Dada");
  assert.equal(t.focus, "Dada");
  assert.deepEqual(
    t.exercises.map((e) => [e.name, e.sets, e.repsLabel, e.targetReps, e.increment, e.restSec, e.primary]),
    [["Bench Press", 4, "9", 9, 5, 90, ["chest"]]],
  );
});

test("suggestions follow the muscles, skip what is added, and put coach lifts last for a beginner", () => {
  const taken = new Set(["pec deck"]);
  assert.deepEqual(entriesForGroups(catalog, [], taken, true), []);
  assert.deepEqual(
    entriesForGroups(catalog, ["chest"], taken, true).map((e) => e.name),
    ["Bench Press"],
  );
  assert.deepEqual(
    entriesForGroups(catalog, ["chest", "legs"], new Set(), true).map((e) => e.name),
    ["Pec Deck", "Bench Press", "Squat"],
  );
  assert.deepEqual(
    entriesForGroups(catalog, ["chest", "legs"], new Set(), false).map((e) => e.name),
    ["Bench Press", "Pec Deck", "Squat"],
  );
  // OHP is shoulders, not chest.
  assert.deepEqual(entriesForGroups(catalog, ["shoulders"], new Set(), false).map((e) => e.name), ["OHP", "Lateral Raise"]);
});

test("search finds a name or a body part in Indonesian, and names that start with it come first", () => {
  assert.deepEqual(searchCatalog(catalog, "dada", new Set(), false).map((e) => e.name), ["Bench Press", "Pec Deck"]);
  assert.deepEqual(searchCatalog(catalog, "bisep curl", new Set(), false).map((e) => e.name), ["Barbell Curl"]);
  assert.deepEqual(searchCatalog(catalog, "press", new Set(), false).map((e) => e.name), ["Bench Press"]);
  // "ba" starts "Barbell Curl"; OHP and Lateral Raise only match through "Bahu".
  assert.deepEqual(searchCatalog(catalog, "ba", new Set(), false).map((e) => e.name), ["Barbell Curl", "OHP", "Lateral Raise"]);
  assert.deepEqual(searchCatalog(catalog, "  ", new Set(), false), []);
  assert.deepEqual(searchCatalog(catalog, "zzz", new Set(), false), []);
  assert.deepEqual(searchCatalog(catalog, "dada", new Set(["bench press"]), false).map((e) => e.name), ["Pec Deck"]);
});
