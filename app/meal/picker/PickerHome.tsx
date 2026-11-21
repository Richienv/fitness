"use client";
import { memo } from "react";
import type { Tile } from "@/lib/foodTiles";
import Icon from "../../ui/Icon";
export type UsualChip = { id: string; name: string; kcal: number };
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
  loading,
  error,
  onRetry,
  onUsual,
  onMore,
  onImport,
  onGroup,
}: {
  mealLabel: string;
  usual: UsualChip[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onUsual: (id: string) => void;
  onMore: () => void;
  onImport: () => void;
  onGroup: () => void;
}) {
  return (
    <section className="picker-home">
      {usual.length > 0 && (
        <div className="usual-foods">
          <h2>Pilihan cepat untuk {mealLabel.toLowerCase()}</h2>
          <div className="usual-rail">
            {usual.map((u) => (
              <button
                className="soft-button"
                key={u.id}
                onClick={() => onUsual(u.id)}
              >
                <strong>{u.name}</strong>
                <small>{Math.round(u.kcal)} kkal</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {usual.length === 0 && (
        <p className="quiet search-first">
          Ketik nama makanan di kolom bawah, misalnya “nasi”, “ayam goreng” atau
          “telur”. Ketuk hasilnya untuk menambah; porsinya bisa diubah setelah
          itu.
        </p>
      )}
      {loading && (
        <p className="quiet" role="status">
          Memuat katalog makanan…
        </p>
      )}
      {error && (
        <div className="status-message" role="status">
          <p>{error}</p>
          <button className="text-button" onClick={onRetry}>
            Coba muat lagi
          </button>
        </div>
      )}
      <details className="library-tools">
        <summary>Pilihan lain</summary>
        <button className="text-button" onClick={onMore}>
          Semua makanan
        </button>
        <button className="text-button" onClick={onImport}>
          Impor makanan
        </button>
        <button className="text-button" onClick={onGroup}>
          Buat grup makanan
        </button>
      </details>
    </section>
  );
}
export default memo(PickerHome);
export type { Tile };
