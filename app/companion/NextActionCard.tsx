"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { NextAction } from "@/lib/motivation";
import Icon, { type IconName } from "../ui/Icon";

const ICON: Record<NextAction["key"], IconName> = {
  resume: "workout",
  weigh: "scale",
  usual: "meal",
  meal: "plus",
  workout: "workout",
  protein: "plus",
  done: "check",
};

/** The single filled button on Home. Everything else is a quiet link.
 *  The weigh-in opens its sheet in place (`onWeigh`) and the usual meal logs
 *  in one tap (`onUsual`) instead of navigating. */
export default function NextActionCard({
  action,
  onWeigh,
  onUsual,
}: {
  action: NextAction;
  onWeigh?: () => void;
  onUsual?: () => void;
}) {
  const className = `next-action-button ${action.key}`;
  const content: ReactNode = (
    <>
      <span className="next-action-icon">
        <Icon name={ICON[action.key]} size={20} />
      </span>
      <span className="next-action-text">
        <strong>{action.title}</strong>
        <small>{action.hint}</small>
      </span>
      <Icon name="arrow" size={18} />
    </>
  );
  return (
    <section className="next-action" aria-label="Langkah berikutnya">
      {action.key === "usual" && onUsual ? (
        <button type="button" className={className} onClick={onUsual}>
          {content}
        </button>
      ) : action.key === "weigh" && onWeigh ? (
        <button
          type="button"
          className={className}
          aria-haspopup="dialog"
          onClick={onWeigh}
        >
          {content}
        </button>
      ) : (
        <Link href={action.href} className={className}>
          {content}
        </Link>
      )}
    </section>
  );
}
