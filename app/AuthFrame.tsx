import type { ReactNode } from "react";
import Link from "next/link";
import AvatarPlayer from "./companion/AvatarPlayer";
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
        <AvatarPlayer duo />
        <h1>{title}</h1>
        {children}
        <div className="auth-footer">{footer}</div>
      </div>
    </main>
  );
}
