import Link from "next/link";
import Dashboard from "./Dashboard";

export default function DashboardPage() {
  return (
    <main className="shell">
      <Link href="/" className="back-link" aria-label="Home">
        ← HOME
      </Link>
      <h1 className="section-title">
        TODAY <span>·</span>
      </h1>
      <Dashboard />
    </main>
  );
}
