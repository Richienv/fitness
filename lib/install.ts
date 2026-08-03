"use client";

// Working out how someone can install this, on the device they're holding.
//
// iOS is the awkward one. Safari has never fired `beforeinstallprompt` and
// there is no API to trigger Add to Home Screen — the only thing an app can do
// is tell the user where the button is. Worse, Chrome and Firefox on iOS are
// Safari underneath but their "Add to Home Screen" makes a bookmark that opens
// in the browser, not a standalone app. So the honest answer for a non-Safari
// iOS browser is "open this in Safari first", and detecting that is the whole
// reason this file exists.

export type Platform =
  | "installed" // already running from the home screen
  | "ios-safari" // can install, needs the manual walkthrough
  | "ios-other" // Chrome/Firefox/Edge on iOS — must switch to Safari
  | "android" // beforeinstallprompt should fire
  | "desktop"
  | "unknown";

/** True when the page is running as an installed app rather than in a tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS uses the legacy navigator.standalone; everyone else uses display-mode.
  const legacy = (window.navigator as unknown as { standalone?: boolean }).standalone;
  if (legacy === true) return true;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true
  );
}

export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac; the touch points give it away.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** Chrome / Firefox / Edge / Opera on iOS — all Safari inside, none installable. */
export function isIOSNonSafari(): boolean {
  if (typeof window === "undefined") return false;
  return isIOS() && /CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(navigator.userAgent);
}

export function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  if (isStandalone()) return "installed";
  if (isIOS()) return isIOSNonSafari() ? "ios-other" : "ios-safari";
  if (/Android/.test(navigator.userAgent)) return "android";
  return "desktop";
}

// --- dismissal memory -------------------------------------------------------

const DISMISS_KEY = "r2fit.install.dismissed";
const SNOOZE_DAYS = 30;

export function dismissInstallPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode — the prompt just comes back, which is survivable */
  }
}

export function installPromptDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    if (!Number.isFinite(at) || at <= 0) return false;
    return Date.now() - at < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
