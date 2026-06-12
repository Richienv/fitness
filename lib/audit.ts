import { db } from "./db";

export async function logActivity(args: {
  actor: string;
  action: string;
  entityId?: string;
  entityType?: string;
  payload?: unknown;
}): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        actor: args.actor,
        action: args.action,
        entityId: args.entityId,
        entityType: args.entityType,
        payload: (args.payload ?? null) as never,
      },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}

export function getActor(req: Request): string {
  return req.headers.get("x-actor") || "richie-web";
}
