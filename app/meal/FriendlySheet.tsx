"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useSheetBack } from "@/lib/backSheet";
import Icon from "../ui/Icon";
export default function FriendlySheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useSheetBack(true, onClose);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => opener?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="friendly-backdrop" onClick={onClose}>
      <div
        className="friendly-sheet"
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
