"use client";
// The small pieces of the set logger: a number stepper and the sheets it opens
// (edit a set, swap the exercise, add one, finish early). Calm style, shared
// classes with SessionLogger (logger.css) and the Makan sheets (calm.css).
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EQUIPMENT, searchEquipment, type Equipment } from "@/lib/equipment";
import { getAlternatives, getExerciseDemo } from "@/lib/exerciseData";
import { getPickRank } from "@/lib/machinePicks";
import { categoryLabel, muscleGroupLabel } from "@/lib/workoutLabels";
import Icon from "../../../ui/Icon";

export const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const parseNum = (t: string) => {
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return t.trim() !== "" && Number.isFinite(n) && n >= 0 && n < 10000 ? n : null;
};

/** A number you can step with − / + or type into. Typing "62," is allowed
 *  mid-way; the value is only pushed up when the text is a valid number. */
export function Stepper({
  label,
  value,
  step,
  unit,
  decimal,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  unit?: string;
  decimal?: boolean;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(fmtNum(value));
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setText(fmtNum(value));
  }, [value]);
  const bump = (dir: 1 | -1) => {
    typing.current = false;
    const next = Math.max(0, Math.round((value + dir * step) * 10) / 10);
    setText(fmtNum(next));
    onChange(next);
  };
  return (
    <div className="lg-stepper">
      <span>{label}</span>
      <div className="lg-stepper-row">
        <button type="button" aria-label={`Kurangi ${label}`} onClick={() => bump(-1)}>
          <Icon name="minus" size={20} />
        </button>
        <input
          inputMode={decimal ? "decimal" : "numeric"}
          aria-label={unit ? `${label}, ${unit}` : label}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            typing.current = true;
            const t = e.target.value.replace(/[^\d.,]/g, "");
            setText(t);
            const n = parseNum(t);
            if (n !== null) onChange(n);
          }}
          onBlur={() => {
            typing.current = false;
            setText(fmtNum(value));
          }}
        />
        <button type="button" aria-label={`Tambah ${label}`} onClick={() => bump(1)}>
          <Icon name="plus" size={20} />
        </button>
      </div>
    </div>
  );
}

/** A bottom sheet in <body>: the page wrapper animates a transform, which would
 *  otherwise trap position:fixed. Escape closes; Tab stays inside. */
