"use client";
// Durable client-side offline outbox. Every mutation (meals, weigh-ins,
// workouts, water, profile/stage prefs) attempts a fast network request and
// queues itself cleanly in per-user localStorage whenever offline or flaky,
// then auto-flushes as soon as connectivity returns.

import { scopedKey } from "./userScope";

const OUTBOX_KEY = "r2.outbox.v1";
const MAX_OUTBOX_ITEMS = 150;
const MAX_ATTEMPTS = 12;

export type OutboxMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export type OutboxItem = {
  id: string;
  method: OutboxMethod;
  url: string;
  body?: unknown;
  dedupeKey?: string;
  createdAt: number;
  attempts: number;
};

let flushPromise: Promise<{ flushed: number; remaining: number }> | null = null;

function readQueue(): OutboxItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(scopedKey(OUTBOX_KEY)) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (x): x is OutboxItem =>
        Boolean(x) &&
        typeof x === "object" &&
        typeof (x as OutboxItem).id === "string" &&
        typeof (x as OutboxItem).url === "string" &&
        typeof (x as OutboxItem).method === "string",
    );
  } catch {
    return [];
  }
}

function writeQueue(items: OutboxItem[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = items.slice(-MAX_OUTBOX_ITEMS);
    if (trimmed.length === 0) {
      window.localStorage.removeItem(scopedKey(OUTBOX_KEY));
    } else {
      window.localStorage.setItem(scopedKey(OUTBOX_KEY), JSON.stringify(trimmed));
    }
    window.dispatchEvent(
      new CustomEvent("r2:outbox-change", { detail: { count: trimmed.length } }),
    );
  } catch {
    // ignore storage quota errors
  }
}

export function getOutboxCount(): number {
  return readQueue().length;
}

export function enqueueOutboxItem(input: {
  method: OutboxMethod;
  url: string;
  body?: unknown;
  dedupeKey?: string;
}): void {
  if (typeof window === "undefined") return;
  const q = readQueue();
  const next: OutboxItem = {
    id: crypto.randomUUID(),
    method: input.method,
    url: input.url,
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    createdAt: Date.now(),
    attempts: 0,
  };
  const filtered = input.dedupeKey
    ? q.filter((x) => x.dedupeKey !== input.dedupeKey)
    : q;
  filtered.push(next);
  writeQueue(filtered);
}

export function removeOutboxByDedupeKey(dedupeKey: string): void {
  if (typeof window === "undefined" || !dedupeKey) return;
  const q = readQueue();
  const next = q.filter((x) => x.dedupeKey !== dedupeKey);
  if (next.length !== q.length) writeQueue(next);
}

export type SendOrQueueResult = {
  ok: boolean;
  queued: boolean;
  status?: number;
  response?: Response;
};

/** Try a live request right away; on offline, timeout, 408/429, or 5xx, enqueue
 *  into the durable outbox so ServerSync replays it automatically later. */
export async function sendOrQueue({
  url,
  method,
  body,
  dedupeKey,
  timeoutMs = 7000,
  keepalive = true,
}: {
  url: string;
  method: OutboxMethod;
  body?: unknown;
  dedupeKey?: string;
  timeoutMs?: number;
  keepalive?: boolean;
}): Promise<SendOrQueueResult> {
  if (typeof window === "undefined") {
    return { ok: false, queued: false };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueueOutboxItem({ method, url, body, dedupeKey });
    return { ok: false, queued: true };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: keepalive && body !== undefined ? JSON.stringify(body).length < 60_000 : keepalive,
      signal: controller.signal,
    });
    if (res.ok) {
      if (dedupeKey) removeOutboxByDedupeKey(dedupeKey);
      return { ok: true, queued: false, status: res.status, response: res };
    }
    // 4xx validation/auth errors (except 408 timeout / 429 rate-limit) should not retry forever,
    // except 401 when session temporarily refreshes or transient edge glitches? Keep 408/429/5xx queued.
    if (res.status >= 500 || res.status === 408 || res.status === 429) {
      enqueueOutboxItem({ method, url, body, dedupeKey });
      return { ok: false, queued: true, status: res.status, response: res };
    }
    return { ok: false, queued: false, status: res.status, response: res };
  } catch {
    enqueueOutboxItem({ method, url, body, dedupeKey });
    return { ok: false, queued: true };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Flush queued mutations in FIFO order. Stops early if connectivity drops. */
export async function flushOutbox(): Promise<{ flushed: number; remaining: number }> {
  if (typeof window === "undefined") return { flushed: 0, remaining: 0 };
  if (flushPromise) return flushPromise;

  flushPromise = (async () => {
    const initial = readQueue();
    if (initial.length === 0) return { flushed: 0, remaining: 0 };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { flushed: 0, remaining: initial.length };
    }

    let flushed = 0;
    const remaining: OutboxItem[] = [];
    let abortedOnline = false;

    for (const item of initial) {
      if (abortedOnline) {
        remaining.push(item);
        continue;
      }
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers:
            item.body !== undefined ? { "Content-Type": "application/json" } : undefined,
          body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
          signal: controller.signal,
        });
        if (res.ok) {
          flushed++;
          continue;
        }
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          // Drop malformed / forbidden item rather than wedging the queue
          continue;
        }
        const nextAttempts = item.attempts + 1;
        if (nextAttempts < MAX_ATTEMPTS) {
          remaining.push({ ...item, attempts: nextAttempts });
        }
      } catch {
        abortedOnline = true;
        const nextAttempts = item.attempts + 1;
        if (nextAttempts < MAX_ATTEMPTS) {
          remaining.push({ ...item, attempts: nextAttempts });
        }
      } finally {
        window.clearTimeout(timer);
      }
    }

    // Merge with any items enqueued while flushing was running
    const latest = readQueue();
    const initialIds = new Set(initial.map((x) => x.id));
    const newlyAdded = latest.filter((x) => !initialIds.has(x.id));
    const merged = [...remaining];
    for (const n of newlyAdded) {
      const idx = n.dedupeKey
        ? merged.findIndex((x) => x.dedupeKey === n.dedupeKey)
        : -1;
      if (idx >= 0) merged[idx] = n;
      else merged.push(n);
    }
    writeQueue(merged);

    return { flushed, remaining: merged.length };
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}
