import { test } from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import {
  avatarImageSrc,
  clampAvatarLevel,
  getAvatarLevelMeta,
  RENITA_LEVELS,
  RICHIE_LEVELS,
} from "./avatarLevels.ts";

test("every character defines 12 distinct level personas spanning all four tiers", () => {
  assert.equal(RICHIE_LEVELS.length, 12);
  assert.equal(RENITA_LEVELS.length, 12);
  assert.equal(new Set(RICHIE_LEVELS.map((x) => x.title)).size, 12);
  assert.equal(new Set(RENITA_LEVELS.map((x) => x.title)).size, 12);
  assert.equal(getAvatarLevelMeta("richie", 1).tier, "pemula");
  assert.equal(getAvatarLevelMeta("richie", 4).tier, "naik_kelas");
  assert.equal(getAvatarLevelMeta("richie", 7).tier, "keren");
  assert.equal(getAvatarLevelMeta("richie", 12).tier, "legendaris");
  assert.equal(getAvatarLevelMeta("renita", 12).tier, "legendaris");
});

test("avatar levels clamp safely and resolve versioned v3 WebP paths on disk", () => {
  assert.equal(clampAvatarLevel(0), 1);
  assert.equal(clampAvatarLevel(-5), 1);
  assert.equal(clampAvatarLevel(99), 12);
  assert.equal(clampAvatarLevel(Number.NaN), 1);

  for (const character of ["richie", "renita"] as const) {
    for (let lvl = 1; lvl <= 12; lvl++) {
      const src = avatarImageSrc(character, lvl);
      assert.match(src, /^\/avatars\/v3\/(richie|renita)-level-(0[1-9]|1[0-2])\.webp$/);
      const diskPath = join(process.cwd(), "public", src.slice(1));
      const st = statSync(diskPath);
      assert.ok(st.size > 5_000, `${src} looks unexpectedly tiny (${st.size} B)`);
    }
  }
});
