"use client";

import { useEffect, useState } from "react";

type ClockListener = (now: number) => void;

const listeners = new Set<ClockListener>();
let timer: ReturnType<typeof setInterval> | null = null;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let interactionPaused = false;
let attached = false;

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function notifyNow() {
  if (typeof document === "undefined" || document.hidden || interactionPaused) return;
  const now = Date.now();
  for (const cb of listeners) cb(now);
}

function startTimer() {
  if (
    timer !== null ||
    typeof document === "undefined" ||
    document.hidden ||
    interactionPaused ||
    listeners.size === 0
  ) {
    return;
  }
  timer = setInterval(notifyNow, 1000);
}

function scheduleResume() {
  if (resumeTimer !== null) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    resumeTimer = null;
    interactionPaused = false;
    if (listeners.size > 0 && typeof document !== "undefined" && !document.hidden) {
      notifyNow();
      startTimer();
    }
  }, 180);
}

function pauseForInteraction() {
  interactionPaused = true;
  stopTimer();
  scheduleResume();
}

function onVisibilityChange() {
  if (typeof document === "undefined") return;
  if (document.hidden) {
    stopTimer();
  } else if (!interactionPaused && listeners.size > 0) {
    notifyNow();
    startTimer();
  }
}

function attachGlobalListeners() {
  if (attached || typeof window === "undefined" || typeof document === "undefined") return;
  attached = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("scroll", pauseForInteraction, { passive: true, capture: true });
  window.addEventListener("touchstart", pauseForInteraction, { passive: true });
  window.addEventListener("touchmove", pauseForInteraction, { passive: true });
  window.addEventListener("touchend", scheduleResume, { passive: true });
  window.addEventListener("touchcancel", scheduleResume, { passive: true });
}

function detachGlobalListeners() {
  if (!attached || typeof window === "undefined" || typeof document === "undefined") return;
  attached = false;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("scroll", pauseForInteraction, true);
  window.removeEventListener("touchstart", pauseForInteraction);
  window.removeEventListener("touchmove", pauseForInteraction);
  window.removeEventListener("touchend", scheduleResume);
  window.removeEventListener("touchcancel", scheduleResume);
  if (resumeTimer !== null) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
  interactionPaused = false;
}

/**
 * Shared 1-second timestamp ticker that pauses when the page is hidden or
 * actively scrolling/touching so 120Hz scrolling never competes with React renders.
 */
export function useSecondTick(enabled: boolean): number | null {
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTick(null);
      return;
    }

    const onTick: ClockListener = (now) => setTick(now);
    listeners.add(onTick);
    attachGlobalListeners();

    if (typeof document !== "undefined" && !document.hidden && !interactionPaused) {
      setTick(Date.now());
      startTimer();
    }

    return () => {
      listeners.delete(onTick);
      if (listeners.size === 0) {
        stopTimer();
        detachGlobalListeners();
      }
    };
  }, [enabled]);

  return tick;
}
