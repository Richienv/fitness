"use client";
import { useMemo, useRef, useState } from "react";
import { EQUIPMENT, getEquipment, searchEquipment, type Equipment } from "@/lib/equipment";
import { getMachinePicks, getPickRank } from "@/lib/machinePicks";
import type { SessionDef } from "@/lib/workouts";
import { sentenceCase } from "@/lib/trainingLoad";
import { categoryLabel, muscleGroupLabel } from "@/lib/workoutLabels";
import { useSheetBack } from "@/lib/backSheet";
import Icon from "../ui/Icon";
import SheetFrame from "./SheetFrame";

// Body parts as people say them; the machine search knows these words.
const BY_MUSCLE = [
  "Dada",
  "Punggung",
  "Bahu",
  "Lengan",
  "Paha",
  "Betis",
  "Bokong",
  "Perut",
];

/** "Catat bebas": search first, like the food search on Makan. Type a machine
 *  or a body part, tap a result, and the logger opens on it. With nothing
 *  typed, the machines used most are one tap away. */
export default function FreeLogSheet({
  sessions,
  note,
  onLogMachine,
  onPickSession,
  onClose,
}: {
  sessions: SessionDef[];
  /** What happens to the machine you pick, when a session is already running. */
  note: string | null;
  onLogMachine: (e: Equipment) => void;
  onPickSession: (s: SessionDef) => void;
  onClose: () => void;
}) {
  useSheetBack(true, onClose);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const q = query.trim();

  const pickRank = useMemo(() => getPickRank(), []);
  const usual = useMemo(
    () =>
      getMachinePicks()
        .slice(0, 5)
        .map((p) => getEquipment(p.id))
        .filter((e): e is Equipment => !!e),
    [],
  );
  // The search adds a bonus for machines you use even when they do not match
  // the words typed ("xyzzy" returned your favourite machine). Keep its order,
  // but only for machines that match without the bonus.
  const machines = useMemo(() => {
    if (!q) return [];
    const matching = new Set(searchEquipment(q, EQUIPMENT).map((e) => e.id));
    return searchEquipment(q, EQUIPMENT, pickRank).filter((e) => matching.has(e.id));
  }, [q, pickRank]);
  const sessionMatches = useMemo(() => {
    const low = q.toLocaleLowerCase("id-ID");
    if (!low) return [];
    return sessions.filter(
      (s) =>
        s.name.toLocaleLowerCase("id-ID").includes(low) ||
        s.focus.toLocaleLowerCase("id-ID").includes(low) ||
        s.exercises.some((e) => e.name.toLocaleLowerCase("id-ID").includes(low)),
    );
  }, [sessions, q]);

  const machineRow = (e: Equipment) => (
    <li key={e.id}>
      <button type="button" className="lt-sh-row" onClick={() => onLogMachine(e)}>
        <span className="lt-sh-row-main">
          <strong>{e.name}</strong>
          <small>
            {muscleGroupLabel(e.muscleGroup)} · {categoryLabel(e.category)}
          </small>
        </span>
        <span className="lt-sh-act">
          <Icon name="plus" size={18} />
          Catat
        </span>
      </button>
    </li>
  );

  return (
    <SheetFrame
      title="Catat bebas"
      description={note ?? "Ketuk alatnya untuk langsung mulai mencatat."}
      onClose={onClose}
      top={
        <form
          role="search"
          onSubmit={(e) => {
            // Enter closes the keyboard so more results show.
            e.preventDefault();
            input.current?.blur();
          }}
        >
          <label className="lt-sh-search">
            <Icon name="search" />
            <input
              ref={input}
              data-autofocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={'Cari alat, mis. "dada"'}
              aria-label="Cari alat atau gerakan"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="search"
            />
            {query && (
              <button
                type="button"
                className="lt-sh-clear"
                aria-label="Hapus pencarian"
                onClick={() => {
                  setQuery("");
                  input.current?.focus();
                }}
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </label>
        </form>
      }
    >
      <p className="lt-sh-sr" role="status">
        {q ? `${machines.length} alat dan ${sessionMatches.length} sesi cocok.` : ""}
      </p>
      <div>
        {!q && (
          <>
            {usual.length > 0 && (
              <>
                <h3 className="lt-sh-h">Sering dipakai</h3>
                <ul className="lt-sh-list">{usual.map(machineRow)}</ul>
              </>
            )}
            <h3 className="lt-sh-h">Cari per otot</h3>
            <div className="lt-sh-chips">
              {BY_MUSCLE.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="lt-sh-chip"
                  onClick={() => {
                    setQuery(m.toLocaleLowerCase("id-ID"));
                    input.current?.focus();
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            {usual.length === 0 && (
              <p className="lt-sh-hint">
                Alat yang pernah kamu catat akan muncul di sini, jadi lain kali
                cukup satu ketukan.
              </p>
            )}
          </>
        )}

        {q && machines.length > 0 && (
          <>
            <h3 className="lt-sh-h">
              Alat <small>{machines.length} hasil</small>
            </h3>
            <ul className="lt-sh-list">{machines.map(machineRow)}</ul>
          </>
        )}

        {q && sessionMatches.length > 0 && (
          <>
            <h3 className="lt-sh-h">Atau mulai satu sesi</h3>
            <ul className="lt-sh-list">
              {sessionMatches.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="lt-sh-row"
                    onClick={() => onPickSession(s)}
                  >
                    <span className="lt-sh-row-main">
                      <strong>{sentenceCase(s.name)}</strong>
                      <small>
                        {s.exercises.length} latihan · {sentenceCase(s.focus)}
                      </small>
                    </span>
                    <span className="lt-sh-act">Mulai</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {q && machines.length === 0 && sessionMatches.length === 0 && (
          <p className="lt-sh-empty">
            Tidak ada alat untuk &ldquo;{q}&rdquo;. Coba kata lain, misalnya
            dada, paha, bahu atau curl.
          </p>
        )}
      </div>
    </SheetFrame>
  );
}
