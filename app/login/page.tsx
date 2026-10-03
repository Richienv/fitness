"use client";

import Link from "next/link";
import AuthFrame from "../AuthFrame";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Email tidak boleh kosong.");
      return;
    }
    if (!password) {
      setError("Kata sandi tidak boleh kosong.");
      return;
    }

    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: cleanEmail,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Email atau kata sandi salah.");
        return;
      }
      if (res?.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      setError("Terjadi kesalahan. Coba lagi.");
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      title="Masuk ke akunmu"
      footer={
        <>
          Belum punya akun? <Link href="/register">Daftar</Link>
        </>
      }
    >
      <form className="friendly-form" onSubmit={onSubmit} noValidate>
        <label htmlFor="email">
          Email
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </label>
        <label htmlFor="password">
          Kata sandi
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </label>
        {error && (
          <p className="status-message" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={loading}>
          {loading ? "Memuat…" : "Masuk"}
        </button>
      </form>
    </AuthFrame>
  );
}
