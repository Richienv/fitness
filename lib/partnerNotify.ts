// Server-only helper to proactively notify accepted partner(s) on real-time
// milestones & daily activities (weigh-ins, meals, workouts, steps, health
// achievements). NEVER add "use client" here.

import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { displayName, friendIds, isMissingRelationError } from "./social";
import { cleanCheerMessage, formatCheerNotification } from "./cheerFormat";
import { sendPushToUser } from "./webPush";

export type PartnerActivityEvent =
  | { type: "meal"; mealType: string; kcal: number; summary?: string; date: string }
  | { type: "weigh"; weightKg: number; date: string; timeLabel?: string }
  | { type: "workout"; sessionType: string; exercisesCount?: number; date: string }
  | { type: "steps"; steps: number; milestone: number; date: string }
  | { type: "achievement"; title: string; stageName?: string };

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Sarapan",
  lunch: "Makan siang",
  snack: "Camilan",
  dinner: "Makan malam",
};

const WORKOUT_LABEL: Record<string, string> = {
  PUSH_A: "Push A",
  PULL_A: "Pull A",
  LEGS: "Legs",
  PUSH_B: "Push B",
  PULL_B: "Pull B",
  FEM_LOWER_A: "Glutes & Lower",
  FEM_UPPER_A: "Upper Body",
  FEM_CARDIO: "Cardio Zone 2",
  FEM_LOWER_B: "Legs & Glutes",
  FEM_UPPER_B: "Pull & Push",
  FEM_LOWER_C: "Glute Pump",
  FEM_ARMS: "Arms & Shoulders",
  FEM_REST: "Active Recovery",
  CUSTOM: "Latihan",
};

function buildEventCopy(event: PartnerActivityEvent): {
  dedupeAction: string;
  dedupeEntity: string;
  cooldownMs: number;
  message: string;
} {
  switch (event.type) {
    case "meal": {
      const slotLabel = MEAL_LABEL[event.mealType] ?? "Makan";
      const kcal = Math.round(event.kcal);
      const summary = event.summary ? ` (${event.summary.slice(0, 48)})` : "";
      return {
        dedupeAction: "partner_notify.meal",
        dedupeEntity: `${event.date}:${event.mealType}`,
        cooldownMs: 10 * 60_000,
        message: cleanCheerMessage(
          `baru catat ${slotLabel}${summary}${kcal > 0 ? ` · ${kcal} kkal` : ""} 🍽️`,
        ),
      };
    }
    case "weigh": {
      const kgText = event.weightKg.toFixed(1).replace(".", ",");
      const timeSuffix = event.timeLabel ? ` pukul ${event.timeLabel}` : "";
      return {
        dedupeAction: "partner_notify.weigh",
        dedupeEntity: event.date,
        cooldownMs: 15 * 60_000,
        message: cleanCheerMessage(`baru timbang ${kgText} kg${timeSuffix} ⚖️`),
      };
    }
    case "workout": {
      const label = WORKOUT_LABEL[event.sessionType] ?? event.sessionType;
      const exPart =
        event.exercisesCount && event.exercisesCount > 0
          ? ` (${event.exercisesCount} gerakan)`
          : "";
      return {
        dedupeAction: "partner_notify.workout",
        dedupeEntity: `${event.date}:${event.sessionType}`,
        cooldownMs: 15 * 60_000,
        message: cleanCheerMessage(`baru selesai ${label}${exPart} 💪`),
      };
    }
    case "steps": {
      const stepsFmt = Math.round(event.steps).toLocaleString("id-ID");
      return {
        dedupeAction: "partner_notify.steps",
        dedupeEntity: `${event.date}:${event.milestone}`,
        cooldownMs: 24 * 3600_000,
        message: cleanCheerMessage(`baru tembus ${stepsFmt} langkah hari ini! 👟`),
      };
    }
    case "achievement": {
      const stagePart = event.stageName ? ` → buka latar ${event.stageName}` : "";
      return {
        dedupeAction: "partner_notify.achievement",
        dedupeEntity: event.title.toLowerCase().slice(0, 80),
        cooldownMs: 365 * 24 * 3600_000,
        message: cleanCheerMessage(
          `baru unlock pencapaian “${event.title}”${stagePart} ✨`,
        ),
      };
    }
  }
}

export async function notifyPartnerActivity(
  actorUserId: string,
  event: PartnerActivityEvent,
): Promise<{ sentTo: number; pushed: number; skipped?: string }> {
  try {
    const actor = await db.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, name: true, username: true, email: true, loginAlias: true, setup: true },
    });
    if (!actor) return { sentTo: 0, pushed: 0, skipped: "no-actor" };

    const setupObj =
      actor.setup && typeof actor.setup === "object"
        ? (actor.setup as { notifyPartner?: unknown })
        : null;
    if (setupObj?.notifyPartner === false) {
      return { sentTo: 0, pushed: 0, skipped: "muted" };
    }

    const partners = await friendIds(actorUserId);
    if (partners.length === 0) {
      return { sentTo: 0, pushed: 0, skipped: "no-partners" };
    }

    const copy = buildEventCopy(event);
    if (!copy.message) return { sentTo: 0, pushed: 0, skipped: "empty" };

    const cutoff = new Date(Date.now() - copy.cooldownMs);
    const recent = await db.activityLog
      .findFirst({
        where: {
          actor: actorUserId,
          action: copy.dedupeAction,
          entityId: copy.dedupeEntity,
          createdAt: { gte: cutoff },
        },
        select: { id: true },
      })
      .catch(() => null);

    if (recent) {
      return { sentTo: 0, pushed: 0, skipped: "cooldown" };
    }

    await db.activityLog
      .create({
        data: {
          actor: actorUserId,
          action: copy.dedupeAction,
          entityType: "PartnerNotify",
          entityId: copy.dedupeEntity,
          payload: { message: copy.message } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});

    const actorName = displayName(actor);
    const formatted = formatCheerNotification({
      senderName: actorName,
      kind: "activity",
      message: copy.message,
    });

    const now = new Date();
    let pushed = 0;

    await Promise.allSettled(
      partners.map(async (partnerId) => {
        try {
          await db.partnerCheer.create({
            data: {
              senderId: actorUserId,
              targetId: partnerId,
              kind: "activity",
              message: copy.message,
            },
          });
        } catch (err) {
          if (!isMissingRelationError(err)) throw err;
        }

        try {
          await db.roomVisit.upsert({
            where: { visitorId_hostId: { visitorId: actorUserId, hostId: partnerId } },
            update: {
              nudgeText: formatted.banner.slice(0, 120),
              nudgeAt: now,
            },
            create: {
              visitorId: actorUserId,
              hostId: partnerId,
              lastSeenAt: new Date(0),
              nudgeText: formatted.banner.slice(0, 120),
              nudgeAt: now,
            },
          });
        } catch (err) {
          if (!isMissingRelationError(err)) throw err;
        }

        const res = await sendPushToUser(partnerId, {
          title: formatted.title,
          body: formatted.body,
          url: "/?couple=1",
          tag: `${formatted.tag}-${event.type}`,
          data: {
            kind: "activity",
            eventType: event.type,
            senderId: actorUserId,
          },
        }).catch(() => ({ sentCount: 0 }));
        pushed += res.sentCount;
      }),
    );

    return { sentTo: partners.length, pushed };
  } catch {
    return { sentTo: 0, pushed: 0, skipped: "error" };
  }
}
