"use client";

import Link from "next/link";
import AuthFrame from "../AuthFrame";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

type RegisterResponse = { ok?: boolean; error?: string };

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const cleanEmail = email.trim();
    const cleanName = name.trim();
    if (!cleanEmail) {
      setError("Email tidak boleh kosong.");
      return;
    }
    if (password.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          ...(cleanName ? { name: cleanName } : {}),
        }),
      });

      let data: RegisterResponse = {};
      try {
        data = (await res.json()) as RegisterResponse;
      } catch {
        // ignore parse errors; fall through to generic handling
      }

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Gagal mendaftar. Coba lagi.");
        return;
      }

      // Auto sign-in after successful registration.
      const signInRes = await signIn("credentials", {
        email: cleanEmail,
        password,
        redirect: false,
      });
      if (signInRes?.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      // Registered but sign-in failed — send them to login to try manually.
      setError("Akun dibuat, tapi gagal masuk otomatis. Silakan masuk.");
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      title="Buat akun"
      footer={
        <>
          Sudah punya akun? <Link href="/login">Masuk</Link>
        </>
      }
    >
      <form className="friendly-form" onSubmit={onSubmit} noValidate>
        <label htmlFor="name">
          Nama (opsional)
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
        </label>
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </label>
        <p className="quiet">Gunakan minimal 8 karakter.</p>
        {error && (
          <p className="status-message" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={loading}>
          {loading ? "Memuat…" : "Daftar"}
        </button>
      </form>
    </AuthFrame>
  );
}
