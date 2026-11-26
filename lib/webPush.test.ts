import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHEER_KINDS,
  CHEER_TEMPLATES,
  cleanCheerMessage,
  formatCheerNotification,
  normalizeCheerKind,
} from "./cheerFormat.ts";

test("normalizeCheerKind and cleanCheerMessage sanitize inputs safely", () => {
  assert.equal(normalizeCheerKind("say"), "say");
  assert.equal(normalizeCheerKind("remind"), "remind");
  assert.equal(normalizeCheerKind("cheer"), "cheer");
  assert.equal(normalizeCheerKind("unknown"), "say");

  assert.equal(cleanCheerMessage("  Halo   sayang \n "), "Halo sayang");
  assert.equal(cleanCheerMessage(null), "");
  assert.equal(cleanCheerMessage("a".repeat(250)).length, 180);
});

test("formatCheerNotification formats say, remind, and cheer consistently for push, banner, and share", () => {
  const say = formatCheerNotification({
    senderName: "Richie",
    kind: "say",
    message: "Aku lagi mikirin kamu nih ✨",
    appUrl: "https://r2-fit.vercel.app/?couple=1",
  });
  assert.equal(say.title, "💬 Richie ngomong");
  assert.equal(say.body, "Aku lagi mikirin kamu nih ✨");
  assert.equal(say.banner, "💬 Richie ngomong: Aku lagi mikirin kamu nih ✨");
  assert.equal(say.url, "/?couple=1");
  assert.equal(say.tag, "r2fit-cheer-say");
  assert.ok(say.shareText.includes("https://r2-fit.vercel.app/?couple=1"));

  const remind = formatCheerNotification({
    senderName: "Richie",
    kind: "remind",
    message: "Udah makan siang belum?",
  });
  assert.equal(remind.title, "⏰ Richie ngingetin");
  assert.equal(remind.banner, "⏰ Richie ngingetin: Udah makan siang belum?");
  assert.equal(remind.tag, "r2fit-cheer-remind");

  const cheer = formatCheerNotification({
    senderName: "Renita",
    kind: "cheer",
    message: "Semangat gym!",
  });
  assert.equal(cheer.title, "💛 Semangat dari Renita!");
  assert.equal(cheer.banner, "💛 Semangat dari Renita: Semangat gym!");
  assert.equal(cheer.tag, "r2fit-cheer-cheer");

  const activity = formatCheerNotification({
    senderName: "Renita",
    kind: "activity",
    message: "baru timbang 45,2 kg ⚖️",
  });
  assert.equal(activity.title, "✨ Renita");
  assert.equal(activity.banner, "✨ Renita baru timbang 45,2 kg ⚖️");
  assert.equal(activity.tag, "r2fit-partner-activity");
});

test("CHEER_KINDS and CHEER_TEMPLATES cover every category", () => {
  assert.deepEqual(
    CHEER_KINDS.map((k) => k.kind),
    ["say", "remind", "cheer"],
  );
  for (const kind of ["say", "remind", "cheer"] as const) {
    const items = CHEER_TEMPLATES.filter((t) => t.kind === kind);
    assert.ok(items.length >= 3, `expected >= 3 templates for ${kind}`);
  }
});

test("server-only lib/webPush.ts stays free of 'use client' and service worker handles push + notificationclick", () => {
  const webPushSrc = readFileSync(join(process.cwd(), "lib", "webPush.ts"), "utf8");
  const firstCodeLine = webPushSrc
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"));
  assert.notEqual(firstCodeLine, '"use client";');
  assert.notEqual(firstCodeLine, "'use client';");
  assert.ok(webPushSrc.includes("sendPushToUser"));
  assert.ok(webPushSrc.includes("isMissingRelationError"));

  const swSrc = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  assert.ok(swSrc.includes("v13-living-poses-streaks"));
  assert.ok(swSrc.includes('addEventListener("push"'));
  assert.ok(swSrc.includes('addEventListener("notificationclick"'));
});
