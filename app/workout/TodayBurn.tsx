"use client";
import Link from "next/link";
import { ACTIVITY_BY_KEY } from "@/lib/burn";
import type { DayBurn } from "@/lib/burnData";
import type { ActivityEntry } from "@/lib/activity";
import { receivedLabel } from "@/lib/health";
import Icon from "../ui/Icon";
import FoodTarget from "./FoodTarget";

const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");
const when = (iso?: string) => (iso ? receivedLabel(iso) : null);

export function activityAmount(a: ActivityEntry): string {
  const k = ACTIVITY_BY_KEY[a.kind];
  // Non-breaking spaces keep "6.200 langkah" on one line in narrow rows.
  if (k.input === "steps") return `${fmt(a.steps ?? 0)} langkah`;
  if (k.input === "minutes")
    return `${fmt(a.minutes ?? 0)} menit${a.kind === "plank" ? "" : ` · ${a.intensity ?? "sedang"}`}`;
  return `${fmt(a.reps ?? 0)} kali`;
}

/** "Hari ini" on Latihan: what today burned, each activity with its own
 *  estimate, and the one way to add more. */
export default function TodayBurn({
  burn,
  onAdd,
  onDelete,
  hideAdd = false,
}: {
  burn: DayBurn | null;
  onAdd: () => void;
  onDelete: (id: string) => void;
  hideAdd?: boolean;
}) {
  const health = burn?.health ?? null;
  const fromHealth = burn?.source === "health";
  const empty =
    !burn || (burn.gym.length === 0 && burn.activities.length === 0 && !health);
  // A row Apple Health already covers is shown, but its kcal is not added.
  const kcalCell = (key: string, kcal: number, isSteps = false) =>
    burn?.excluded.includes(key) ? (
      <span className="lt-kcal lt-covered">
        {isSteps && !fromHealth ? "diganti Apple Health" : "sudah termasuk"}
      </span>
    ) : (
      <span className="lt-kcal">≈ {fmt(kcal)} kkal</span>
    );
  return (
    <section className="lt-card" aria-labelledby="lt-today-title">
      <div className="lt-head">
        <h2 id="lt-today-title">Hari ini</h2>
        <span className="lt-note">{fromHealth ? "dari Apple Health" : "perkiraan"}</span>
      </div>
      <p className="lt-total">
        <strong>≈ {fmt(burn?.total ?? 0)}</strong> kkal aktif terbakar
      </p>
      {empty ? (
        <p className="lt-empty">
          Belum ada aktivitas hari ini. Catat langkah, sepeda atau push-up.
        </p>
      ) : (
        <ul className="lt-rows">
          {health && (
            <li>
              <span className="lt-ico health" aria-hidden="true">
                <Icon name="flame" size={18} />
              </span>
              <span className="lt-row-text">
                <strong>Apple Health</strong>
                <small>
                  {[
                    health.steps !== null ? `${fmt(health.steps)} langkah` : null,
                    health.distanceKm !== null
                      ? `${health.distanceKm.toLocaleString("id-ID")} km`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Kalori aktif"}
                </small>
              </span>
              <span className="lt-kcal">
                {health.activeKcal !== null && health.activeKcal > 0
                  ? `${fmt(health.activeKcal)} kkal`
                  : burn!.healthStepsKcal !== null
                    ? `≈ ${fmt(burn!.healthStepsKcal)} kkal`
                    : ""}
              </span>
              <span aria-hidden="true" />
            </li>
          )}
          {burn!.gym.map((g) => (
            <li key={g.id}>
              <span className="lt-ico gym" aria-hidden="true">
                <Icon name="workout" size={18} />
              </span>
              <span className="lt-row-text">
                <strong>Gym · {g.title}</strong>
                <small>
                  {g.completed ? "Selesai" : "Sedang berlangsung"}
                  {g.tonnageKg > 0 ? ` · ${fmt(g.tonnageKg)} kg volume` : ""}
                </small>
              </span>
              {kcalCell(`gym:${g.id}`, g.kcal)}
              <span aria-hidden="true" />
            </li>
          ))}
          {burn!.activities.map((a) => (
            <li key={a.id}>
              <span className="lt-ico" aria-hidden="true">
                <Icon name={a.kind === "langkah" || a.kind === "jalan" ? "flame" : "plus"} size={18} />
              </span>
              <span className="lt-row-text">
                <strong>{ACTIVITY_BY_KEY[a.kind].label}</strong>
                <small>{activityAmount(a)}</small>
              </span>
              {kcalCell(`act:${a.id}`, a.kcal, a.kind === "langkah")}
              <button
                type="button"
                className="icon-button"
                aria-label={`Hapus ${ACTIVITY_BY_KEY[a.kind].label}, ${activityAmount(a)}`}
                onClick={() => onDelete(a.id)}
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!hideAdd && (
        <button type="button" className="primary-button lt-add" onClick={onAdd}>
          <Icon name="plus" size={18} />
          Catat aktivitas
        </button>
      )}
      <p className="lt-foot">
        {fromHealth
          ? "Total dari Apple Health. Catatan manual tetap tampil, tidak dijumlah dua kali."
          : `Perkiraan kalori aktif dari berat ${burn ? burn.kg.toLocaleString("id-ID") : "—"} kg.`}
      </p>
      <FoodTarget burnKcal={burn?.total ?? 0} />
      <Link href="/settings/health" className="lt-health-link">
        {health
          ? `Apple Health diperbarui ${when(health.receivedAt) ?? "hari ini"} · Atur`
          : "Hubungkan Apple Health (langkah dan kalori dari Apple Watch)"}
      </Link>
    </section>
  );
}