function Sheet({
  title,
  intro,
  onClose,
  children,
}: {
  title: string;
  intro?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const stable = useCallback(() => close.current(), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [...el.querySelectorAll<HTMLElement>("button:not([disabled]), input, a[href]")];
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0])?.focus({
      preventScroll: true,
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        stable();
      } else if (e.key === "Tab") {
        const f = focusable();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [stable]);
  return createPortal(
    <div className="mk-sheet-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="mk-sheet lg-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={id}>{title}</h2>
        {intro && <p>{intro}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Change or remove one logged set. */
export function SetEditSheet({
  exerciseName,
  setNumber,
  weight,
  reps,
  increment,
  onSave,
  onDelete,
  onClose,
}: {
  exerciseName: string;
  setNumber: number;
  weight: number;
  reps: number;
  increment: number;
  onSave: (weight: number, reps: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [w, setW] = useState(weight);
  const [r, setR] = useState(reps);
  return (
    <Sheet title={`Ubah set ${setNumber}`} intro={exerciseName} onClose={onClose}>
      <div className="lg-edit-steppers">
        <Stepper label="Beban (kg)" value={w} step={increment || 1} unit="kg" decimal onChange={setW} />
        <Stepper label="Reps" value={r} step={1} onChange={setR} />
      </div>
      <div className="mk-dlg-actions">
        <button type="button" className="secondary-button" onClick={onDelete}>
          Hapus set
        </button>
        <button
          type="button"
          className="primary-button"
          data-autofocus
          disabled={r <= 0}
          onClick={() => onSave(w, r)}
        >
          Simpan
        </button>
      </div>
      {r <= 0 && <p className="lg-warn">Isi jumlah reps lebih dari 0 untuk menyimpan.</p>}
    </Sheet>
  );
}

/** A demo picture that simply isn't there when it can't load (offline, blocked). */
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="lg-thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** Machine taken? Pick a stand-in that trains the same muscle. */
export function SwapSheet({
  canonicalName,
  currentName,
  onPick,
  onAddOther,
  onClose,
}: {
  canonicalName: string;
  currentName: string;
  onPick: (name: string) => void;
  onAddOther: () => void;
  onClose: () => void;
}) {
  const alts = getAlternatives(canonicalName).filter((a) => a.name !== currentName);
  return (
    <Sheet
      title={`Ganti ${currentName}`}
      intro="Alatnya dipakai orang? Pilih pengganti yang melatih otot yang sama."
      onClose={onClose}
    >
      {alts.length === 0 ? (
        <p className="lg-empty">Belum ada pengganti yang kami kenal untuk gerakan ini.</p>
      ) : (
        <ul className="lg-alts">
          {alts.map((a, i) => {
            const img = getExerciseDemo(a.name)?.frames[0];
            return (
              <li key={a.name}>
                {img && <Thumb src={img} />}
                <span className="lg-alt-text">
                  <strong>{a.name}</strong>
                  <small>
                    {a.reason}. {a.equipment}
                  </small>
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  data-autofocus={i === 0 ? "" : undefined}
                  aria-label={`Pakai ${a.name}`}
                  onClick={() => onPick(a.name)}
                >
                  Pakai
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="secondary-button mk-sheet-wide" onClick={onAddOther}>
        <Icon name="plus" size={18} />
        Tambah latihan lain (tanpa mengganti)
      </button>
    </Sheet>
  );
}

/** Add one more exercise to the session: search first, one tap adds. */
export function AddSheet({
  onAdd,
  onClose,
}: {
  onAdd: (e: Equipment) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const rank = useMemo(() => getPickRank(), []);
  const results = useMemo(() => {
    if (q) return searchEquipment(query, EQUIPMENT, rank).slice(0, 12);
    // Nothing typed yet: the machines he uses most, so the common case is one tap.
    return EQUIPMENT.filter((e) => rank.has(e.id))
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
      .slice(0, 6);
  }, [q, query, rank]);
  return (
    <Sheet title="Tambah latihan" onClose={onClose}>
      <label className="lg-search">
        <Icon name="search" size={18} />
        <input
          data-autofocus
          type="search"
          inputMode="search"
          aria-label="Cari alat atau otot"
          placeholder="Cari alat atau otot, mis. dada"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="lg-hint" aria-live="polite">
        {q
          ? results.length
            ? `${results.length} hasil. Ketuk Tambah untuk memasukkan ke sesi.`
            : "Tidak ada yang cocok."
          : results.length
            ? "Sering kamu pakai"
            : "Ketik nama alat atau otot untuk mencari."}
      </p>
      {results.length > 0 && (
        <ul className="lg-results">
          {results.map((e) => (
            <li key={e.id}>
              <span className="lg-alt-text">
                <strong>{e.name}</strong>
                <small>
                  {muscleGroupLabel(e.muscleGroup)} · {categoryLabel(e.category)}
                </small>
              </span>
              <button
                type="button"
                className="primary-button"
                aria-label={`Tambah ${e.name}`}
                onClick={() => onAdd(e)}
              >
                Tambah
              </button>
            </li>
          ))}
        </ul>
      )}
      {q && results.length === 0 && (
        <p className="lg-empty">Coba kata lain, misalnya &quot;dada&quot;, &quot;kabel&quot; atau &quot;paha&quot;.</p>
      )}
    </Sheet>
  );
}

/** Ending with nothing logged, or before every set is done. */
export function FinishSheet({
  kind,
  done,
  total,
  onFinish,
  onContinue,
  onLeave,
}: {
  kind: "empty" | "early";
  done: number;
  total: number;
  onFinish: () => void;
  onContinue: () => void;
  onLeave: () => void;
}) {
  return (
    <Sheet
      title={kind === "empty" ? "Belum ada set tercatat" : "Akhiri latihan sekarang?"}
      intro={
        kind === "empty"
          ? "Catat minimal satu set supaya sesi ini masuk ke riwayat dan hitungan kalori."
          : `Baru ${done} dari ${total} set. Set yang belum dikerjakan tidak dihitung.`
      }
      onClose={onContinue}
    >
      <button
        type="button"
        className="primary-button mk-sheet-wide"
        data-autofocus
        onClick={onContinue}
      >
        Lanjut latihan
      </button>
      {kind === "early" ? (
        <button type="button" className="secondary-button mk-sheet-wide" onClick={onFinish}>
          Selesai dan lihat ringkasan
        </button>
      ) : (
        <>
          <button type="button" className="secondary-button mk-sheet-wide" onClick={onLeave}>
            Keluar dulu
          </button>
          <p className="lg-hint">Sesi tetap terbuka. Lanjutkan dari halaman Latihan.</p>
        </>
      )}
    </Sheet>
  );
}
