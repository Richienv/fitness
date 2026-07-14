"use client";

// Hardware/browser back-button support for overlays (sheets, modals, the Food
// Builder). Without this, pressing back on a phone while a sheet is open
// navigates away from the whole page — the #1 mobile-nav complaint.
//
// While `open` is true the hook holds one history entry; pressing back fires
// `onBack` for the TOP-MOST open overlay only (module-level stack), so nested
// sheets (e.g. entry editor over the manage sheet) close one at a time.
//
// `onBack` may return `true` to signal the overlay is still open — it
// consumed the press internally (e.g. a wizard stepped back) — in which case
// the history entry is re-pushed so the next back press works too.

import { useEffect, useRef } from "react";

let stack: number[] = [];
let nextId = 1;

export function useSheetBack(open: boolean, onBack: () => boolean | void) {
  const ref = useRef(onBack);
  ref.current = onBack;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const id = nextId++;
    stack.push(id);
    let poppedByUser = false;
    window.history.pushState({ __sheet: id }, "");

    const onPop = () => {
      if (stack[stack.length - 1] !== id) return; // a sheet above us owns it
      const stillOpen = ref.current() === true;
      if (stillOpen) {
        // Consumed internally (step back) — re-arm for the next press.
        window.history.pushState({ __sheet: id }, "");
      } else {
        poppedByUser = true;
        stack = stack.filter((x) => x !== id);
      }
    };

    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      stack = stack.filter((x) => x !== id);
      // Closed via UI (X / save) — silently consume the held history entry so
      // the next back press leaves the page as expected.
      if (
        !poppedByUser &&
        (window.history.state as { __sheet?: number } | null)?.__sheet === id
      ) {
        window.history.back();
      }
    };
  }, [open]);
}
