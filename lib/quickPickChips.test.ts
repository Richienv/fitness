import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeQuickPickItems,
  quickPickDisplayName,
  quickPickRootKey,
} from "./quickPickChips.ts";

test("quickPickRootKey collapses Telur and Telur ayam into the same family root", () => {
  assert.equal(quickPickRootKey("Telur"), "telur");
  assert.equal(quickPickRootKey("Telur ayam"), "telur");
  assert.equal(quickPickRootKey("Whole egg"), "telur");
  assert.notEqual(quickPickRootKey("Telur dadar"), quickPickRootKey("Telur"));
  assert.notEqual(quickPickRootKey("Telur ceplok"), quickPickRootKey("Telur rebus"));
  assert.notEqual(quickPickRootKey("Putih telur"), quickPickRootKey("Telur"));
});

test("dedupeQuickPickItems never emits both Telur and Telur ayam and preserves priority order", () => {
  const chips = dedupeQuickPickItems(
    [
      { id: "stp-telur", name: "Telur", kcal: 80 },
      { id: "egg", name: "Telur ayam", kcal: 70 },
      { id: "chicken-breast", name: "Dada ayam", kcal: 275 },
      { id: "day-dada-fillet", name: "Dada ayam fillet", kcal: 165 },
      { id: "day-babi", name: "Babi", kcal: 242 },
      { id: "day-daging-babi", name: "Daging Babi", kcal: 242 },
      { id: "white-rice", name: "Nasi putih", kcal: 130 },
      { id: "brown-rice", name: "Nasi merah", kcal: 150 },
    ],
    6,
  );

  const names = chips.map((c) => c.name);
  assert.deepEqual(names, [
    "Telur",
    "Dada ayam",
    "Babi",
    "Nasi putih",
    "Nasi merah",
  ]);
});

test("quickPickDisplayName trims redundant lowercase English slash glosses", () => {
  assert.equal(quickPickDisplayName("Teh susu / milk tea"), "Teh susu");
  assert.equal(
    quickPickDisplayName("Sio Bak / Samcan Panggang Crispy"),
    "Sio Bak / Samcan Panggang Crispy",
  );
});
