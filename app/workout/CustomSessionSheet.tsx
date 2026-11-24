"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { EQUIPMENT } from "@/lib/equipment";
import { needsCoach, inferLevel } from "@/lib/difficulty";
import { SESSIONS, exerciseDefFromEquipment, type CustomTemplate, type ExerciseDef } from "@/lib/workouts";
import { useSheetBack } from "@/lib/backSheet";
import { BAR_GROUPS, type MuscleBarGroup } from "@/lib/trainingLoad";
import { MUSCLE_KEY_ID } from "@/lib/workoutLabels";
import {
  NAME_MAX,
  autoSessionName,
  bumpIncrement,
  bumpReps,
  bumpRest,
  bumpSets,
  cloneDef,
  entriesForGroups,
  kgLabel,
  nbsp,
  restLabel,
  saveProblem,
  searchCatalog,
  summaryLine,
  toTemplate,
  totalSets,
  type CatalogEntry,
} from "@/lib/sessionDraft";
import Icon from "../ui/Icon";
import SheetFrame from "./SheetFrame";

const SUGGESTIONS_SHOWN = 8;
const RESULTS_SHOWN = 12;

/** Every exercise the programs and the machine catalogue know, once by name.
 *  A program's exercise keeps that program's sets, reps, weight step and rest;
 *  a machine starts at 3 x 10. Cardio machines are left to "Catat aktivitas"
 *  (minutes, with a calorie estimate). */
function buildCatalog(): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  for (const s of SESSIONS) {
    for (const e of s.exercises) {
      const muscle = e.primary[0];
      const key = e.name.toLowerCase();
      if (!muscle || seen.has(key)) continue;
      seen.set(key, { key, name: e.name, muscle, def: cloneDef(e), coach: needsCoach(e.name) });
    }
  }
  for (const eq of EQUIPMENT) {
    const key = eq.name.toLowerCase();
    if (eq.category === "CARDIO" || seen.has(key)) continue;
    const def = exerciseDefFromEquipment(eq);
    seen.set(key, {
      key,
      name: eq.name,
      muscle: def.primary[0],
      def,
      coach: needsCoach(eq.name) || needsCoach(eq.id),
    });
  }
  return Array.from(seen.values());
}

function Stepper({
  label,
  exercise,
  value,
  atMin,
  atMax,
  onStep,
}: {
  label: string;
  exercise: string;
  value: string;
  atMin: boolean;
  atMax: boolean;
  onStep: (dir: 1 | -1) => void;
}) {
  return (
    <div className="lt-sh-step" role="group" aria-label={`${label}, ${exercise}`}>
      <span>{label}</span>
      <span className="lt-sh-stepper">
        <button
          type="button"
          aria-label={`Kurangi ${label.toLocaleLowerCase("id-ID")}`}
          disabled={atMin}
          onClick={() => onStep(-1)}
        >
          <Icon name="minus" size={18} />
        </button>
        <output>{value}</output>
        <button
          type="button"
          aria-label={`Tambah ${label.toLocaleLowerCase("id-ID")}`}
          disabled={atMax}
          onClick={() => onStep(1)}
        >
          <Icon name="plus" size={18} />
        </button>
      </span>
    </div>
  );
}

/** "Buat sesi sendiri": pick muscles, add exercises from the catalogue, tune
 *  each one only if its defaults are wrong, then save and start in one tap. */
