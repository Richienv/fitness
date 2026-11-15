"use client";
import type { RefObject } from "react";
import Icon from "../ui/Icon";
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
        placeholder={`${label}…`}
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
