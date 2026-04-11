import Link from "next/link";
import { weekNumber } from "@/lib/targets";

export default function HomePage() {
  const week = weekNumber();
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">RICHIE</div>
        <div className="week">Week {week} / 12</div>
      </div>

      <h1 className="section-title">
        WHAT NOW<span>?</span>
      </h1>

      <Link href="/workout" className="big-btn">
        <span className="icon">🏋️</span>
        <span className="label">LOG WORKOUT</span>
        <span className="sub">Push / Pull / Legs — log sets in seconds</span>
      </Link>

      <Link href="/meal" className="big-btn">
        <span className="icon">🍽️</span>
        <span className="label">LOG MEAL</span>
        <span className="sub">Tap ingredients — macros auto-calculated</span>
      </Link>

      <Link href="/dashboard" className="big-btn" style={{ padding: "24px 28px" }}>
        <span className="label" style={{ fontSize: 24 }}>DASHBOARD →</span>
        <span className="sub">Today&apos;s macros, checklist, week view</span>
      </Link>
    </main>
  );
}
