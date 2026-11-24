"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  EQUIPMENT,
  EQUIPMENT_CATEGORIES,
  searchEquipment,
  type Equipment,
  type EquipmentCategory,
} from "@/lib/equipment";
import { startQuickExercise } from "@/lib/workouts";
import { recordMachinePick, getPickRank } from "@/lib/machinePicks";
import { inferLevel } from "@/lib/difficulty";
import { inferFromLog, getInventory } from "@/lib/gymInventory";
import { getExerciseDemo, youtubeSearchUrl } from "@/lib/exerciseData";
import { todayKey } from "@/lib/targets";
import { useSheetBack } from "@/lib/backSheet";
import { useReducedMotion } from "@/lib/useReducedMotion";
import Icon from "../../ui/Icon";
import { HOWTO_ID } from "./howto-id";
import "../equipment-calm.css";

type Filter = "SEMUA" | EquipmentCategory;

const CATEGORY_ID: Record<EquipmentCategory, string> = {
  MACHINE: "Mesin",
  CABLE: "Kabel",
  BARBELL: "Barbel",
  DUMBBELL: "Dumbel",
  BODYWEIGHT: "Berat badan",
  CARDIO: "Kardio",
};

// The catalogue keeps its muscle names in English capitals; these are the words
// Richie says at the gym.
const MUSCLE_ID: Record<string, string> = {
  CHEST: "Dada",
  "UPPER CHEST": "Dada atas",
  LATS: "Punggung (lat)",
  "MIDDLE BACK": "Punggung tengah",
  "LOWER BACK": "Punggung bawah",
  "FRONT DELT": "Bahu depan",
  "SIDE DELT": "Bahu samping",
  "REAR DELT": "Bahu belakang",
  BICEPS: "Bisep",
  TRICEPS: "Trisep",
  QUADS: "Paha depan",
  GLUTES: "Bokong",
  HAMSTRINGS: "Paha belakang",
  "INNER THIGH": "Paha dalam",
  CALVES: "Betis",
  ABS: "Perut",
  "LOWER ABS": "Perut bawah",
  CARDIO: "Kardio",
};
const SECONDARY_ID: Record<string, string> = {
  triceps: "trisep",
  biceps: "bisep",
  "front delt": "bahu depan",
  "side delt": "bahu samping",
  "rear delt": "bahu belakang",
  lats: "punggung (lat)",
  glutes: "bokong",
  hamstrings: "paha belakang",
  quads: "paha depan",
  traps: "trapezius",
  "external rotators": "rotator luar bahu",
  brachialis: "brakialis",
  adductors: "paha dalam",
  "hip abductors": "paha luar",
  "hip flexors": "fleksor pinggul",
};
const muscleOf = (e: Equipment) => MUSCLE_ID[e.muscleGroup] ?? e.muscleGroup;
const helpersOf = (e: Equipment) =>
  (e.secondary ?? []).map((s) => SECONDARY_ID[s] ?? s);

