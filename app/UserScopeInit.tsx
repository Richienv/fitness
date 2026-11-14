"use client";

import { useEffect, useState } from "react";
import { adoptLegacyDataOnce, setActiveUser } from "@/lib/userScope";

/** Sets the active user id (from the server session) into the client storage
 *  scope BEFORE any data-reading effect runs. Placed high in the layout, ahead
 *  of ServerSync and the page, so every localStorage read is namespaced to the
 *  right user on first paint. */
export default function UserScopeInit({
  userId,
  legacyOwner = false,
}: {
  userId: string | null;
  legacyOwner?: boolean;
}) {
  // useState initializer runs during this component's render — before child
  // effects — so the scope is set in time for first mount reads.
  useState(() => {
    setActiveUser(userId);
    if (userId && legacyOwner) adoptLegacyDataOnce(userId);
    return null;
  });

  // Keep in sync if the session changes across a soft navigation/refresh.
  useEffect(() => {
    setActiveUser(userId);
    if (userId && legacyOwner) adoptLegacyDataOnce(userId);
  }, [userId, legacyOwner]);

  return null;
}
