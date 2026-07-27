"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { haptic } from "@/lib/haptics";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

type Person = { followId: string; user: { id: string; name: string | null; email: string }; name: string };
type Social = { following: Person[]; followers: Person[]; incoming: Person[]; outgoing: Person[] };
type Meal = { mealType: string; kcal: number; items: string[] };
type Workout = { sessionType: string; totalVolume: number; exercises: string[] };
type Day = {
  user: { id: string; name: string | null; email: string };
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: Meal[];
  workouts: Workout[];
};

const MEAL_LABEL: Record<string, string> = {
  breakfast: "SARAPAN",
  lunch: "SIANG",
  snack: "SNACK",
  dinner: "MALAM",
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default function SocialHome() {
  const [social, setSocial] = useState<Social | null>(null);
  const [feed, setFeed] = useState<Day[] | null>(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const date = todayKey();

  const load = useCallback(async () => {
    const [s, f] = await Promise.all([
      fetch("/api/social").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/social/feed?date=${date}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (s?.ok) setSocial(s.data);
    if (f?.ok) setFeed(f.data.feed);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(url: string, body: unknown): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: !!data?.ok, message: data?.message };
  }

  async function sendRequest() {
    const e = email.trim();
    if (!e || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await post("/api/social/request", { email: e });
    setBusy(false);
    if (r.ok) {
      setEmail("");
      setMsg({ kind: "ok", text: "Permintaan dikirim — tunggu dia terima." });
      haptic("success");
      load();
    } else {
      setMsg({ kind: "err", text: r.message ?? "Gagal mengirim permintaan." });
    }
  }

  async function respond(followId: string, accept: boolean) {
    haptic("tap");
    await post("/api/social/respond", { followId, accept });
    load();
  }

  async function unfollow(userId: string, mode: "unfollow" | "remove") {
    haptic("tap");
    await post("/api/social/unfollow", { userId, mode });
    load();
  }

  const incoming = social?.incoming ?? [];
  const following = social?.following ?? [];
  const followers = social?.followers ?? [];
  const outgoing = social?.outgoing ?? [];

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "0 auto",
        minHeight: "100dvh",
        fontFamily: SANS,
        background:
          "radial-gradient(1100px 700px at 50% -8%, #17100f 0%, #0a0809 42%, #050406 100%)",
        padding: "calc(20px + env(safe-area-inset-top)) 18px calc(40px + env(safe-area-inset-bottom))",
      }}
    >
      <Link href="/" className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "#8a837d", textDecoration: "none" }}>
        ← BERANDA
      </Link>
      <h1 style={{ fontSize: 27, fontWeight: 800, color: "#f1ede9", marginTop: 12 }}>
        TEMAN <span style={FIRE_TEXT}>SEPERJUANGAN</span>
      </h1>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: "#9a938d", marginTop: 6 }}>
        Lihat apa yang mereka makan dan latihan hari ini. Mereka harus terima dulu — nggak ada yang kelihatan sebelum di-ACC.
      </p>

      {/* ── Permintaan masuk ── */}
      {incoming.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <div className="mono" style={label}>
            🔔 PERMINTAAN MASUK · {incoming.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {incoming.map((p) => (
              <div key={p.followId} style={{ ...card, borderColor: "rgba(255,150,120,.4)" }}>
                <Avatar name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={nameStyle}>{p.name}</div>
                  <div className="mono" style={subStyle}>mau ngikutin kamu</div>
                </div>
                <button type="button" onClick={() => respond(p.followId, true)} style={btnFire}>
                  TERIMA
                </button>
                <button type="button" onClick={() => respond(p.followId, false)} style={btnGhost}>
                  TOLAK
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tambah teman ── */}
      <section style={{ marginTop: 22 }}>
        <div className="mono" style={label}>＋ IKUTI TEMAN</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="email temanmu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendRequest()}
            className="mono"
            style={{
              flex: 1,
              minWidth: 0,
              background: "#0c0a0b",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 13,
              padding: "13px 14px",
              color: "#f1ede9",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button type="button" onClick={sendRequest} disabled={busy || !email.trim()} style={{ ...btnFire, opacity: busy || !email.trim() ? 0.5 : 1, padding: "0 18px" }}>
            {busy ? "…" : "KIRIM"}
          </button>
        </div>
        {msg && (
          <div
            className="mono"
            style={{ fontSize: 11, marginTop: 9, color: msg.kind === "ok" ? "#5fe39a" : "#ff9a80" }}
          >
            {msg.text}
          </div>
        )}
        {outgoing.length > 0 && (
          <div className="mono" style={{ fontSize: 10.5, color: "#7c736e", marginTop: 12, lineHeight: 1.6 }}>
            Menunggu di-ACC: {outgoing.map((p) => p.name).join(", ")}
          </div>
        )}
      </section>

      {/* ── Feed hari ini ── */}
      <section style={{ marginTop: 28 }}>
        <div className="mono" style={label}>🔥 HARI INI</div>
        {feed === null ? (
          <div className="mono" style={{ fontSize: 11, color: "#7c736e" }}>Memuat…</div>
        ) : feed.length === 0 ? (
          <div
            style={{
              padding: "26px 18px",
              borderRadius: 16,
              background: "#0c0a0b",
              border: "1px dashed rgba(255,255,255,.12)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28 }}>👀</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#cfc8c2", marginTop: 8 }}>
              Belum ngikutin siapa-siapa
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: "#7c736e", marginTop: 6, lineHeight: 1.6 }}>
              Masukin email temanmu di atas.
              <br />
              Kalau dia terima, makan &amp; latihannya muncul di sini tiap hari.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {feed.map((d) => (
              <FeedCard key={d.user.id} day={d} />
            ))}
          </div>
        )}
      </section>

      {/* ── Koneksi ── */}
      {(following.length > 0 || followers.length > 0) && (
        <section style={{ marginTop: 28 }}>
          <div className="mono" style={label}>KONEKSI</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {following.map((p) => (
              <div key={`f-${p.followId}`} style={card}>
                <Avatar name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={nameStyle}>{p.name}</div>
                  <div className="mono" style={subStyle}>kamu ngikutin dia</div>
                </div>
                <button type="button" onClick={() => unfollow(p.user.id, "unfollow")} style={btnGhost}>
                  BERHENTI
                </button>
              </div>
            ))}
            {followers.map((p) => (
              <div key={`r-${p.followId}`} style={card}>
                <Avatar name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={nameStyle}>{p.name}</div>
                  <div className="mono" style={subStyle}>bisa lihat harimu</div>
                </div>
                <button type="button" onClick={() => unfollow(p.user.id, "remove")} style={btnGhost}>
                  CABUT
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        flex: "none",
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontFamily: MONO,
        fontSize: 13,
        fontWeight: 700,
        color: "#fff",
        background: FIRE,
        border: "1px solid rgba(255,150,120,.5)",
      }}
    >
      {initials(name)}
    </div>
  );
}

function FeedCard({ day }: { day: Day }) {
  const logged = day.kcal > 0 || day.workouts.length > 0;
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 16,
        background: "linear-gradient(180deg,rgba(255,255,255,.035),transparent 40%),#0c0a0b",
        border: "1px solid rgba(255,255,255,.09)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <Avatar name={day.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#f1ede9" }}>{day.name}</div>
          <div className="mono" style={{ fontSize: 9.5, color: "#7c736e", marginTop: 3 }}>
            {logged ? `${day.meals.length} makan · ${day.workouts.length} latihan` : "belum catat apa-apa"}
          </div>
        </div>
        <div style={{ textAlign: "right", flex: "none" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#ffe9d6", lineHeight: 1 }}>
            {day.kcal.toLocaleString("id-ID")}
          </div>
          <div className="mono" style={{ fontSize: 8.5, color: "#7c736e", marginTop: 3 }}>KKAL</div>
        </div>
      </div>

      {logged && (
        <div
          className="mono"
          style={{
            display: "flex",
            gap: 12,
            marginTop: 12,
            padding: "9px 12px",
            borderRadius: 11,
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.08)",
            fontSize: 11.5,
          }}
        >
          <span><span style={{ color: "#5fe39a" }}>{day.protein}</span><span style={{ color: "#6a6660" }}>p</span></span>
          <span><span style={{ color: "#9a938d" }}>{day.carbs}</span><span style={{ color: "#6a6660" }}>c</span></span>
          <span><span style={{ color: "#9a938d" }}>{day.fat}</span><span style={{ color: "#6a6660" }}>f</span></span>
        </div>
      )}

      {day.meals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {day.meals.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="mono" style={{ fontSize: 8.5, letterSpacing: ".1em", color: "#ff8a72", width: 58, flex: "none" }}>
                {MEAL_LABEL[m.mealType] ?? m.mealType.toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "#cfc8c2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.items.length > 0 ? m.items.join(", ") : "—"}
              </span>
              <span className="mono" style={{ fontSize: 10, color: "#7c736e", flex: "none" }}>{m.kcal}</span>
            </div>
          ))}
        </div>
      )}

      {day.workouts.map((w, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginTop: 10,
            padding: "9px 12px",
            borderRadius: 11,
            background: "linear-gradient(90deg,rgba(238,60,48,.1),transparent)",
            border: "1px solid rgba(255,150,120,.25)",
          }}
        >
          <span style={{ fontSize: 15 }}>🏋️</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#f1ede9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {w.exercises.length > 0 ? w.exercises.join(", ") : w.sessionType}
          </span>
          {w.totalVolume > 0 && (
            <span className="mono" style={{ fontSize: 10, color: "#ffb99e", flex: "none" }}>
              {w.totalVolume.toLocaleString("id-ID")} kg
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

const label: CSSProperties = {
  fontSize: 10,
  letterSpacing: ".16em",
  color: "#7c736e",
  marginBottom: 10,
};
const card: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "12px 14px",
  borderRadius: 14,
  background: "#0c0a0b",
  border: "1px solid rgba(255,255,255,.09)",
};
const nameStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 14.5,
  color: "#f1ede9",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const subStyle: CSSProperties = { fontSize: 9.5, color: "#7c736e", marginTop: 3 };
const btnFire: CSSProperties = {
  flex: "none",
  height: 38,
  padding: "0 14px",
  borderRadius: 11,
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: ".08em",
  color: "#fff",
  background: FIRE,
  border: "1px solid rgba(255,150,120,.5)",
  cursor: "pointer",
};
const btnGhost: CSSProperties = {
  flex: "none",
  height: 38,
  padding: "0 12px",
  borderRadius: 11,
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: ".08em",
  color: "#9a938d",
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.12)",
  cursor: "pointer",
};
