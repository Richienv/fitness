"use client";

import { useEffect, useState } from "react";

type ToastKind = "info" | "success" | "warn" | "error";
type Toast = { id: number; text: string; kind: ToastKind };

let queue: Toast[] = [];
let subscribers: Array<(t: Toast[]) => void> = [];
let nextId = 1;

function publish() {
  for (const s of subscribers) s([...queue]);
}

/** Imperative API — call anywhere on the client to show a toast.
 *  toast("Logged ✓", "success"). Auto-dismisses after ~1.6s. */
export function toast(text: string, kind: ToastKind = "info"): void {
  if (typeof window === "undefined") return;
  const t: Toast = { id: nextId++, text, kind };
  queue.push(t);
  publish();
  window.setTimeout(() => {
    queue = queue.filter((x) => x.id !== t.id);
    publish();
  }, 1600);
}

export default function ToastStack() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const fn = (next: Toast[]) => setItems(next);
    subscribers.push(fn);
    setItems([...queue]);
    return () => {
      subscribers = subscribers.filter((s) => s !== fn);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === "info" ? "" : t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
