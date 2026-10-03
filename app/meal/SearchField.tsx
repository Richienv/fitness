"use client";
import { useEffect, useState, type RefObject } from "react";
import Icon from "../ui/Icon";
const examples = ["Nasi putih", "Telur", "Tempe", "Ayam"];
export default function SearchField({
  value,
  onChange,
  inputRef,
  label = "Cari makanan atau bahan",
  loading = false,
}: {
  value: string;
  onChange: (s: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  label?: string;
  loading?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [hint, setHint] = useState("");
  useEffect(() => {
    if (
      focused ||
      value ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setHint("");
      return;
    }
    let word = 0,
      pos = 0,
      deleting = false,
      timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const text = examples[word];
      pos += deleting ? -1 : 1;
      setHint(text.slice(0, pos));
      let delay = deleting ? 55 : 110;
      if (pos === text.length && !deleting) {
        deleting = true;
        delay = 1600;
      }
      if (pos === 0 && deleting) {
        deleting = false;
        word = (word + 1) % examples.length;
        delay = 450;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 700);
    return () => clearTimeout(timer);
  }, [focused, value]);
  return (
    <label className="friendly-search">
      <span className="sr-only">{label}</span>
      <Icon name="search" />
      <input
        aria-label={label}
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={hint ? `Cari ${hint}…` : "Cari makanan atau bahan…"}
        aria-busy={loading}
        autoComplete="off"
      />
      {value && (
        <button
          className="icon-button"
          type="button"
          aria-label="Hapus pencarian"
          onClick={() => {
            onChange("");
            inputRef?.current?.focus();
          }}
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </label>
  );
}
