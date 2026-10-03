"use client";
import { memo, useState } from "react";
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
  tiles,
  loading,
  error,
  onRetry,
  onTile,
  onUsual,
  onMore,
  onImport,
  onGroup,
}: {
  mealLabel: string;
  usual: UsualChip[];
  tiles: TileView[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onTile: (id: string) => void;
  onUsual: (id: string) => void;
  onMore: () => void;
  onImport: () => void;
  onGroup: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
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
      <h2>Pilih jenis makanan</h2>
      <p className="quiet">Atur cara masak dan porsi setelah memilih.</p>
      <div className="food-category-grid">
        {(expanded ? tiles : tiles.slice(0, 6)).map((t, i) => (
          <button
            className={`food-category category-${i % 4}`}
            key={t.id}
            onClick={() => onTile(t.id)}
            aria-label={`${t.label}, ${t.hint}`}
          >
            <Icon
              name={
                ["sayur", "buah", "tahu", "kacang"].some((v) =>
                  t.id.includes(v),
                )
                  ? "leaf"
                  : "meal"
              }
            />
            <strong>{t.label}</strong>
            <small>{t.hint}</small>
          </button>
        ))}
      </div>
      {tiles.length > 6 && (
        <button
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Ringkas kategori" : "Lihat kategori lainnya"}
        </button>
      )}
      {loading && (
        <p className="quiet" role="status">
          Memuat katalog makanan…
        </p>
      )}
      {error && (
        <div className="status-message" role="status">
          <p>{error}</p>
          <p>Kategori dasar tetap tersedia.</p>
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
