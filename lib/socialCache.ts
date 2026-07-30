"use client";

// Last-known TEMAN data, cached on device.
//
// The friends page used to open blank and then, a beat later, fill in. Worse
// than blank: while the three fetches were in flight, `social` was null, so
// `social?.friends ?? []` came out empty and the page rendered the EMPTY
// state — "Belum ada teman di sini" — at someone who has friends. Loading and
// having-nothing looked identical, and only one of them was true.
//
// Two fixes, and this file is the first: paint the last-known answer
// immediately, then replace it when the network agrees. The second is in
// SocialHome — a `ready` flag, so an empty state is only ever shown once the
// server has actually said "empty".
//
// Cached under the user scope, so signing in as someone else can't show you
// their friends. Mirrors lib/foodCatalogue.ts deliberately: same shape, same
// swallow-on-quota rule, one pattern to learn.

import { scopedKey } from "./userScope.ts";

const KEY = "richie.social.v1";
const BOARD_KEY = "richie.socialBoard.v1";

/** Short. This is "what you saw last time" for a first paint, not a data
 *  store — a friend added on another device should show up within the hour,
 *  and the network answer always overwrites it seconds later anyway. */
const TTL_MS = 60 * 60 * 1000;

type Wrapped<T> = { at: number; data: T };

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Wrapped<T>;
    if (!parsed || typeof parsed.at !== "number" || !parsed.data) return null;
    if (Date.now() - parsed.at > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      scopedKey(key),
      JSON.stringify({ at: Date.now(), data } satisfies Wrapped<T>)
    );
  } catch {
    // Over quota. Losing the cache costs one spinner; it must never cost the
    // page, so this is swallowed deliberately.
  }
}

export function readCachedSocial<T>(): T | null {
  return read<T>(KEY);
}
export function writeCachedSocial<T>(data: T): void {
  write(KEY, data);
}

/** Boards are per scope+date, so the key carries both — yesterday's TEMAN
 *  board must never be painted as today's KOTA board. */
export function readCachedBoard<T>(scope: string, date: string): T | null {
  return read<T>(`${BOARD_KEY}.${scope}.${date}`);
}
export function writeCachedBoard<T>(scope: string, date: string, data: T): void {
  write(`${BOARD_KEY}.${scope}.${date}`, data);
}
