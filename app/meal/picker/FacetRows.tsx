"use client";

// The refinement rows on the portion sheet: Dimasak · Bagian · Gaya · Bumbu …
//
// One row per question, ALL visible at once. The earlier design asked one
// question per screen; putting them on the sheet next to the live macros saves a
// tap and lets you watch the calories move as you change your mind. Every chip
// shown is guaranteed (by lib/foodTiles) to lead to a real food, so there is no
// state in which a chip is disabled or says "tidak tersedia".
//
// Motion is for orientation, not decoration: a row slides in when a choice makes
// a new question relevant, and the selected chip scrolls itself into view so a
// long row never hides what you picked.

import { useEffect, useRef, useState } from "react";
import { NONE } from "@/lib/foodFamilies";
import { AXIS_LABEL } from "@/lib/foodFacets";
import type { FacetRow } from "@/lib/foodTiles";
import { haptic } from "@/lib/haptics";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";

export type VariantChip = { id: string; label: string; kcal: number };

function Row({
  label,
  children,
  delay,
}: {
  label: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <div className="pk-row-in" style={{ animationDelay: `${delay}ms`, marginBottom: 12 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: ".16em",
          color: "#7c746e",
          margin: "0 0 6px 2px",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Chips({
  items,
  selected,
  onTap,
  ariaLabel,
}: {
  items: { value: string; label: string; sub?: string }[];
  selected: string | null;
  onTap: (value: string) => void;
  ariaLabel: string;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);

  // Bring the selected chip into view whenever it changes — but never for the
  // "Umum" default. Scrolling to it dragged the row to its end and hid the real
  // options (Dada, Paha) off the left edge, which is the opposite of helping.
  useEffect(() => {
    if (selected === NONE) return;
    const el = scroller.current?.querySelector<HTMLElement>('[data-on="1"]');
    el?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div
      ref={scroller}
      role="listbox"
      aria-label={ariaLabel}
      className="mk-rail"
      style={{
        display: "flex",
        gap: 7,
        overflowX: "auto",
        margin: "0 -18px",
        padding: "2px 18px 4px",
        scrollSnapType: "x proximity",
      }}
    >
      {items.map((it, i) => {
        const on = it.value === selected;
        // "Umum" being selected means NO choice was made. It must not light up
        // like one: five fire-coloured "Umum" chips sent the eye to the things
        // that matter least.
        const quiet = on && it.value === NONE;
        return (
          <button
            key={it.value}
            type="button"
            role="option"
            aria-selected={on}
            data-on={on ? "1" : "0"}
            className="pk-chip-in"
            onClick={() => {
              haptic("tap");
              onTap(it.value);
            }}
            style={{
              flexShrink: 0,
              scrollSnapAlign: "center",
              animationDelay: `${Math.min(i, 8) * 28}ms`,
              padding: "10px 15px",
              borderRadius: 13,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: SANS,
              fontWeight: on ? 800 : 600,
              fontSize: 14,
              lineHeight: 1.1,
              color: quiet ? "#cfc8c2" : on ? "#fff" : "#d6cfc9",
              background: quiet ? "rgba(255,255,255,.1)" : on ? FIRE : "rgba(255,255,255,.06)",
              border: quiet
                ? "1px solid rgba(255,255,255,.28)"
                : on
                  ? "1px solid rgba(255,150,120,.65)"
                  : "1px solid rgba(255,255,255,.11)",
              boxShadow:
                on && !quiet
                  ? "inset 0 1.5px 1px rgba(255,225,205,.5), 0 6px 16px rgba(238,60,48,.3)"
                  : "none",
              textShadow: on && !quiet ? "0 1px 2px rgba(120,15,5,.45)" : "none",
              transform: on && !quiet ? "translateY(-1px)" : "none",
              transition: "background .18s, box-shadow .18s, transform .18s, color .18s",
            }}
          >
            {it.label}
            {it.sub ? (
              <span style={{ display: "block", fontFamily: MONO, fontWeight: 400, fontSize: 9.5, marginTop: 3, opacity: 0.72 }}>
                {it.sub}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Rows shown before the disclosure. The questions that actually move calories
 *  are the first two (how it was cooked, which part); the rest refine a name. */
const PRIMARY = 2;

export default function FacetRows({
  rows,
  onPick,
  variants,
  variantId,
  onVariant,
}: {
  rows: FacetRow[];
  onPick: (axis: FacetRow["axis"], value: string) => void;
  /** Distinct foods that survive the current picks, when more than one does. */
  variants?: VariantChip[];
  variantId?: string;
  onVariant?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasVariants = !!variants && variants.length > 1;

  const primary = rows.slice(0, PRIMARY);
  const more = rows.slice(PRIMARY);
  // A real (non-default) choice hiding behind the fold must not be hidden: if
  // the user has refined past the first two rows, show where they are.
  const hiddenChoice = more.some((r) => r.selected && r.selected !== NONE);
  const expanded = open || hiddenChoice;
  const moreNames = [...more.map((r) => AXIS_LABEL[r.axis]), ...(hasVariants ? ["Versi"] : [])];

  if (rows.length === 0 && !hasVariants) return null;

  return (
    <div style={{ margin: "14px 0 4px" }}>
      {primary.map((r, i) => (
        <Row key={r.axis} label={AXIS_LABEL[r.axis]} delay={i * 40}>
          <Chips
            ariaLabel={AXIS_LABEL[r.axis]}
            selected={r.selected}
            onTap={(v) => onPick(r.axis, v)}
            items={r.options.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Row>
      ))}

      {moreNames.length > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            haptic("tap");
            setOpen((v) => !v);
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            marginBottom: expanded ? 10 : 2,
            borderRadius: 12,
            cursor: "pointer",
            background: "rgba(255,255,255,.04)",
            border: "1px dashed rgba(255,255,255,.16)",
            color: "#9a938d",
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: ".1em",
          }}
        >
          <span>{expanded ? "LEBIH RINGKAS" : `LEBIH SPESIFIK · ${moreNames.join(" · ").toUpperCase()}`}</span>
          <span aria-hidden="true" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .22s" }}>
            ▾
          </span>
        </button>
      ) : null}

      {expanded ? (
        <>
          {more.map((r, i) => (
            <Row key={r.axis} label={AXIS_LABEL[r.axis]} delay={i * 40}>
              <Chips
                ariaLabel={AXIS_LABEL[r.axis]}
                selected={r.selected}
                onTap={(v) => onPick(r.axis, v)}
                items={r.options.map((o) => ({ value: o.value, label: o.label }))}
              />
            </Row>
          ))}
          {hasVariants ? (
            <Row label="Versi" delay={more.length * 40}>
              <Chips
                ariaLabel="Versi"
                selected={variantId ?? null}
                onTap={(v) => onVariant?.(v)}
                items={variants!.map((v) => ({ value: v.id, label: v.label, sub: `${Math.round(v.kcal)} kkal` }))}
              />
            </Row>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
