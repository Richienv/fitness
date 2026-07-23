"use client";

import { useMemo } from "react";
import { trainedDates, currentStreak } from "@/lib/workoutHistory";

const DOW = ["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"]; // Monday-first
const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Monthly practice calendar for LATIHAN — trained days glow, with a streak +
 *  month count. `today` is a YYYY-MM-DD (the active date). */
export default function WorkoutCalendar({ today }: { today: string }) {
  const { cells, monthLabel, streak, monthCount } = useMemo(() => {
    const trained = trainedDates();
    const [y, m] = today.split("-").map(Number); // m: 1-12
    const first = new Date(Date.UTC(y, m - 1, 1, 12));
    const daysInMonth = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
    // Monday-first offset (getUTCDay: 0=Sun..6=Sat).
    const lead = (first.getUTCDay() + 6) % 7;

    type Cell = { day: number; iso: string; trained: boolean } | null;
    const out: Cell[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isT = trained.has(iso);
      if (isT) count++;
      out.push({ day: d, iso, trained: isT });
    }
    return {
      cells: out,
      monthLabel: `${MONTHS[m - 1]} ${y}`,
      streak: currentStreak(today),
      monthCount: count,
    };
  }, [today]);

  return (
    <div
      style={{
        borderRadius: 20,
        padding: "16px 16px 18px",
        marginBottom: 20,
        background:
          "linear-gradient(180deg,rgba(255,138,60,.10),rgba(20,14,13,.6) 55%),#0e0c0d",
        border: "1px solid rgba(255,150,120,.2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          className="mono"
          style={{ fontSize: 10, letterSpacing: ".16em", color: "#9a938d" }}
        >
          KALENDER LATIHAN
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".08em",
            color: streak > 0 ? "#ffb59c" : "#8a837d",
            padding: "4px 10px",
            borderRadius: 999,
            background: streak > 0 ? "rgba(255,138,60,.12)" : "rgba(255,255,255,.04)",
            border: streak > 0 ? "1px solid rgba(255,150,120,.4)" : "1px solid rgba(255,255,255,.1)",
          }}
        >
          🔥 {streak} hari
        </span>
      </div>

      <div
        style={{
          fontFamily: "var(--font-dm-sans), sans-serif",
          fontWeight: 800,
          fontSize: 20,
          color: "#f5f2ef",
          margin: "6px 0 12px",
        }}
      >
        {monthLabel}
        <span
          className="mono"
          style={{ fontSize: 11, fontWeight: 400, color: "#8a837d", marginLeft: 8 }}
        >
          · {monthCount}× bulan ini
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 5,
          marginBottom: 5,
        }}
      >
        {DOW.map((d) => (
          <div
            key={d}
            className="mono"
            style={{ textAlign: "center", fontSize: 8.5, color: "#6a6660", letterSpacing: ".04em" }}
          >
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
        {cells.map((c, i) => {
          if (!c) return <div key={`x${i}`} />;
          const isToday = c.iso === today;
          return (
            <div
              key={c.iso}
              style={{
                aspectRatio: "1",
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-dm-mono), monospace",
                fontSize: 12,
                fontWeight: c.trained ? 700 : 400,
                color: c.trained ? "#fff" : "#6a6660",
                background: c.trained
                  ? "linear-gradient(180deg,#ff8a52,#ee3c30 70%,#c01f12)"
                  : "rgba(255,255,255,.03)",
                border: isToday
                  ? "1.5px solid rgba(255,180,120,.7)"
                  : "1px solid rgba(255,255,255,.06)",
                boxShadow: c.trained ? "0 3px 10px rgba(238,60,48,.3)" : "none",
              }}
            >
              {c.trained ? "🔥" : c.day}
            </div>
          );
        })}
      </div>
    </div>
  );
}
