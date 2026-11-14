"use client";
import { signIn } from "next-auth/react";
import { useState, useRef, type FormEvent } from "react";
import { PERSON } from "@/lib/setup";
import type { Character } from "@/lib/companionProgress";
export default function LoginPage() {
  const [person, setPerson] = useState<Character | null>(null),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function choose(p: Character) {
    setPerson(p);
    setPassword("");
    setError("");
    requestAnimationFrame(() => input.current?.focus());
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading || !person) return;
    if (password.length !== 4) {
      setError("Masukkan password 4 huruf.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await signIn("credentials", {
        person,
        password,
        redirect: false,
      });
      if (r?.ok && !r.error) {
        window.location.assign("/welcome");
        return;
      }
      setError(
        "Password belum cocok. Jika sudah mencoba berkali-kali, tunggu 15 menit.",
      );
    } catch {
      setError("Koneksi bermasalah. Coba lagi.");
    }
    setLoading(false);
  }
  return (
    <main className={`account-entry ${person || ""}`}>
      <header className="entry-brand">
        <span className="friendly-brand">
          r2<span>fit</span>
        </span>
        <span>Ruang kita.</span>
      </header>
      <section className="account-heading">
        <p>SELAMAT DATANG</p>
        <h1>
          Hari ini,
          <br />
          siapa dulu?
        </h1>
      </section>
      <div className="account-picks" aria-label="Pilih akun">
        {(["richie", "renita"] as const).map((p) => (
          <button
            key={p}
            className={`account-pick ${p}`}
            aria-pressed={person === p}
            onClick={() => choose(p)}
            disabled={loading}
          >
            <img
              src={`/avatars/v2/${p}-level-01-poster.webp`}
              alt=""
              width="180"
              height="240"
            />
            <span>
              {PERSON[p].name}
              <small>{p === "richie" ? "73" : "43"} kg · akhir tahun</small>
            </span>
            <i aria-hidden="true">{person === p ? "✓" : "+"}</i>
          </button>
        ))}
      </div>
      <form
        className={`entry-password ${person ? "is-ready" : ""}`}
        onSubmit={submit}
      >
        <label htmlFor="password">
          {person ? `Password ${PERSON[person].name}` : "Pilih akunmu dulu"}
        </label>
        <div className="entry-password-input">
          <input
            ref={input}
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            minLength={4}
            maxLength={4}
            required
            disabled={!person || loading}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            placeholder="4 huruf"
          />
          <button
            type="button"
            disabled={!person}
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Sembunyikan password" : "Lihat password"}
          >
            {show ? "Sembunyikan" : "Lihat"}
          </button>
        </div>
        {error && (
          <p role="alert" className="entry-error">
            {error}
          </p>
        )}
        <button
          className="entry-primary"
          disabled={!person || password.length !== 4 || loading}
        >
          {loading
            ? "Masuk…"
            : person
              ? `Masuk sebagai ${PERSON[person].name}`
              : "Masuk"}
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </main>
  );
}
