"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { haptic } from "@/lib/haptics";
import { normalizeUsername, usernameError } from "@/lib/username";
import { todayKey } from "@/lib/targets";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

type PubUser = { id: string; name: string | null; username: string | null };
type Person = { followId: string; user: PubUser; name: string };
type Social = { following: Person[]; followers: Person[]; incoming: Person[]; outgoing: Person[] };
type Hit = { id: string; username: string | null; name: string; status: "PENDING" | "ACCEPTED" | "DECLINED" | null };
type Meal = { mealType: string; kcal: number; items: string[] };
type Workout = { sessionType: string; totalVolume: number; exercises: string[] };
type Day = {
  user: PubUser;
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

// NOTE: use the app's shared todayKey (Asia/Shanghai), NOT browser-local time.
// Every meal/workout row is written with the CST date key, so a locally-derived
// key silently queries the wrong day for anyone outside UTC+8 — the feed then
// renders "belum catat apa-apa" even though the data is there.

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default function SocialHome() {
  const [social, setSocial] = useState<Social | null>(null);
  const [feed, setFeed] = useState<Day[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [loadedMe, setLoadedMe] = useState(false);

  // Claim-your-handle form
  const [draft, setDraft] = useState("");
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleMsg, setHandleMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Search
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);

  const [busy, setBusy] = useState(false);
  const date = todayKey();

  const load = useCallback(async () => {
    const [s, f, u] = await Promise.all([
      fetch("/api/social").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/social/feed?date=${date}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/social/username").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (s?.ok) setSocial(s.data);
    if (u?.ok) setMyUsername(u.data?.username ?? null);
    // Distinguish "loaded, empty" from "failed": leaving feed at null on an
    // error left the page stuck on "Memuat…" forever with nothing explaining
    // why. An empty array renders the real empty state; the flag surfaces
    // failures instead of hiding them.
    if (f?.ok) {
      setFeed(f.data.feed);
      setFeedError(false);
    } else {
      setFeed([]);
      setFeedError(true);
    }
    setLoadedMe(true);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced @username search.
  useEffect(() => {
    const term = normalizeUsername(q);
    if (term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/social/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          setHits(d?.ok ? d.data.results : []);
          setSearching(false);
        })
        .catch(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  async function post(url: string, body: unknown): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: !!data?.ok, message: data?.message };
  }

  async function claimHandle() {
    const err = usernameError(draft);
    if (err) {
      setHandleMsg({ kind: "err", text: err });
      return;
    }
    setBusy(true);
    const r = await post("/api/social/username", { username: draft });
    setBusy(false);
    if (r.ok) {
      setMyUsername(normalizeUsername(draft));
      setEditingHandle(false);
      setHandleMsg({ kind: "ok", text: "Username kamu aktif." });
      haptic("success");
    } else {
      setHandleMsg({ kind: "err", text: r.message ?? "Gagal menyimpan." });
    }
  }

  async function sendRequest(username: string | null) {
    if (!username || busy) return;
    setBusy(true);
    const r = await post("/api/social/request", { username });
    setBusy(false);
    if (r.ok) {
      haptic("success");
      setHits((hs) => hs.map((h) => (h.username === username ? { ...h, status: "PENDING" } : h)));
      setHandleMsg(null);
      load();
    } else {
      // The API returns a Bahasa reason (not found / already following /
      // yourself); dropping it made a failed tap look like a dead button.
      setHandleMsg({ kind: "err", text: r.message ?? "Gagal mengirim permintaan." });
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
  const needsHandle = loadedMe && !myUsername;

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
        Lihat apa yang mereka makan dan latihan tiap hari. Mereka harus terima dulu — nggak ada yang kelihatan sebelum di-ACC.
      </p>

      {/* ── Username kamu ── */}
      <section style={{ marginTop: 22 }}>
        <div className="mono" style={label}>USERNAME KAMU</div>
        {myUsername && !editingHandle ? (
          <div style={{ ...card, borderColor: "rgba(255,150,120,.35)" }}>
            <Avatar name={myUsername} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...nameStyle, ...FIRE_TEXT, fontSize: 17, fontWeight: 800 }}>@{myUsername}</div>
              <div className="mono" style={subStyle}>temanmu cari kamu pakai ini</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDraft(myUsername);
                setEditingHandle(true);
                setHandleMsg(null);
              }}
              style={btnGhost}
            >
              UBAH
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: needsHandle ? "rgba(238,60,48,.07)" : "#0c0a0b",
              border: needsHandle ? "1px solid rgba(255,150,120,.35)" : "1px solid rgba(255,255,255,.1)",
            }}
          >
            {needsHandle && (
              <div style={{ fontSize: 12.5, color: "#ffd7c2", marginBottom: 10, lineHeight: 1.5 }}>
                Pilih username dulu biar temanmu bisa nemuin kamu. Satu akun, satu username.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#ff8a72" }}>@</span>
              <input
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="richie"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setHandleMsg(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && claimHandle()}
                className="mono"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "#0c0a0b",
                  border: "1px solid rgba(255,255,255,.14)",
                  borderRadius: 12,
                  padding: "12px 13px",
                  color: "#f1ede9",
                  fontSize: 15,
                  outline: "none",
                }}
              />
              <button type="button" onClick={claimHandle} disabled={busy || !draft.trim()} style={{ ...btnFire, opacity: busy || !draft.trim() ? 0.5 : 1 }}>
                SIMPAN
              </button>
            </div>
            <div className="mono" style={{ fontSize: 9.5, color: "#6a6660", marginTop: 8 }}>
              3–20 karakter · huruf, angka, _ · diawali huruf
            </div>
          </div>
        )}
        {handleMsg && (
          <div className="mono" style={{ fontSize: 11, marginTop: 8, color: handleMsg.kind === "ok" ? "#5fe39a" : "#ff9a80" }}>
            {handleMsg.text}
          </div>
        )}
      </section>

      {/* ── Permintaan masuk ── */}
      {incoming.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div className="mono" style={label}>🔔 PERMINTAAN MASUK · {incoming.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {incoming.map((p) => (
              <div key={p.followId} style={{ ...card, borderColor: "rgba(255,150,120,.4)" }}>
                <Avatar name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={nameStyle}>{p.name}</div>
                  <div className="mono" style={subStyle}>
                    {p.user.username ? `@${p.user.username} · ` : ""}mau ngikutin kamu
                  </div>
                </div>
                <button type="button" onClick={() => respond(p.followId, true)} style={btnFire}>TERIMA</button>
                <button type="button" onClick={() => respond(p.followId, false)} style={btnGhost}>TOLAK</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Cari teman ── */}
      <section style={{ marginTop: 24 }}>
        <div className="mono" style={label}>🔍 CARI TEMAN</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#ff8a72" }}>@</span>
          <input
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="username temanmu"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mono"
            style={{
              flex: 1,
              minWidth: 0,
              background: "#0c0a0b",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 13,
              padding: "13px 14px",
              color: "#f1ede9",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {searching && <div className="mono" style={{ fontSize: 10.5, color: "#7c736e" }}>mencari…</div>}
          {!searching && normalizeUsername(q).length >= 2 && hits.length === 0 && (
            <div className="mono" style={{ fontSize: 11, color: "#7c736e" }}>
              Nggak ada @{normalizeUsername(q)}.
            </div>
          )}
          {hits.map((h) => (
            <div key={h.id} style={card}>
              <Avatar name={h.username || h.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={nameStyle}>{h.name}</div>
                <div className="mono" style={subStyle}>@{h.username}</div>
              </div>
              {h.status === "ACCEPTED" ? (
                <span className="mono" style={{ ...pill, color: "#5fe39a", borderColor: "rgba(95,227,154,.4)" }}>SUDAH</span>
              ) : h.status === "PENDING" ? (
                <span className="mono" style={{ ...pill, color: "#ffb99e", borderColor: "rgba(255,150,120,.4)" }}>MENUNGGU</span>
              ) : (
                <button type="button" onClick={() => sendRequest(h.username)} disabled={busy} style={btnFire}>
                  IKUTI
                </button>
              )}
            </div>
          ))}
        </div>

        {outgoing.length > 0 && (
          <div className="mono" style={{ fontSize: 10.5, color: "#7c736e", marginTop: 12, lineHeight: 1.6 }}>
            Menunggu di-ACC: {outgoing.map((p) => (p.user.username ? `@${p.user.username}` : p.name)).join(", ")}
          </div>
        )}
      </section>

      {/* ── Feed hari ini ── */}
      <section style={{ marginTop: 28 }}>
        <div className="mono" style={label}>🔥 HARI INI</div>
        {feed === null ? (
          <div className="mono" style={{ fontSize: 11, color: "#7c736e" }}>Memuat…</div>
        ) : feedError ? (
          <div
            className="mono"
            style={{
              padding: "18px",
              borderRadius: 14,
              fontSize: 11,
              lineHeight: 1.6,
              color: "#ff9a80",
              background: "rgba(238,60,48,.08)",
              border: "1px solid rgba(238,60,48,.35)",
            }}
          >
            Gagal memuat feed. Cek koneksi, lalu tarik buat refresh.
          </div>
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
              Cari @username temanmu di atas.
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
                  <div className="mono" style={subStyle}>
                    {p.user.username ? `@${p.user.username} · ` : ""}kamu ngikutin dia
                  </div>
                </div>
                <button type="button" onClick={() => unfollow(p.user.id, "unfollow")} style={btnGhost}>BERHENTI</button>
              </div>
            ))}
            {followers.map((p) => (
              <div key={`r-${p.followId}`} style={card}>
                <Avatar name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={nameStyle}>{p.name}</div>
                  <div className="mono" style={subStyle}>
                    {p.user.username ? `@${p.user.username} · ` : ""}bisa lihat harimu
                  </div>
                </div>
                <button type="button" onClick={() => unfollow(p.user.id, "remove")} style={btnGhost}>CABUT</button>
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
        <Avatar name={day.user.username || day.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#f1ede9" }}>{day.name}</div>
          <div className="mono" style={{ fontSize: 9.5, color: "#7c736e", marginTop: 3 }}>
            {day.user.username ? `@${day.user.username} · ` : ""}
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
const pill: CSSProperties = {
  flex: "none",
  fontSize: 9.5,
  letterSpacing: ".08em",
  padding: "9px 12px",
  borderRadius: 11,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.12)",
};
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
