"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useVisibleViewport } from "@/lib/useVisibleViewport";
import { useModalScrollLock } from "@/lib/scrollLock";
import Icon from "../ui/Icon";

const FOCUSABLE =
  'button:not([disabled]),input:not([disabled]),select,textarea,a[href],[tabindex="0"]';

/** The one frame for Latihan's sheets and dialogs: a labelled modal dialog in
 *  <body> (Latihan's page wrapper animates a transform, which would otherwise
 *  trap position: fixed), with a backdrop, Escape to close, focus moved in and
 *  given back, Tab kept inside, and sized to the part of the screen the iOS
 *  keyboard leaves free. The caller decides what closing means (and runs
 *  useSheetBack for the phone's back button).
 *
 *  Focus goes to the element marked data-autofocus, else to the dialog. */
export default function SheetFrame({
  title,
  description,
  onClose,
  children,
  top,
  footer,
  variant = "sheet",
  backdropCloses = true,
}: {
  title: string;
  description?: string;
  /** Ask to close: the x, Escape and a tap on the backdrop all call this. */
  onClose: () => void;
  children: ReactNode;
  /** Fixed above the scrolling body (a search field). */
  top?: ReactNode;
  /** Fixed below the scrolling body (the primary action). */
  footer?: ReactNode;
  variant?: "sheet" | "dialog";
  /** False while closing would throw work away. */
  backdropCloses?: boolean;
}) {
  const viewport = useVisibleViewport();
  useModalScrollLock(true);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const target =
      ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current;
    target?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const dialog = variant === "dialog";
  return createPortal(
    <div
      role="presentation"
      className={`lt-sh-backdrop${dialog ? " dialog" : ""}`}
      style={viewport}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropCloses) onClose();
      }}
    >
      <div
        ref={ref}
        className={`lt-sh ${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
            return;
          }
          if (e.key !== "Tab") return;
          const nodes = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
          ).filter((el) => el.getClientRects().length);
          const first = nodes[0];
          const last = nodes[nodes.length - 1];
          const here = document.activeElement;
          if (e.shiftKey && (here === first || here === ref.current)) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && here === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        {dialog ? (
          <h2 id={titleId} className="lt-sh-dlg-title">
            {title}
          </h2>
        ) : (
          <header className="lt-sh-head">
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className="lt-sh-close"
              aria-label={`Tutup ${title}`}
              onClick={onClose}
            >
              <Icon name="close" size={20} />
            </button>
          </header>
        )}
        {description && (
          <p id={descId} className="lt-sh-desc">
            {description}
          </p>
        )}
        {top && <div className="lt-sh-top">{top}</div>}
        {dialog ? children : <div className="lt-sh-body">{children}</div>}
        {footer && <footer className="lt-sh-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
