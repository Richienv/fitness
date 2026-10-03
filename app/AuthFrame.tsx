import type { ReactNode } from "react";
import Link from "next/link";
export default function AuthFrame({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="friendly-brand">
          r2<span>fit</span>
        </Link>
        <p className="quiet">Catat makan, bangun kebiasaan baik.</p>
        <h1>{title}</h1>
        {children}
        <div className="auth-footer">{footer}</div>
      </div>
    </main>
  );
}
