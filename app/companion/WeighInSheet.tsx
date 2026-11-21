"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_KG,
  MIN_KG,
  formatKg,
  jumpFromPrevious,
  parseWeightInput,
  relativeDay,
  sanitizeWeightInput,
  stepWeight,
  type WeighIn,
} from "@/lib/weighIn";
import FriendlySheet from "../meal/FriendlySheet";
import Icon from "../ui/Icon";

/**
 * The morning weigh-in, one tap from Home: one weight field prefilled with
 * the last weight, −0,1 / +0,1 for the usual small change, and Simpan.
 * Saving and the celebration live with the caller (HomePage).
 */
export default function WeighInSheet({
  today,
  todayKg,
  previous,
  onSave,
  onClose,
}: {
  today: string;
  /** Today's stored weight, when today is already logged. */
  todayKg: number | null;
  /** The last weigh-in before today. */
  previous: WeighIn | null;
  onSave: (kg: number) => void;
  onClose: () => void;
}) {
  const start = todayKg ?? previous?.kg ?? null;
  const [text, setText] = useState(start !== null ? formatKg(start) : "");
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const kg = parseWeightInput(text);
  const invalid = tried && kg === null;
  const jump = kg !== null ? jumpFromPrevious(kg, previous) : null;

  // The sheet focuses itself first (FriendlySheet); then the field takes
  // focus with its value selected, so typing replaces the prefilled weight.
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (kg === null) {
      setTried(true);
      input.current?.focus();
      return;
    }
    onSave(kg);
  };
  const step = (delta: number) => {
    setText((t) => stepWeight(t || (start !== null ? formatKg(start) : ""), delta));
    setTried(false);
  };

  return (
    <FriendlySheet
      title="Berat hari ini"
      onClose={onClose}
      className="wi-sheet"
      footer={
        <div className="wi-footer">
          <button type="submit" form="wi-form" className="primary-button">
            {todayKg !== null ? "Simpan perubahan" : "Simpan"}
          </button>
          <Link href="/dashboard/progress" className="wi-more">
            Pinggang dan ukuran lain
          </Link>
        </div>
      }
    >
      <form id="wi-form" className="wi-form" onSubmit={submit} noValidate>
        <label htmlFor="weigh-kg">Berat badan</label>
        <div className="wi-field">
          <button
            type="button"
            className="wi-step"
            aria-label="Kurangi 0,1 kg"
            onClick={() => step(-0.1)}
            disabled={kg !== null && kg <= MIN_KG}
          >
            <Icon name="minus" size={22} />
          </button>
          <div className={`wi-input${invalid ? " invalid" : ""}`}>
            <input
              ref={input}
              id="weigh-kg"
              name="weight"
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              placeholder="72,4"
              value={text}
              aria-invalid={invalid}
              aria-describedby="wi-help"
              onChange={(e) => {
                setText(sanitizeWeightInput(e.target.value));
                setTried(false);
              }}
            />
            <span aria-hidden="true">kg</span>
          </div>
          <button
            type="button"
            className="wi-step"
            aria-label="Tambah 0,1 kg"
            onClick={() => step(0.1)}
            disabled={kg !== null && kg >= MAX_KG}
          >
            <Icon name="plus" size={22} />
          </button>
        </div>
        <p
          id="wi-help"
          className={`wi-help${invalid ? " invalid" : ""}`}
          aria-live="polite"
        >
          {invalid
            ? `Isi berat antara ${MIN_KG} dan ${MAX_KG} kg, misalnya 72,4.`
            : todayKg !== null
              ? `Sudah tercatat hari ini: ${formatKg(todayKg)} kg. Simpan untuk menggantinya.`
              : previous
                ? `Terakhir ${formatKg(previous.kg)} kg, ${relativeDay(previous.date, today)}.`
                : "Timbang setelah bangun tidur, sebelum makan dan minum."}
        </p>
        {jump !== null && !invalid && (
          <p className="wi-jump">
            Beda {formatKg(jump)} kg dari timbangan terakhir. Pastikan angkanya
            benar.
          </p>
        )}
      </form>
    </FriendlySheet>
  );
}
