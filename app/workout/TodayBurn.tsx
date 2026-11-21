"use client";
import { ACTIVITY_BY_KEY } from "@/lib/burn";
import type { DayBurn } from "@/lib/burnData";
import type { ActivityEntry } from "@/lib/activity";
import Icon from "../ui/Icon";

const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");

export function activityAmount(a: ActivityEntry): string {
  const k = ACTIVITY_BY_KEY[a.kind];
  if (k.input === "steps") return `${fmt(a.steps ?? 0)} langkah`;
  if (k.input === "minutes")
    return `${fmt(a.minutes ?? 0)} menit${a.kind === "plank" ? "" : ` · ${a.intensity ?? "sedang"}`}`;
  return `${fmt(a.reps ?? 0)} kali`;
}

/** "Hari ini" on Latihan: what today burned, each activity with its own
 *  estimate, and the one way to add more. */
export default function TodayBurn({
  burn,
  onAdd,
  onDelete,
}: {
  burn: DayBurn | null;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const empty = !burn || (burn.gym.length === 0 && burn.activities.length === 0);
  return (
    <section className="lt-card" aria-labelledby="lt-today-title">
      <div className="lt-head">
        <h2 id="lt-today-title">Hari ini</h2>
        <span className="lt-note">perkiraan</span>
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
          {burn!.gym.map((g) => (
            <li key={g.id}>
              <span className="lt-ico gym" aria-hidden="true">
                <Icon name="workout" size={18} />
              </span>
              <span className="lt-row-text">
                <strong>Gym · {g.title}</strong>
                <small>{g.completed ? "Selesai" : "Sedang berlangsung"}</small>
              </span>
              <span className="lt-kcal">≈ {fmt(g.kcal)} kkal</span>
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
              <span className="lt-kcal">≈ {fmt(a.kcal)} kkal</span>
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
      <button type="button" className="secondary-button lt-add" onClick={onAdd}>
        <Icon name="plus" size={18} />
        Catat aktivitas
      </button>
      <p className="lt-foot">
        Kalori aktif, di luar kalori istirahat (seperti Apple Watch). Dihitung
        dari berat badanmu ({burn ? burn.kg.toLocaleString("id-ID") : "—"} kg),
        bisa meleset sekitar 20–30%. Tidak ditambahkan ke sisa kalori makan.
      </p>
    </section>
  );
}
