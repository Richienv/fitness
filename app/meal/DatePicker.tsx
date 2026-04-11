"use client";

import { useMemo, useState } from "react";
import { addDays, parseDate } from "@/lib/activeDate";
import { getAllMeals } from "@/lib/store";

type Props = {
  activeDate: string;
  todayStr: string;
  onPick: (dateStr: string) => void;
  onClose: () => void;
};

const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTH_LABELS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function DatePicker({ activeDate, todayStr, onPick, onClose }: Props) {
  const initial = parseDate(activeDate);
  const [viewY, setViewY] = useState(initial.getUTCFullYear());
  const [viewM, setViewM] = useState(initial.getUTCMonth() + 1); // 1-indexed

  // Dates that have meal data, for highlighting "logged" days
  const loggedDates = useMemo(() => {
    if (typeof window === "undefined") return new Set<string>();
    const s = new Set<string>();
    for (const m of getAllMeals()) s.add(m.date);
    return s;
  }, []);

  const weeks = useMemo(() => {
    // First day of month (UTC)
    const first = new Date(Date.UTC(viewY, viewM - 1, 1));
    // getUTCDay: 0=Sun..6=Sat. We want Mon-start: index 0=Mon..6=Sun.
    const firstDay = first.getUTCDay();
    const offsetFromMonday = (firstDay + 6) % 7;
    const daysInMonth = new Date(Date.UTC(viewY, viewM, 0)).getUTCDate();

    const cells: ({ day: number; date: string } | null)[] = [];
    for (let i = 0; i < offsetFromMonday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, date: fmt(viewY, viewM, d) });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const w: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7));
    return w;
  }, [viewY, viewM]);

  function prevMonth() {
    if (viewM === 1) {
      setViewY(viewY - 1);
      setViewM(12);
    } else {
      setViewM(viewM - 1);
    }
  }
  function nextMonth() {
    if (viewM === 12) {
      setViewY(viewY + 1);
      setViewM(1);
    } else {
      setViewM(viewM + 1);
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet date-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className="sheet-title">SELECT DATE</div>
          <button type="button" className="sheet-close" onClick={onClose}>✕</button>
        </div>

        <div className="dp-month-nav">
          <button type="button" className="dp-month-btn" onClick={prevMonth}>←</button>
          <div className="dp-month-label mono">
            {MONTH_LABELS[viewM - 1]} {viewY}
          </div>
          <button type="button" className="dp-month-btn" onClick={nextMonth}>→</button>
        </div>

        <div className="dp-weekdays mono">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="dp-weekday">{w}</div>
          ))}
        </div>

        <div className="dp-grid">
          {weeks.map((row, ri) => (
            <div key={ri} className="dp-row">
              {row.map((cell, ci) => {
                if (!cell) return <div key={ci} className="dp-cell empty" />;
                const isToday = cell.date === todayStr;
                const isActive = cell.date === activeDate;
                const isFuture = cell.date > todayStr;
                const isLogged = loggedDates.has(cell.date);
                return (
                  <button
                    key={ci}
                    type="button"
                    className={
                      "dp-cell" +
                      (isToday ? " today" : "") +
                      (isActive ? " active" : "") +
                      (isFuture ? " future" : "") +
                      (isLogged && !isActive ? " logged" : "")
                    }
                    disabled={isFuture}
                    onClick={() => onPick(cell.date)}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="dp-legend mono">
          <span><span className="dp-dot today" /> TODAY</span>
          <span><span className="dp-dot logged" /> LOGGED</span>
          <span><span className="dp-dot future" /> FUTURE</span>
        </div>
      </div>
    </div>
  );
}

export { addDays };
