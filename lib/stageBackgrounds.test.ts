import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_STAGE_ID,
  FREE_STARTER_STAGE_IDS,
  getStageBackground,
  isStageBackgroundId,
  RARITY_TAG,
  STAGE_BACKGROUNDS,
} from "./stageBackgrounds.ts";

test("all 11 TCG/UNITE stage backgrounds have unique ids, cardCodes, valid rarities and foil styles", () => {
  assert.equal(STAGE_BACKGROUNDS.length, 11);
  const ids = new Set<string>();
  const codes = new Set<string>();
  const validRarities = new Set(["rare", "epic", "gold", "legendary"]);
  const validFoils = new Set(["unite", "gold", "holo", "prism"]);

  for (const s of STAGE_BACKGROUNDS) {
    assert.ok(!ids.has(s.id), `duplicate stage id: ${s.id}`);
    ids.add(s.id);
    assert.ok(!codes.has(s.cardCode), `duplicate cardCode: ${s.cardCode}`);
    codes.add(s.cardCode);
    assert.ok(validRarities.has(s.rarity), `invalid rarity on ${s.id}`);
    assert.ok(validFoils.has(s.foilStyle), `invalid foilStyle on ${s.id}`);
    assert.ok(s.badgeLabel.length > 0);
    assert.ok(s.previewGradient.includes("gradient"));
    assert.ok(s.foilGradient.includes("gradient"));
    assert.ok(RARITY_TAG[s.rarity].length > 0);
  }
});

test("3 free starter cards cover rare UNITE, metallic gold, and VMAX legendary prism immediately", () => {
  assert.equal(FREE_STARTER_STAGE_IDS.length, 3);
  const starters = FREE_STARTER_STAGE_IDS.map((id) => getStageBackground(id));
  assert.deepEqual(
    starters.map((s) => s.rarity),
    ["rare", "gold", "legendary"],
  );
  assert.equal(isStageBackgroundId(DEFAULT_STAGE_ID), true);
  assert.equal(isStageBackgroundId("non-existent-card"), false);
  assert.equal(getStageBackground("non-existent-card").id, DEFAULT_STAGE_ID);
});

test("lib/stageBackgrounds.ts remains server-safe with zero 'use client' directive", () => {
  const src = readFileSync(join(process.cwd(), "lib", "stageBackgrounds.ts"), "utf8");
  const firstCodeLine = src
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"));
  assert.notEqual(firstCodeLine, '"use client";');
  assert.notEqual(firstCodeLine, "'use client';");
});