export default function EquipmentPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("SEMUA");
  const [guide, setGuide] = useState<Equipment | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // Read from this phone's storage after mount, so the first render matches
  // the server's.
  const [ctx, setCtx] = useState<{
    beginner: boolean;
    picked: boolean;
    owned: Record<string, true>;
    rank: Map<string, number>;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const countRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const inv = getInventory();
    setCtx({
      beginner: inferLevel() === "beginner",
      picked: inv.picked,
      owned: inv.owned,
      rank: getPickRank(),
    });
  }, []);

  useSheetBack(!!guide, () => setGuide(null));

  // A new search or category starts at the top of its results, not wherever
  // the old list had been scrolled to.
  useEffect(() => {
    const el = countRef.current;
    if (!el) return;
    const stickyH = (el.previousElementSibling as HTMLElement | null)?.offsetHeight ?? 0;
    const top = el.getBoundingClientRect().top;
    if (top < stickyH) window.scrollTo({ top: window.scrollY + top - stickyH });
  }, [query, filter]);

  // One tap: remember the machine, start (or add to) today's quick session and
  // open the logger on it.
  const logMachine = (e: Equipment) => {
    if (opening) return;
    setOpening(e.id);
    recordMachinePick(e);
    inferFromLog(e.id); // learn what's in your gym, silently
    const { id } = startQuickExercise(e, todayKey());
    router.push(`/workout/session/${id}`);
  };

  const results = useMemo(() => {
    const base =
      filter === "SEMUA" ? EQUIPMENT : EQUIPMENT.filter((e) => e.category === filter);
    return searchEquipment(query, base, ctx?.rank);
  }, [query, filter, ctx]);

  const q = query.trim();
  const count =
    q === ""
      ? filter === "SEMUA"
        ? `${results.length} alat`
        : `${results.length} alat ${CATEGORY_ID[filter].toLowerCase()}`
      : `${results.length} alat cocok dengan “${q}”${
          filter === "SEMUA" ? "" : ` di ${CATEGORY_ID[filter].toLowerCase()}`
        }`;

  return (
    <main className="lt-eq">
      <div className="lt-eq-hero">
        <Link href="/workout" className="lt-eq-back">
          <Icon name="arrow" size={18} />
          Latihan
        </Link>
        <h1>Alat gym</h1>
        <p className="lt-eq-lead">Ketuk Catat untuk langsung mencatat set.</p>
      </div>

      <div className="lt-eq-sticky">
        <div className="lt-eq-search" role="search">
          <Icon name="search" size={20} />
          <input
            ref={searchRef}
            type="search"
            aria-label="Cari alat atau otot"
            placeholder="Cari alat atau otot"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              className="lt-eq-clear"
              aria-label="Hapus pencarian"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        <div className="lt-eq-chips" role="group" aria-label="Kategori alat">
          {(["SEMUA", ...EQUIPMENT_CATEGORIES] as Filter[]).map((c) => (
            <button
              key={c}
              type="button"
              className="lt-eq-chip"
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
            >
              {c === "SEMUA" ? "Semua" : CATEGORY_ID[c]}
            </button>
          ))}
        </div>
      </div>

      <p ref={countRef} className="lt-eq-count" role="status" aria-live="polite">
        <span>{results.length === 0 ? "Tidak ada hasil" : count}</span>
        <Link href="/workout/equipment/setup" className="lt-eq-link">
          Atur alat gym-ku
        </Link>
      </p>

      {results.length === 0 ? (
        <section className="lt-eq-empty" aria-labelledby="lt-eq-none">
          <h2 id="lt-eq-none">
            {q ? `Tidak ada alat untuk “${q}”` : "Tidak ada alat di kategori ini"}
          </h2>
          <p>
            {q
              ? filter === "SEMUA"
                ? "Coba nama otot seperti dada, punggung atau paha, atau nama alatnya dalam bahasa Inggris."
                : `Pencarian ini hanya mencari di ${CATEGORY_ID[filter].toLowerCase()}. Alat lain mungkin ada di kategori lain.`
              : "Pilih kategori lain untuk melihat alatnya."}
          </p>
          {q && filter !== "SEMUA" ? (
            <button type="button" className="lt-eq-btn primary" onClick={() => setFilter("SEMUA")}>
              Cari di semua kategori
            </button>
          ) : q ? (
            <button
              type="button"
              className="lt-eq-btn primary"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              Hapus pencarian
            </button>
          ) : (
            <button type="button" className="lt-eq-btn primary" onClick={() => setFilter("SEMUA")}>
              Tampilkan semua alat
            </button>
          )}
        </section>
      ) : (
        <ul className="lt-eq-list">
          {results.map((e) => {
            const coach = !!ctx?.beginner && e.category === "BARBELL";
            const missing = !!ctx?.picked && !ctx.owned[e.id];
            return (
              <li key={e.id} className="lt-eq-row">
                <div>
                  <span className="lt-eq-name">{e.name}</span>
                  <p className="lt-eq-meta">
                    {muscleOf(e)} · {CATEGORY_ID[e.category]}
                  </p>
                  <p className="lt-eq-cn" lang="zh-Hans">
                    {e.hanzi} · {e.pinyin}
                  </p>
                  {(coach || missing) && (
                    <div className="lt-eq-tags">
                      {coach && <span className="lt-eq-tag">Sebaiknya didampingi</span>}
                      {missing && <span className="lt-eq-tag">Tidak ada di gym-mu</span>}
                    </div>
                  )}
                </div>
                <div className="lt-eq-actions">
                  <button
                    type="button"
                    className="lt-eq-log"
                    aria-label={`Catat ${e.name}`}
                    disabled={opening !== null}
                    onClick={() => logMachine(e)}
                  >
                    {opening === e.id ? (
                      "Membuka…"
                    ) : (
                      <>
                        <Icon name="plus" size={16} />
                        Catat
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="lt-eq-how"
                    aria-label={`Cara pakai ${e.name}`}
                    aria-haspopup="dialog"
                    onClick={() => setGuide(e)}
                  >
                    Cara
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {guide && (
        <EquipmentGuide
          equipment={guide}
          busy={opening !== null}
          onLog={() => logMachine(guide)}
          onClose={() => setGuide(null)}
        />
      )}
    </main>
  );
}

/** "Cara": how to use one machine. Same shell as the exercise guide on Latihan,
 *  with the Bahasa steps from howto-id.ts. */
function EquipmentGuide({
  equipment: e,
  busy,
  onLog,
  onClose,
}: {
  equipment: Equipment;
  busy: boolean;
  onLog: () => void;
  onClose: () => void;
}) {
  const howto = HOWTO_ID[e.id];
  const demo = getExerciseDemo(e.name);
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const helpers = helpersOf(e);
  const hasDemo = !!demo;

  useEffect(() => {
    if (!hasDemo || reduced) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % 2), 900);
    return () => clearInterval(t);
  }, [hasDemo, reduced, e.id]);

  useEffect(() => {
    // Focus goes into the sheet and comes back to "Cara" when it closes.
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);

  // Rendered into <body>, so the sheet is placed against the screen.
  return createPortal(
    <div className="mk-sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="mk-sheet lt-guide lt-eq-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lt-eq-guide-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="lt-eq-guide-title">{e.name}</h2>
        <p>
          {muscleOf(e)} · {CATEGORY_ID[e.category]}
        </p>
        <p className="lt-eq-cn" lang="zh-Hans">
          {e.hanzi} · {e.pinyin}
        </p>
        {demo && !failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="lt-guide-img"
            src={demo.frames[frame]}
            alt={`Contoh gerakan ${e.name}`}
            onError={() => setFailed(true)}
          />
        )}
        {helpers.length > 0 && (
          <dl className="lt-guide-facts">
            <div>
              <dt>Ikut bekerja</dt>
              <dd>{helpers.join(", ")}</dd>
            </div>
          </dl>
        )}
        <h3>Cara pakai</h3>
        {howto ? (
          <ol className="lt-guide-list">
            {howto.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="lt-empty">{e.instructions ?? "Belum ada panduan untuk alat ini."}</p>
        )}
        {howto?.avoid && (
          <>
            <h3>Hindari</h3>
            <p className="lt-guide-list" style={{ paddingLeft: 0 }}>
              {howto.avoid}
            </p>
          </>
        )}
        <button
          type="button"
          className="primary-button mk-sheet-wide"
          disabled={busy}
          onClick={onLog}
        >
          Catat alat ini
        </button>
        <a
          className="secondary-button mk-sheet-wide"
          href={youtubeSearchUrl(e.name)}
          target="_blank"
          rel="noreferrer"
        >
          Tonton video contoh
        </a>
        <button
          type="button"
          className="secondary-button mk-sheet-wide"
          onClick={onClose}
        >
          Tutup
        </button>
      </div>
    </div>,
    document.body,
  );
}
