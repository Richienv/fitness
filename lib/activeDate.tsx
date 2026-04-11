"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { todayKey } from "./targets";

type Ctx = {
  activeDate: string; // "YYYY-MM-DD" in CST
  setActiveDate: (d: string) => void;
  goPrevDay: () => void;
  goNextDay: () => void;
  goToday: () => void;
  advanceToNextDay: () => void; // NEW DAY button
  isToday: boolean;
  canGoNext: boolean;
  label: string; // e.g. "TODAY · SAT APR 11", "YESTERDAY · FRI APR 10", "MON APR 7"
  short: string; // e.g. "SAT, APR 11"
  todayStr: string;
};

const ActiveDateContext = createContext<Ctx | null>(null);

export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatShort(dateStr: string): string {
  const dt = parseDate(dateStr);
  return dt
    .toLocaleDateString("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

export function formatLabel(dateStr: string, todayStr: string): string {
  const short = formatShort(dateStr);
  if (dateStr === todayStr) return `TODAY · ${short}`;
  if (dateStr === addDays(todayStr, -1)) return `YESTERDAY · ${short}`;
  if (dateStr === addDays(todayStr, 1)) return `TOMORROW · ${short}`;
  return short;
}

export function ActiveDateProvider({ children }: { children: React.ReactNode }) {
  const [todayStr, setTodayStr] = useState<string>("");
  const [activeDate, setActiveDateState] = useState<string>("");

  useEffect(() => {
    const t = todayKey();
    setTodayStr(t);
    setActiveDateState(t);
  }, []);

  const setActiveDate = useCallback((d: string) => setActiveDateState(d), []);
  const goPrevDay = useCallback(
    () => setActiveDateState((d) => (d ? addDays(d, -1) : d)),
    []
  );
  const goNextDay = useCallback(() => {
    setActiveDateState((d) => {
      if (!d) return d;
      const next = addDays(d, 1);
      // Don't allow past today
      return next > todayStr ? d : next;
    });
  }, [todayStr]);
  const goToday = useCallback(() => setActiveDateState(todayStr), [todayStr]);
  const advanceToNextDay = useCallback(() => {
    setActiveDateState((d) => (d ? addDays(d, 1) : d));
  }, []);

  const isToday = activeDate === todayStr;
  const canGoNext = activeDate !== "" && activeDate < todayStr;
  const label = activeDate ? formatLabel(activeDate, todayStr) : "";
  const short = activeDate ? formatShort(activeDate) : "";

  const value = useMemo<Ctx>(
    () => ({
      activeDate,
      setActiveDate,
      goPrevDay,
      goNextDay,
      goToday,
      advanceToNextDay,
      isToday,
      canGoNext,
      label,
      short,
      todayStr,
    }),
    [activeDate, setActiveDate, goPrevDay, goNextDay, goToday, advanceToNextDay, isToday, canGoNext, label, short, todayStr]
  );

  return <ActiveDateContext.Provider value={value}>{children}</ActiveDateContext.Provider>;
}

export function useActiveDate(): Ctx {
  const ctx = useContext(ActiveDateContext);
  if (!ctx) {
    // Allows components to render before the provider mounts; returns safe defaults.
    const today = typeof window !== "undefined" ? todayKey() : "";
    return {
      activeDate: today,
      setActiveDate: () => {},
      goPrevDay: () => {},
      goNextDay: () => {},
      goToday: () => {},
      advanceToNextDay: () => {},
      isToday: true,
      canGoNext: false,
      label: today ? formatLabel(today, today) : "",
      short: today ? formatShort(today) : "",
      todayStr: today,
    };
  }
  return ctx;
}
