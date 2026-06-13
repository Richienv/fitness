"use client";

import { useEffect, useRef, useState } from "react";

/**
 * IntersectionObserver helper. Returns a ref to attach to the target element
 * and a boolean that flips true the first time the element scrolls into view.
 * Once visible, the observer disconnects — used for one-shot entrance anims.
 */
export function useInView<T extends Element = HTMLDivElement>(
  rootMargin = "0px 0px -10% 0px"
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
