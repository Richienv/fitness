"use client";
import { useEffect, useState } from "react";
export default function MorningScene() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <svg
      className={`morning-scene${ready ? " ready" : ""}`}
      viewBox="0 0 180 110"
      fill="none"
      aria-hidden="true"
    >
      <rect x="36" y="7" width="124" height="104" rx="28" fill="#edf1e1" />
      <circle className="morning-sun" cx="116" cy="40" r="19" fill="#ead9a2" />
      <path
        d="M51 106V19h94v87M99 19v87M51 65h94"
        stroke="#cad6c2"
        strokeWidth="3"
      />
      <path
        d="M3 96h65M14 87h45"
        stroke="#bfcfbb"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M25 87v-8a10 10 0 0 1 20 0v8" fill="#ddd0b7" />
    </svg>
  );
}
