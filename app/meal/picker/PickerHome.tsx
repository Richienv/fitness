"use client";
import { memo } from "react";
import type { Tile } from "@/lib/foodTiles";
import Icon from "../../ui/Icon";

export type UsualChip = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
};

export type TileView = {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  personal: boolean;
};

function PickerHome({
  mealLabel,
  usual,
  catalogueCount = 0,
  savedCount = 0,
  groupsCount = 0,
  activeSecondary = null,
  loading,
  error,
  onRetry,
  onUsual,
  onMore,
  onToggleSaved,
  onToggleGroups,
}: {
  mealLabel: string;
  usual: UsualChip[];
  catalogueCount?: number;
  savedCount?: number;
  groupsCount?: number;
  activeSecondary?: "saved" | "groups" | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onUsual: (id: string) => void;
  onMore: () => void;
  onToggleSaved: () => void;
  onToggleGroups: () => void;
}) {
  return (
    <section className="picker-home">
      {usual.length > 0 && (
        <div className="usual-foods">
          <div className="usual-head">
            <h2>Pilihan cepat untuk {mealLabel.toLowerCase()}</h2>
            <span>1 ketuk tambah</span>
          </div>
          <div className="usual-grid">
            {usual.map((u) => (
              <button
                type="button"
                className="usual-card"
                key={u.id}
                onClick={() => onUsual(u.id)}
              >
                <span className="usual-card-body">
                  <strong>{u.name}</strong>
                  <small>
                    {Math.round(u.kcal)} kkal · {Math.round(u.protein * 10) / 10} g protein
                  </small>
                </span>
                <span className="usual-card-plus" aria-hidden="true">
                  <Icon name="plus" size={15} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {usual.length === 0 && (
        <p className="quiet search-first">
          Ketik nama makanan di kolom atas, misalnya “babi”, “ayam goreng”, atau
          “telur”. Ketuk hasilnya untuk langsung mencatat; porsinya bisa diubah
          kapan saja.
        </p>
      )}
      {loading && (
        <p className="quiet picker-loading" role="status">
          Menyiapkan 4.870+ katalog makanan…
        </p>
      )}
      {error && (
        <div className="status-message" role="status">
          <p>{error}</p>
          <button type="button" className="text-button" onClick={onRetry}>
            Coba muat lagi
          </button>
        </div>
      )}
      <div className="picker-secondary-wrap">
        <span className="picker-secondary-label">Menu &amp; pustaka</span>
        <div className="picker-secondary-bar" role="group" aria-label="Menu dan pustaka makanan">
          <button
            type="button"
            className="picker-secondary-btn"
            onClick={onMore}
          >
            <strong>Jelajahi semua makanan</strong>
            <small>
              {catalogueCount > 0
                ? `${catalogueCount.toLocaleString("id-ID")} makanan`
                : "Lihat katalog"}
            </small>
          </button>
          <button
            type="button"
            className={`picker-secondary-btn${activeSecondary === "saved" ? " is-active" : ""}`}
            aria-pressed={activeSecondary === "saved"}
            onClick={onToggleSaved}
          >
            <strong>Menu tersimpan</strong>
            <small>{savedCount > 0 ? `${savedCount} menu` : "Belum ada"}</small>
          </button>
          <button
            type="button"
            className={`picker-secondary-btn${activeSecondary === "groups" ? " is-active" : ""}`}
            aria-pressed={activeSecondary === "groups"}
            onClick={onToggleGroups}
          >
            <strong>Grup saya</strong>
            <small>{groupsCount > 0 ? `${groupsCount} grup` : "Buat grup"}</small>
          </button>
        </div>
      </div>
    </section>
  );
}

export default memo(PickerHome);
export type { Tile };
