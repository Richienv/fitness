"use client";
import { signIn } from "next-auth/react";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { PERSON } from "@/lib/setup";
import type { Character } from "@/lib/companionProgress";
import { deviceAccount, rememberAccount } from "@/lib/deviceAccount";
import AvatarPlayer from "../companion/AvatarPlayer";
export default function LoginPage() {
  const [person, setPerson] = useState<Character | null>(null),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [choosing, setChoosing] = useState(true);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("person");
    const known = requested === "richie" || requested === "renita"
      ? requested : deviceAccount();
    if (known) { setPerson(known); setChoosing(false); }
  }, []);
  function choose(p: Character) {
    setPerson(p);
    setChoosing(false);
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
        rememberAccount(person);
        window.location.assign("/");
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
      </header>
      <div className="entry-companions">
        <AvatarPlayer duo showPlaybackControl />
      </div>
      <section className="account-heading">
        <h1>Masuk ke akunmu.</h1>
        <p>{person ? `Selamat datang, ${PERSON[person].name}.` : "Ruang kecil untuk progresmu."}</p>
      </section>
      {choosing ? <div className="account-picks" aria-label="Pilih akun">
        {(["richie", "renita"] as const).map((p) => (
          <button
            key={p}
            className={`account-pick ${p}`}
            aria-pressed={person === p}
            onClick={() => choose(p)}
            disabled={loading}
          >
            {PERSON[p].name}
          </button>
        ))}
      </div> : <div className="account-current">
        <span>{person && PERSON[person].name}</span>
        <button className="entry-link" type="button" disabled={loading}
          onClick={() => { setChoosing(true); setPerson(null); setPassword(""); setError(""); }}>Ganti akun</button>
      </div>}
      <form
        className={`entry-password ${person ? "is-ready" : ""}`}
        onSubmit={submit}
      >
        <label htmlFor="password">
          Password
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
        </button>
      </form>
    </main>
  );
}
