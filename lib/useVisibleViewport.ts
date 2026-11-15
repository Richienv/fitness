"use client";
import { useEffect, useState, type CSSProperties } from "react";

/** Keep bottom controls above the iOS keyboard, which doesn't resize layout. */
export function useVisibleViewport() {
  const [style, setStyle] = useState<CSSProperties>({});
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      if (Math.abs(viewport.scale - 1) > 0.05) return;
      setStyle({
        top: viewport.offsetTop,
        height: viewport.height,
        bottom: "auto",
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return style;
}
