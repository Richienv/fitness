"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, type CSSProperties, type FormEvent } from "react";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: "calc(24px + env(safe-area-inset-top)) 20px 32px",
  background:
    "radial-gradient(1100px 700px at 50% -8%, #17100f 0%, #0a0809 42%, #050406 100%)",
  fontFamily: SANS,
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  display: "flex",
  flexDirection: "column",
};

const labelStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: ".14em",
  color: "#8a837d",
  textTransform: "uppercase",
  marginBottom: 7,
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 12,
  padding: "14px",
  color: "#f1ede9",
  fontSize: 16,
  fontFamily: SANS,
  outline: "none",
};

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
      setError("Password tidak boleh kosong.");
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
        setError("Email atau password salah.");
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
    <main style={pageStyle}>
      <div style={cardStyle}>
        {/* wordmark */}
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: "-.01em",
            color: "#f5f2ef",
            textAlign: "center",
          }}
        >
          R2<span style={{ color: "#ee3c30" }}>·</span>
          <span style={FIRE_TEXT}>FIT</span>
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".14em",
            color: "#6a6660",
            textTransform: "uppercase",
            textAlign: "center",
            marginTop: 10,
          }}
        >
          Bakar terus · jangan padam
        </div>

        {/* title */}
        <h1
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 26,
            letterSpacing: "-.01em",
            color: "#f1ede9",
            textAlign: "center",
            margin: "28px 0 22px",
          }}
        >
          MASUK
        </h1>

        <form onSubmit={onSubmit} noValidate>
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Email</div>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Password</div>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                background: "rgba(238,60,48,.1)",
                border: "1px solid rgba(238,60,48,.35)",
                color: "#ffb39e",
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: ".04em",
                borderRadius: 12,
                padding: "11px 13px",
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* fire CTA */}
          <button
            type="submit"
            disabled={loading}
            style={{
              position: "relative",
              overflow: "hidden",
              display: "block",
              width: "100%",
              padding: "16px 20px",
              borderRadius: 16,
              textAlign: "center",
              cursor: loading ? "default" : "pointer",
              background: FIRE,
              border: "1px solid rgba(255,150,120,.6)",
              boxShadow:
                "inset 0 1.5px 1px rgba(255,225,205,.7), inset 0 -5px 10px rgba(150,20,5,.4), 0 14px 30px rgba(238,60,48,.42)",
              opacity: loading ? 0.7 : 1,
              transition: "opacity .2s ease",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 0,
                left: "-55%",
                width: "55%",
                height: "100%",
                background:
                  "linear-gradient(105deg,transparent,rgba(255,255,255,.35),transparent)",
                animation: "btnSheen 6s ease-in-out infinite",
              }}
            />
            <span
              style={{
                position: "relative",
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 17,
                color: "#fff",
                textShadow: "0 1px 2px rgba(120,15,5,.5)",
                letterSpacing: ".02em",
              }}
            >
              {loading ? "MEMUAT…" : "MASUK"}
            </span>
          </button>
        </form>

        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: "#8a837d",
            textAlign: "center",
            marginTop: 22,
          }}
        >
          Belum punya akun?{" "}
          <Link
            href="/register"
            style={{ color: "#ff8a72", textDecoration: "none", fontWeight: 600 }}
          >
            Daftar
          </Link>
        </div>
      </div>
    </main>
  );
}
