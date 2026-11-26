"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useSheetBack } from "@/lib/backSheet";
import { useModalScrollLock } from "@/lib/scrollLock";
import Icon from "../ui/Icon";
import { useVisibleViewport } from "@/lib/useVisibleViewport";
export default function FriendlySheet({
  title,
  onClose,
  children,
  footer,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const viewport = useVisibleViewport();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useSheetBack(true, onClose);
  useModalScrollLock(true);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="friendly-backdrop" style={viewport} onClick={onClose}>
      <div
        className={`friendly-sheet ${className}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close.current();
          }
          if (e.key !== "Tab") return;
          const nodes = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]),input:not([disabled]),select,summary,a[href],[tabindex="0"]',
            ) ?? [],
          ).filter((el) => el.getClientRects().length);
          const first = nodes[0],
            last = nodes.at(-1);
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === ref.current)
          ) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label={`Tutup ${title}`}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="friendly-sheet-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}
