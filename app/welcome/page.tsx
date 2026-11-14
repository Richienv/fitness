"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useAccountSetup } from "../SetupProvider";
import { PERSON } from "@/lib/setup";
const dialogue = [
  { who: "Richie", text: "Deal ya. Akhir tahun, aku 73 kg." },
  { who: "Renita", text: "Aku 43 kg. Kita jalanin bareng." },
  { who: "Kita", text: "Pelan, konsisten. Saling ingetin." },
];
export default function WelcomePage() {
  const account = useAccountSetup(),
    reduced = useReducedMotion();
  const [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(true),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const im = new Image();
    im.onload = () => setLoaded(true);
    im.src = "/avatars/welcome-v1/conversation-sheet.webp";
  }, []);
  useEffect(() => {
    if (reduced || !playing || !loaded) return;
    const t = setInterval(() => {
      if (!document.hidden) setFrame((f) => (f + 1) % 12);
    }, 700);
    return () => clearInterval(t);
  }, [reduced, playing, loaded]);
  if (!account) return null;
  const line = dialogue[Math.floor(frame / 4)];
  return (
    <main className="cinema-welcome">
      <header>
        <span className="friendly-brand">
          r2<span>fit</span>
        </span>
        <span>RICHIE + RENITA</span>
        <Link href={account.setup ? "/" : "/onboarding"}>Lanjut →</Link>
      </header>
      <div
        className="cinema-scene"
        role="img"
        aria-label="Richie dan Renita ngobrol dari sudut atas, lalu fist bump membuat kesepakatan"
        style={{
          backgroundImage: `url('/avatars/welcome-v1/conversation-${loaded ? "sheet" : "poster"}.webp')`,
          backgroundSize: loaded ? "400% 300%" : "100% 100%",
          backgroundPosition: loaded
            ? `${((frame % 4) / 3) * 100}% ${(Math.floor(frame / 4) / 2) * 100}%`
            : "center",
        }}
      >
        <span className="cinema-overline">SATU DEAL KECIL.</span>
        <button
          className="cinema-play"
          onClick={() => setPlaying((p) => !p)}
          disabled={reduced}
          aria-label={playing ? "Jeda welcome" : "Putar welcome"}
        >
          {playing && !reduced ? "Jeda" : "Putar"}
        </button>
      </div>
      <section className="cinema-story">
        <p className="cinema-date">SAMPAI 31 DESEMBER 2026</p>
        <h1>
          Kita mulai
          <br />
          bareng.
        </h1>
        <div className="cinema-targets">
          <span>
            <i className="richie-dot" />
            Richie{" "}
            <strong>
              73<small> kg</small>
            </strong>
          </span>
          <span>
            <i className="renita-dot" />
            Renita{" "}
            <strong>
              43<small> kg</small>
            </strong>
          </span>
        </div>
        <div className="cinema-dialogue">
          {reduced ? (
            dialogue.map((d) => (
              <p key={d.who}>
                <b>{d.who}</b> “{d.text}”
              </p>
            ))
          ) : (
            <p key={line.who}>
              <b>{line.who}</b> “{line.text}”
            </p>
          )}
        </div>
        <Link
          className={`entry-primary ${account.person}`}
          href={account.setup ? "/" : "/onboarding"}
        >
          {account.setup
            ? "Lanjut ke beranda"
            : `Isi data ${PERSON[account.person].name}`}
          <span aria-hidden="true">→</span>
        </Link>
        <p className="cinema-foot">
          {account.setup
            ? "Data dan target bisa diubah di Settings."
            : "Beberapa langkah singkat. Data kamu, target kamu."}
        </p>
      </section>
    </main>
  );
}