export default function CustomSessionSheet({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (t: Omit<CustomTemplate, "id" | "createdAt">) => void;
}) {
  const [selected, setSelected] = useState<MuscleBarGroup[]>([]);
  const [drafts, setDrafts] = useState<ExerciseDef[]>([]);
  const [query, setQuery] = useState("");
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [announce, setAnnounce] = useState("");
  const keepRef = useRef<HTMLButtonElement>(null);

  const catalog = useMemo(buildCatalog, []);
  const beginner = useMemo(() => inferLevel() === "beginner", []);
  const taken = useMemo(() => new Set(drafts.map((d) => d.name.toLowerCase())), [drafts]);

  const q = query.trim();
  const suggestions = useMemo(
    () => entriesForGroups(catalog, selected, taken, beginner),
    [catalog, selected, taken, beginner],
  );
  const results = useMemo(
    () => searchCatalog(catalog, q, taken, beginner),
    [catalog, q, taken, beginner],
  );
  const shown = q
    ? results.slice(0, RESULTS_SHOWN)
    : showAll
      ? suggestions
      : suggestions.slice(0, SUGGESTIONS_SHOWN);
  const hiddenCount = q ? 0 : suggestions.length - shown.length;

  const dirty = drafts.length > 0;
  const autoName = autoSessionName(drafts, selected);
  const problem = saveProblem(drafts);

  // Closing asks first when there is work in the sheet. Escape, the x, the
  // phone's back button and Batal all come through here; a stray tap on the
  // backdrop does nothing then (backdropCloses).
  function requestClose() {
    if (confirming) setConfirming(false);
    else if (dirty) setConfirming(true);
    else onClose();
  }
  useSheetBack(true, () => {
    if (confirming) {
      setConfirming(false);
      return true;
    }
    if (dirty) {
      setConfirming(true);
      return true;
    }
    onClose();
  });
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (openIdx !== null) {
      document.getElementById(`lt-sh-ex-${openIdx}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [openIdx]);

  function toggleGroup(g: MuscleBarGroup) {
    setShowAll(false);
    setSelected((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g]));
  }
  function add(entry: CatalogEntry) {
    setDrafts((list) => [...list, cloneDef(entry.def)]);
    setAnnounce(`${entry.name} ditambahkan. ${drafts.length + 1} gerakan di sesi.`);
  }
  function remove(i: number) {
    const name = drafts[i]?.name;
    setDrafts((list) => list.filter((_, idx) => idx !== i));
    setOpenIdx((cur) => (cur === null ? null : cur === i ? null : cur > i ? cur - 1 : cur));
    if (name) setAnnounce(`${name} dihapus dari sesi.`);
  }
  function step(i: number, bump: (d: ExerciseDef, dir: 1 | -1) => ExerciseDef, dir: 1 | -1) {
    setDrafts((list) => list.map((d, idx) => (idx === i ? bump(d, dir) : d)));
  }

  return (
    <SheetFrame
      title="Buat sesi sendiri"
      onClose={requestClose}
      backdropCloses={!dirty}
      footer={
        confirming ? (
          <>
            <p className="lt-sh-foot-text" role="alert">
              Buang sesi ini? <strong>{drafts.length} gerakan</strong> yang sudah
              dipilih akan hilang.
            </p>
            <div className="lt-sh-actions">
              <button
                ref={keepRef}
                type="button"
                className="lt-sh-secondary"
                onClick={() => setConfirming(false)}
              >
                Kembali
              </button>
              <button type="button" className="lt-sh-danger" onClick={onClose}>
                Buang sesi
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="lt-sh-foot-text" id="lt-sh-save-hint" role="status">
              {problem ?? (
                <>
                  <strong>{drafts.length} gerakan</strong> · {totalSets(drafts)} set
                </>
              )}
            </p>
            <button
              type="button"
              className="lt-sh-primary"
              disabled={!!problem}
              aria-describedby="lt-sh-save-hint"
              onClick={() => onSave(toTemplate(drafts, selected, nameOverride))}
            >
              Simpan dan mulai
            </button>
          </>
        )
      }
    >
      <p className="lt-sh-sr" role="status">
        {announce}
      </p>

      <h3 className="lt-sh-h">
        1. Pilih otot <small>boleh lebih dari satu</small>
      </h3>
      <div className="lt-sh-chips" role="group" aria-label="Otot yang dilatih">
        {BAR_GROUPS.map((g) => {
          const on = selected.includes(g.key);
          return (
            <button
              key={g.key}
              type="button"
              className="lt-sh-chip"
              aria-pressed={on}
              onClick={() => toggleGroup(g.key)}
            >
              {on && <Icon name="check" size={16} />}
              {g.label}
            </button>
          );
        })}
      </div>

      <h3 className="lt-sh-h">2. Tambah gerakan</h3>
      <label className="lt-sh-search">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari gerakan atau alat"
          aria-label="Cari gerakan atau alat"
          autoComplete="off"
          autoCorrect="off"
        />
        {query && (
          <button
            type="button"
            className="lt-sh-clear"
            aria-label="Hapus pencarian"
            onClick={() => setQuery("")}
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </label>

      {shown.length > 0 && (
        <ul className="lt-sh-list" aria-label={q ? "Hasil pencarian" : "Saran gerakan"}>
          {shown.map((e) => (
            <li key={e.key}>
              <button
                type="button"
                className="lt-sh-row"
                aria-label={`Tambah ${e.name} ke sesi${beginner && e.coach ? ", perlu coach" : ""}`}
                onClick={() => add(e)}
              >
                <span className="lt-sh-row-main">
                  <strong>{e.name}</strong>
                  <small>
                    {MUSCLE_KEY_ID[e.muscle]}
                    {beginner && e.coach && <span className="lt-sh-tag">Perlu coach</span>}
                  </small>
                </span>
                <span className="lt-sh-act">
                  <Icon name="plus" size={18} />
                  Tambah
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 && (
        <button type="button" className="lt-sh-more" aria-expanded="false" onClick={() => setShowAll(true)}>
          Lihat {hiddenCount} lagi
        </button>
      )}
      {showAll && !q && suggestions.length > SUGGESTIONS_SHOWN && (
        <button type="button" className="lt-sh-more" aria-expanded="true" onClick={() => setShowAll(false)}>
          Lihat lebih sedikit
        </button>
      )}
      {shown.length === 0 && q && (
        <p className="lt-sh-empty">
          Tidak ada gerakan untuk &ldquo;{q}&rdquo;. Coba dada, bisep, paha atau nama
          alatnya.
        </p>
      )}
      {shown.length === 0 && !q && selected.length === 0 && (
        <p className="lt-sh-hint">
          Pilih otot di atas atau cari gerakan, lalu ketuk gerakan untuk menambah.
        </p>
      )}
      {shown.length === 0 && !q && selected.length > 0 && (
        <p className="lt-sh-empty">
          Semua gerakan untuk otot ini sudah ditambahkan. Cari gerakan lain di kolom
          pencarian.
        </p>
      )}

      <h3 className="lt-sh-h">
        3. Sesi kamu{" "}
        {drafts.length > 0 && (
          <small>
            {drafts.length} gerakan · {totalSets(drafts)} set
          </small>
        )}
      </h3>
      {drafts.length === 0 ? (
        <p className="lt-sh-empty">Belum ada gerakan. Ketuk gerakan di atas untuk menambah.</p>
      ) : (
        <ul className="lt-sh-exlist">
          {drafts.map((d, i) => {
            const open = openIdx === i;
            const sets = (dir: 1 | -1) => bumpSets(d, dir) === d;
            const reps = (dir: 1 | -1) => bumpReps(d, dir) === d;
            const inc = (dir: 1 | -1) => bumpIncrement(d, dir) === d;
            const rest = (dir: 1 | -1) => bumpRest(d, dir) === d;
            return (
              <li key={d.name} id={`lt-sh-ex-${i}`} className="lt-sh-ex">
                <div className="lt-sh-ex-head">
                  <button
                    type="button"
                    className="lt-sh-ex-main"
                    aria-expanded={open}
                    aria-controls={`lt-sh-ed-${i}`}
                    onClick={() => setOpenIdx(open ? null : i)}
                  >
                    <span className="lt-sh-row-main">
                      <strong>{d.name}</strong>
                      <small>
                        {d.primary[0] ? `${MUSCLE_KEY_ID[d.primary[0]]} · ` : ""}
                        {nbsp(summaryLine(d))}
                      </small>
                    </span>
                    <span className="lt-sh-act">
                      {open ? "Selesai" : "Atur"}
                      <span className="lt-sh-chev" data-open={open}>
                        <Icon name="chevron" size={18} />
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="lt-sh-ex-remove"
                    aria-label={`Hapus ${d.name} dari sesi`}
                    onClick={() => remove(i)}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
                {open && (
                  <div className="lt-sh-edit" id={`lt-sh-ed-${i}`}>
                    <Stepper
                      label="Jumlah set"
                      exercise={d.name}
                      value={String(d.sets)}
                      atMin={sets(-1)}
                      atMax={sets(1)}
                      onStep={(dir) => step(i, bumpSets, dir)}
                    />
                    <Stepper
                      label="Repetisi"
                      exercise={d.name}
                      value={d.repsLabel}
                      atMin={reps(-1)}
                      atMax={reps(1)}
                      onStep={(dir) => step(i, bumpReps, dir)}
                    />
                    <Stepper
                      label="Langkah beban"
                      exercise={d.name}
                      value={nbsp(kgLabel(d.increment))}
                      atMin={inc(-1)}
                      atMax={inc(1)}
                      onStep={(dir) => step(i, bumpIncrement, dir)}
                    />
                    <Stepper
                      label="Istirahat"
                      exercise={d.name}
                      value={nbsp(restLabel(d.restSec))}
                      atMin={rest(-1)}
                      atMax={rest(1)}
                      onStep={(dir) => step(i, bumpRest, dir)}
                    />
                    <p className="lt-sh-hint">
                      Langkah beban: seberapa banyak beban naik tiap kamu menekan
                      + di pencatat.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {drafts.length > 0 && (
        <label className="lt-sh-field">
          Nama sesi
          <input
            type="text"
            value={nameOverride ?? autoName}
            placeholder={autoName}
            maxLength={NAME_MAX}
            onChange={(e) => setNameOverride(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </SheetFrame>
  );
}
