"use client";

// Hardware/browser back-button support for overlays (sheets, modals, the Food
// Builder). Without this, pressing back on a phone while a sheet is open
// navigates away from the whole page — the #1 mobile-nav complaint.
//
// Design: ONE shared history "guard" entry for the whole overlay stack, plus a
// single popstate listener. Each open overlay registers an onBack callback on a
// module-level stack. Pressing back runs the TOP overlay's onBack (nested sheets
// close one at a time); an onBack returning `true` means it handled the press
// internally (e.g. a wizard stepped back) and the guard is re-armed.
//
// A single guard (rather than one entry per sheet) is what makes handoffs safe:
// when one sheet closes as another opens in the same render (meal picker → food
// builder), the guard is simply reused, so no stray `history.back()` races with
// the newly-mounted sheet and closes it.

import { useEffect, useRef } from "react";

type Entry = { id: number; onBack: () => boolean | void };

let stack: Entry[] = [];
let nextId = 1;
let armed = false; // do we currently hold the guard history entry?
let ignorePops = 0; // popstates we caused programmatically (skip them)
let listening = false;

function pushGuard() {
  window.history.pushState({ __sheetGuard: true }, "");
  armed = true;
}

function ensureListener() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("popstate", () => {
    if (ignorePops > 0) {
      ignorePops--;
      return;
    }
    const top = stack[stack.length - 1];
    if (!top) {
      armed = false;
      return;
    }
    const stillOpen = top.onBack() === true;
    if (stillOpen) {
      // Consumed internally (step back) — re-hold an entry for the next press.
      pushGuard();
    } else {
      stack.pop();
      if (stack.length > 0) pushGuard();
      else armed = false;
    }
  });
}

export function useSheetBack(open: boolean, onBack: () => boolean | void) {
  const ref = useRef(onBack);
  ref.current = onBack;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    ensureListener();
    const entry: Entry = { id: nextId++, onBack: () => ref.current() };
    stack.push(entry);
    if (!armed) pushGuard(); // reuse the existing guard across handoffs

    return () => {
      const idx = stack.indexOf(entry);
      if (idx !== -1) stack.splice(idx, 1);
      // Defer: if a sibling sheet opened in the same commit (picker → builder),
      // the stack won't be empty here and we keep the shared guard. Only when
      // no overlay remains do we consume the guard so the next back leaves the
      // page as expected.
      Promise.resolve().then(() => {
        if (stack.length === 0 && armed) {
          if (
            (window.history.state as { __sheetGuard?: boolean } | null)
              ?.__sheetGuard
          ) {
            ignorePops++;
            window.history.back();
          }
          armed = false;
        }
      });
    };
  }, [open]);
}
