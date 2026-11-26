// Server-only Web Push delivery helper (NEVER add "use client" here).
// Uses VAPID credentials from env and degrades gracefully when unconfigured
// or when PushSubscription has not yet been pushed to Postgres.

import { sendNotification, setVapidDetails } from "web-push";
import { db } from "./db";
import { isMissingRelationError } from "./social";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
};

export type PushSendResult = {
  configured: boolean;
  totalSubscriptions: number;
  sentCount: number;
};

export function getVapidPublicKey(): string {
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
}

function getVapidPrivateKey(): string {
  return (process.env.VAPID_PRIVATE_KEY || "").trim();
}

function getVapidSubject(): string {
  return (process.env.VAPID_SUBJECT || "mailto:richie@r2-fit.vercel.app").trim();
}

export function isWebPushConfigured(): boolean {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey());
}

function configureVapid(): boolean {
  const pub = getVapidPublicKey();
  const priv = getVapidPrivateKey();
  if (!pub || !priv) return false;
  try {
    setVapidDetails(getVapidSubject(), pub, priv);
    return true;
  } catch {
    return false;
  }
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!configureVapid()) {
    return { configured: false, totalSubscriptions: 0, sentCount: 0 };
  }

  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    subs = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  } catch (err) {
    if (isMissingRelationError(err)) {
      return { configured: true, totalSubscriptions: 0, sentCount: 0 };
    }
    throw err;
  }

  if (subs.length === 0) {
    return { configured: true, totalSubscriptions: 0, sentCount: 0 };
  }

  const bodyJson = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/?couple=1",
    tag: payload.tag || "r2fit-cheer",
    data: { ...(payload.data || {}), url: payload.url || "/?couple=1" },
  });

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          bodyJson,
          { TTL: 86_400, urgency: "high" },
        );
        return true;
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
        return false;
      }
    }),
  );

  const sentCount = results.filter(
    (r) => r.status === "fulfilled" && r.value === true,
  ).length;

  return {
    configured: true,
    totalSubscriptions: subs.length,
    sentCount,
  };
}
