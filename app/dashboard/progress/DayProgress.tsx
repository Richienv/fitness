"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import {
  readProgressInsights,
  type ProgressInsightsData,
} from "@/lib/progressAnalyticsData";
import "./day-progress.css";

const kg = (n: number, d = 1) =>
  n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const n0 = (n: number) => Math.round(n).toLocaleString("id-ID");

function dayLabel(date: string, today: string): string {
  if (date === today) return "Hari ini";
  const yday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (date === yday) return "Kemarin";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function DayProgress() {
  const { data: session } = useSession();
  const [data, setData] = useState<ProgressInsightsData | null>(null);
  const refresh = useCallback(() => {
    try {
      setData(readProgressInsights(session?.user?.name));
    } catch {
      setData(null);
    }
  }, [session?.user?.name]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useSoftRefresh(refresh);
  if (!data) return null;
  const { projection: p, rows, today } = data;
  const logged = rows.filter(
    (r) => r.mealCount > 0 || r.weightKg !== null || r.workoutCount > 0 || r.waterMl > 0,
  );
  return (
    <section className="dp" aria-labelledby="dp-title">
      <div className="dp-head">
        <h2 id="dp-title">Hari per hari</h2>
        <span>{logged.length} hari tercatat</span>
      </div>
      {p ? (
        <div className="dp-forecast">
          <p>
            Kalau {p.sampleDays} hari terakhir berulang:{" "}
            <strong className={p.trend === "losing" ? "down" : p.trend === "gaining" ? "up" : ""}>
              {p.weeklyKgChange > 0 ? "+" : "−"}
              {kg(Math.abs(p.weeklyKgChange), 2)} kg/minggu
            </strong>
            <small>
              {" "}
              · rata-rata {n0(p.avgKcalIn)} kkal makan, {n0(p.avgProteinG)} g protein,{" "}
              {n0(p.avgBurnKcal)} kkal bakar
              {p.avgDeficitKcal >= 0
                ? `, defisit ${n0(p.avgDeficitKcal)}`
                : `, surplus ${n0(-p.avgDeficitKcal)}`}
            </small>
          </p>
          <ol>
            {[
              ["14 hari", p.projected14d],
              ["30 hari", p.projected30d],
              ["60 hari", p.projected60d],
              ["90 hari", p.projected90d],
            ].map(([label, value]) => (
              <li key={String(label)}>
                <span>{label}</span>
                <strong>{kg(Number(value))} kg</strong>
              </li>
            ))}
          </ol>
          {p.daysToTarget !== null && p.targetKg !== null && (
            <p className="dp-goal">
              Menuju {kg(p.targetKg)} kg sekitar {p.daysToTarget} hari
              {p.targetDate ? ` (${p.targetDate.split("-").reverse().join("/")})` : ""}.
            </p>
          )}
        </div>
      ) : (
        <p className="dp-empty">
          Catat makan beberapa hari supaya prediksi “kalau gini terus” bisa dihitung.
        </p>
      )}
      {logged.length === 0 ? (
        <p className="dp-empty">Belum ada berat, makan, atau latihan tercatat.</p>
      ) : (
        <ul className="dp-days">
          {logged.slice(0, 21).map((r) => (
            <li key={r.date}>
              <div className="dp-day-top">
                <strong>{dayLabel(r.date, today)}</strong>
                <span>{r.weightKg !== null ? `${kg(r.weightKg)} kg` : "—"}</span>
              </div>
              <div className="dp-stats">
                <span>
                  <b>{r.kcalIn > 0 ? n0(r.kcalIn) : "—"}</b> kkal
                </span>
                <span>
                  <b>{r.proteinG > 0 ? n0(r.proteinG) : "—"}</b> g protein
                </span>
                <span>
                  <b>{r.totalBurnKcal > 0 ? n0(r.totalBurnKcal) : "—"}</b> bakar
                </span>
                <span>
                  <b>
                    {r.deficitKcal === null
                      ? "—"
                      : `${r.deficitKcal >= 0 ? "−" : "+"}${n0(Math.abs(r.deficitKcal))}`}
                  </b>{" "}
                  selisih
                </span>
                {r.waterMl > 0 && (
                  <span>
                    <b>{kg(r.waterMl / 1000, 1)}</b> L air
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
