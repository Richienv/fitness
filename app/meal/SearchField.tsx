"use client";
import type { RefObject } from "react";
import Icon from "../ui/Icon";

export default function SearchField({
  value,
  onChange,
  inputRef,
  label = "Cari makanan atau bahan",
  placeholder,
  loading = false,
}: {
  value: string;
  onChange: (s: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  label?: string;
  placeholder?: string;
  loading?: boolean;
}) {
  return (
    <label className="friendly-search">
      <span className="sr-only">{label}</span>
      <Icon name="search" size={18} />
      <input
        aria-label={label}
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `${label}…`}
        aria-busy={loading}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {value && (
        <button
          className="icon-button"
          type="button"
          aria-label="Hapus pencarian"
          onClick={() => {
            onChange("");
            inputRef?.current?.focus({ preventScroll: true });
          }}
        >
          <Icon name="close" size={17} />
        </button>
      )}
    </label>
  );
}
