// Talking to the iOS shell from the web app.
//
// Nothing here imports @capacitor/* on purpose. Those packages exist in
// package.json so the CocoaPods side of the native build can find the plugins,
// but importing them would pull a native-only bridge into the Next bundle that
// every browser user then downloads for nothing. Capacitor already injects
// `window.Capacitor` inside the WKWebView, so the global IS the API — and in a
// normal browser it is simply undefined and every call below no-ops.

import { TARGETS, todayKey } from "@/lib/targets";
import { getDaily } from "@/lib/store";

type PluginCall = (options: Record<string, unknown>) => Promise<unknown>;

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, Record<string, PluginCall> | undefined>;
}

function cap(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only inside the iOS/Android shell, never in a browser or a PWA. */
export function isNativeApp(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

/** "ios" | "android" | "web" */
export function nativePlatform(): string {
  return cap()?.getPlatform?.() ?? "web";
}

function bridge(): Record<string, PluginCall> | undefined {
  return cap()?.Plugins?.R2WidgetBridge as Record<string, PluginCall> | undefined;
}

/** Today's personal goal — a gym day and a rest day have different numbers. */
function todaysTargets(): { kcal: number; protein: number } {
  try {
    const t = getDaily(todayKey()).gymDay ? TARGETS.gymDay : TARGETS.restDay;
    return { kcal: Math.round(t.kcal), protein: Math.round(t.protein) };
  } catch {
    return { kcal: 0, protein: 0 };
  }
}

export type WidgetSyncResult = "ok" | "not-native" | "unauthorized" | "failed";

/**
 * Hand the home-screen widget what it needs to fetch today's numbers.
 *
 * The widget extension is a separate process with no access to the web view's
 * cookies, so it authenticates with the signed read-only token from
 * /api/widget/token instead. This drops that token (plus today's targets) into
 * the shared App Group and asks WidgetKit to redraw.
 *
 * Safe to call often — it is how the widget gets refreshed after logging a meal.
 */
export async function syncWidget(): Promise<WidgetSyncResult> {
  const plugin = bridge();
  if (!isNativeApp() || !plugin?.save) return "not-native";

  let token: string;
  try {
    const r = await fetch("/api/widget/token", { credentials: "same-origin" });
    if (r.status === 401) return "unauthorized";
    const j = (await r.json()) as { ok?: boolean; data?: { token?: string } };
    if (!j?.ok || !j.data?.token) return "failed";
    token = j.data.token;
  } catch {
    return "failed";
  }

  const { kcal, protein } = todaysTargets();
  try {
    await plugin.save({
      token,
      apiBase: window.location.origin,
      kcalTarget: kcal,
      proteinTarget: protein,
    });
    return "ok";
  } catch {
    return "failed";
  }
}

/**
 * Wipe the shared token. Called on sign-out: a widget still showing the
 * previous account's calories after someone else logs in is a data leak, not
 * a stale cache.
 */
export async function clearWidget(): Promise<void> {
  const plugin = bridge();
  if (!isNativeApp() || !plugin?.clear) return;
  try {
    await plugin.clear({});
  } catch {
    /* nothing useful to do — the token expires on its own */
  }
}
