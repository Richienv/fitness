"use client";
import Link from "next/link";
import type { NextAction } from "@/lib/motivation";
import Icon, { type IconName } from "../ui/Icon";

const ICON: Record<NextAction["key"], IconName> = {
  resume: "workout",
  weigh: "scale",
  meal: "plus",
  workout: "workout",
  protein: "plus",
  done: "check",
};

/** The single filled button on Home. Everything else is a quiet link. */
export default function NextActionCard({ action }: { action: NextAction }) {
  return (
    <section className="next-action" aria-label="Langkah berikutnya">
      <Link
        href={action.href}
        className={`next-action-button ${action.key}`}
      >
        <span className="next-action-icon">
          <Icon name={ICON[action.key]} size={20} />
        </span>
        <span className="next-action-text">
          <strong>{action.title}</strong>
          <small>{action.hint}</small>
        </span>
        <Icon name="arrow" size={18} />
      </Link>
    </section>
  );
}
