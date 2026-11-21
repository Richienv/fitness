"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getHealthDay, lastHealthReceived, receivedLabel } from "@/lib/health";
import { todayKey } from "@/lib/targets";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import { toast } from "../../Toast";
import Icon from "../../ui/Icon";

const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");

/**
 * Connect Apple Health through an iPhone Shortcut. The home-screen app is a
 * PWA and cannot read HealthKit; a Shortcut can, and posts today's steps and
 * active energy to /api/widget/health with a send-only token.
 */
export default function HealthSetup() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("https://r2-fit.vercel.app");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const day = getHealthDay(todayKey());
    const last = lastHealthReceived();
    if (!last) return setStatus(null);
    const t = receivedLabel(last);
    const parts = day
      ? [
          day.steps !== null ? `${fmt(day.steps)} langkah` : null,
          day.activeKcal !== null ? `${fmt(day.activeKcal)} kkal aktif` : null,
        ].filter(Boolean)
      : [];
    const today = parts.join(" · ");
    setStatus(
      !today
        ? `Terakhir diterima ${t}. Hari ini belum ada data.`
        : t.startsWith("hari ini")
          ? `Terakhir diterima ${t}: ${today}.`
          : `Terakhir diterima ${t}. Hari ini: ${today}.`,
    );
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    refresh();
  }, [refresh]);
  useSoftRefresh(refresh);

  const endpoint = `${origin}/api/widget/health`;

  async function makeToken() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/widget/health-token", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j?.data?.token) throw new Error();
      setToken(j.data.token);
    } catch {
      setError("Token belum bisa dibuat. Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} disalin`, "success");
    } catch {
      toast(`${what} belum bisa disalin. Tekan lama untuk menyalin.`, "warn");
    }
  }

  return (
    <main className="lean-home hs-page">
      <header className="lean-header">
        <Link href="/workout" className="mk-text-btn">
          Kembali ke Latihan
        </Link>
      </header>
      <h1>Apple Health</h1>
      <p className="hs-lead">
        R2·FIT di home screen tidak bisa membaca Apple Health langsung. Pintasan
        di iPhone bisa: setiap malam ia mengirim langkah dan kalori aktif hari
        itu ke R2·FIT, lalu Latihan memakainya. Sekali atur, sekitar 5 menit.
      </p>
      <p className="hs-status" role="status">
        {status ?? "Belum ada data Apple Health yang diterima."}
      </p>

      <section className="lt-card">
        <h2 className="hs-step">1. Salin alamat dan token</h2>
        <label className="hs-field">
          <span>Alamat (URL)</span>
          <span className="hs-copy">
            <input readOnly value={endpoint} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="secondary-button" onClick={() => copy(endpoint, "Alamat")}>
              Salin
            </button>
          </span>
        </label>
        {token ? (
          <label className="hs-field">
            <span>Token (khusus untuk pintasan ini)</span>
            <span className="hs-copy">
              <input readOnly value={token} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="secondary-button" onClick={() => copy(token, "Token")}>
                Salin
              </button>
            </span>
          </label>
        ) : (
          <button
            type="button"
            className="primary-button hs-make"
            onClick={makeToken}
            disabled={loading}
          >
            {loading ? "Membuat token…" : "Buat token"}
          </button>
        )}
        {error && <p className="hs-error">{error}</p>}
        <p className="lt-foot">
          Token ini hanya bisa mengirim langkah dan kalori aktif ke akunmu, tidak
          bisa membaca catatanmu. Berlaku satu tahun; buat yang baru kapan saja.
        </p>
      </section>

      <section className="lt-card">
        <h2 className="hs-step">2. Buat pintasan</h2>
        <p className="hs-note">
          Nama tindakan bisa sedikit berbeda tergantung bahasa iPhone; nama
          Inggrisnya ada di dalam kurung.
        </p>
        <ol className="hs-list">
          <li>
            Buka app <strong>Pintasan</strong> (Shortcuts), ketuk <strong>+</strong>, beri nama
            “Kirim ke R2·FIT”.
          </li>
          <li>
            Tambah <strong>Cari Sampel Kesehatan</strong> (Find Health Samples): jenis{" "}
            <strong>Langkah</strong> (Steps), tanggal mulai <strong>hari ini</strong> (is
            today). Lalu tambah <strong>Hitung Statistik</strong> (Calculate Statistics):{" "}
            <strong>Jumlah</strong> (Sum).
          </li>
          <li>
            Ulangi untuk jenis <strong>Energi Aktif</strong> (Active Energy), juga{" "}
            <strong>Jumlah</strong>.
          </li>
          <li>
            Tambah <strong>Kamus</strong> (Dictionary) berisi dua angka: <code>steps</code> = hasil
            langkah, <code>activeKcal</code> = hasil energi aktif.
          </li>
          <li>
            Tambah <strong>Dapatkan Isi URL</strong> (Get Contents of URL): URL dari langkah 1,
            metode <strong>POST</strong>, header <code>Authorization</code> berisi{" "}
            <code>Bearer</code> spasi token, isi permintaan <strong>JSON</strong> = Kamus tadi.
          </li>
          <li>
            Opsional: <strong>Tampilkan Notifikasi</strong> (Show Notification) dengan hasil URL,
            supaya terlihat “Terkirim ke R2·FIT: 6.200 langkah · 410 kkal aktif”.
          </li>
          <li>Jalankan sekali dan izinkan akses Kesehatan saat diminta.</li>
        </ol>
      </section>

      <section className="lt-card">
        <h2 className="hs-step">3. Kirim otomatis setiap malam</h2>
        <ol className="hs-list">
          <li>
            Di Pintasan, buka <strong>Otomatisasi</strong> (Automation) → <strong>+</strong> →{" "}
            <strong>Waktu</strong> (Time of Day), misalnya <strong>21.00 setiap hari</strong>.
          </li>
          <li>
            Pilih pintasan “Kirim ke R2·FIT” dan pilih <strong>Jalankan Langsung</strong> (Run
            Immediately), supaya tidak perlu ditekan.
          </li>
        </ol>
        <p className="lt-foot">
          Boleh dikirim beberapa kali sehari; yang terbaru untuk tanggal itu yang
          dipakai. Setelah data masuk, total di Latihan memakai kalori aktif dari
          Apple Health dan tidak menghitung aktivitas yang sama dua kali.
        </p>
      </section>
      <Link href="/workout" className="secondary-button hs-back">
        <Icon name="arrow" size={18} style={{ transform: "rotate(180deg)" }} />
        Kembali ke Latihan
      </Link>
    </main>
  );
}
