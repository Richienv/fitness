"use client";

// The one portion sheet. Every way of adding a food ends here: the + on a row, a
// search hit, a tray item you tap to edit, and the end of the family picker.
//
// It replaces a sheet that was a number box, a notched slider and a wheel of
// add-ons. Everything that sheet did is still here — grams you can type or drag,
// household-portion stops, the TAMBAHAN add-ons — but the numbers are now shown
// where you can read them against your day: the plate puts this portion's
// protein, carbs and fat next to what is LEFT of each today, and goes red the
// moment this serving would take you over.
//
// Presentational on purpose: no storage, no add-path logic. FoodBuilder owns
// what "add" means; this owns how it looks while you decide.

import { useEffect, useRef, type ReactNode } from "react";
import { useSheetBack } from "@/lib/backSheet";
import Plate3D from "./Plate3D";
import PortionSlider from "./PortionSlider";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";

export type PortionSheetProps = {
  name: string;
  /** Per 100 g — the one unit every portion is priced from. */
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  /** Flat add-on deltas (TAMBAHAN), already summed. Applied once, not scaled. */
  delta?: { kcal: number; p: number; c: number; f: number };
  grams: number;
  onGrams: (g: number) => void;
  /** Grams in "1 <unit>" — where the portion stops sit. */
  portionG: number;
  /** "potong", "porsi", "butir" … */
  unit: string;
  /** What is left of today's budget (grams of each macro), not counting this item. */
  remaining?: { protein: number; carbs: number; fat: number };
  tint?: string;
  /** The add-ons wheel, owned by the caller. */
  addons?: ReactNode;
  /** Refinement rows (Dimasak · Bagian …), shown above the plate. Present only
   *  when the sheet was opened from a family tile. */
  top?: ReactNode;
  /** True when the row's numbers are an estimate rather than a lab value. */
  estimated?: boolean;
  /** No real gram weight: portion by count of units and never show invented grams. */
  unitsOnly?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function PortionSheet({
  name,
  per100,
  delta,
  grams,
  onGrams,
  portionG,
  unit,
  remaining,
  tint,
  addons,
  top,
  estimated,
  unitsOnly,
  onCancel,
  onConfirm,
}: PortionSheetProps) {
  // Hardware/browser back closes the sheet instead of leaving the page.
  useSheetBack(true, onCancel);

  const k = grams / 100;
  const d = delta ?? { kcal: 0, p: 0, c: 0, f: 0 };
  const kcal = Math.max(0, per100.kcal * k + d.kcal);
  const protein = Math.max(0, per100.protein * k + d.p);
  const carbs = Math.max(0, per100.carbs * k + d.c);
  const fat = Math.max(0, per100.fat * k + d.f);

  // Never animate through calorie values that disagree with confirmation.
  const shownKcal = Math.round(kcal);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        background: "rgba(5,4,6,.74)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "dlgBackdropIn .26s var(--ease-out) both",
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={`Atur porsi ${name}`}
        className="picker-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
          if (e.key !== "Tab") return;
          const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), summary, [tabindex='0']") ?? [])
            .filter((el) => el.getClientRects().length > 0);
          const first = nodes[0]; const last = nodes[nodes.length - 1];
          if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "92dvh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "24px 24px 0 0",
          padding: "8px 0 0",
          background: "radial-gradient(700px 360px at 50% -8%, #1b1211, #0b0809 62%)",
          border: "1px solid rgba(255,255,255,.08)",
          borderBottom: "none",
          animation: "sheetCardIn .4s cubic-bezier(.16,1,.3,1) both",
        }}
      >
        <div style={{ display: "grid", placeItems: "center", padding: "2px 0 8px", flexShrink: 0 }}>
          <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(255,255,255,.22)" }} />
        </div>

        {/* The middle scrolls; the footer does not. With every refinement row open
            the plate and slider can run past the fold, and a TAMBAH button that
            scrolls away with them is a button you have to hunt for. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px 6px", WebkitOverflowScrolling: "touch" }}>

        {/* name + the number that matters most */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 19,
                letterSpacing: "-.02em",
                lineHeight: 1.15,
                color: "#fff",
              }}
            >
              {name}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#8a837d", marginTop: 5 }}>
              Protein {Math.round(protein)} g · Karbo {Math.round(carbs)} g · Lemak {Math.round(fat)} g
              {estimated ? <span style={{ color: "#b88a5a" }}> · ESTIMASI</span> : null}
            </div>
          </div>
          <div style={{ flex: "none", textAlign: "right" }}>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 32,
                lineHeight: 1,
                letterSpacing: "-.03em",
                color: "#ffe9d6",
              }}
            >
              {shownKcal}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".12em", color: "#8a837d", marginTop: 3 }}>
              KKAL
            </div>
          </div>
        </div>

        {top}

        <PortionSlider grams={grams} onChange={onGrams} portionG={portionG} unit={unit} unitsOnly={unitsOnly} />

        <details className="picker-details">
        <summary>Bandingkan dengan sisa makro hari ini</summary>
        <Plate3D
          grams={grams}
          macros={{ protein, carbs, fat }}
          remaining={remaining}
          tint={tint}
          height={228}
          nominal={unitsOnly}
        />
        </details>

        {addons ? (
          <details className="picker-details">
            <summary>Tambahan</summary>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: ".16em",
                color: "#6a6660",
                margin: "16px 0 8px 2px",
              }}
            >
            </div>
            {addons}
          </details>
        ) : null}

        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            gap: 9,
            padding: "12px 18px calc(16px + env(safe-area-inset-bottom))",
            borderTop: "1px solid rgba(255,255,255,.07)",
            background: "linear-gradient(180deg, rgba(11,8,9,.0), rgba(11,8,9,.96) 30%)",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: "none",
              width: 92,
              padding: "15px 0",
              borderRadius: 15,
              border: "1px solid rgba(255,255,255,.1)",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".1em",
              color: "#8a837d",
              background: "rgba(255,255,255,.04)",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!Number.isFinite(grams) || grams <= 0}
            style={{
              flex: 1,
              padding: 15,
              borderRadius: 15,
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 15,
              color: "#fff",
              cursor: "pointer",
              background: FIRE,
              border: "1px solid rgba(255,150,120,.6)",
              boxShadow: "inset 0 1.5px 1px rgba(255,225,205,.5), 0 8px 20px rgba(238,60,48,.32)",
              textShadow: "0 1px 2px rgba(120,15,5,.5)",
            }}
          >
            Tambah · {Math.round(kcal)} kkal
          </button>
        </div>
      </div>
    </div>
  );
}
