"use client";

// TEMAN SEPERJUANGAN — a vertically snapping reels feed.
//
// Reel 0 is the leaderboard (podium + ranks), reel 1 is your friend list,
// reels 2..n are one friend's day each, and the last reel is an invite CTA.
// Username setup and search stay OUT of the scroll in a floating button +
// modal — that's one-time chrome, and it used to sit above the feed you
// actually came for.
//
// The friend list is NOT chrome, which is why it's a reel: accepting someone
// used to leave no visible trace anywhere in the app.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { haptic } from "@/lib/haptics";
import { normalizeUsername, usernameError } from "@/lib/username";
import { todayKey } from "@/lib/targets";
import { badgeStyle, carved } from "./metal";
import type { BadgeTier } from "@/lib/badges";

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
type Person = { followId: string; user: PubUser; name: string; since: string };
// `friends` is accepted-in-either-direction. The API still returns the split
// following/followers lists, but nothing on screen should care which way round
// the request went — that distinction is exactly what made accepted friends
// invisible to the person who accepted them.
type Social = { friends: Person[]; incoming: Person[]; outgoing: Person[] };
type Hit = { id: string; username: string | null; name: string; status: "PENDING" | "ACCEPTED" | "DECLINED" | null };

type Meal = { id: string; mealType: string; kcal: number; items: string[]; photoUrl: string | null };
type Workout = { sessionType: string; totalVolume: number; machines: number; location: string | null; exercises: string[] };
type Cardio = { kind: string; distanceM: number; durationSec: number; location: string | null };
type Day = {
  user: PubUser;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  meals: Meal[];
  workouts: Workout[];
  cardio: Cardio[];
};

type Row = {
  userId: string;
  rank: number;
  name: string;
  username: string | null;
  initials: string;
  score: number;
  badges: string[];
  isMe: boolean;
  isFriend: boolean;
  detail: string | null;
};
type Board = { scope: string; scopeLabel: string; total: number; myRank: number | null; rows: Row[] };

const SCOPES = [
  { key: "friends", label: "TEMAN" },
  { key: "kecamatan", label: "KECAMATAN" },
  { key: "city", label: "KOTA" },
] as const;

const MEAL_LABEL: Record<string, string> = {
  breakfast: "SARAPAN",
  lunch: "SIANG",
  snack: "SNACK",
  dinner: "MALAM",
};

// Badge labels come back as display strings; map to a tier for the metal.
const TIER_BY_LABEL: Record<string, BadgeTier> = {
  "CLEAN EATER": "green",
  RUNNER: "fire",
  IRON: "silver",
  MARATHON: "gold",
  SUNRISE: "bronze",
  KONSISTEN: "fire",
  "PROTEIN KING": "silver",
  CENTURY: "gold",
};
const tierOf = (label: string): BadgeTier => TIER_BY_LABEL[label] ?? "silver";

function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "??";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
}

function fmtDateID(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12))
    .toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .toUpperCase();
}

function km(m: number): string {
  return (m / 1000).toFixed(1);
}
function mins(sec: number): string {
  return `${Math.round(sec / 60)} mnt`;
}

/** "12 Jul 2026" — when a friendship started, or when a request was sent. */
function fmtSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function SocialHome() {
  const date = todayKey();
  const [social, setSocial] = useState<Social | null>(null);
  const [feed, setFeed] = useState<Day[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [scope, setScope] = useState<(typeof SCOPES)[number]["key"]>("friends");
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const load = useCallback(async () => {
    const [s, f, u] = await Promise.all([
      fetch("/api/social").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/social/feed?date=${date}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/social/username").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (s?.ok) setSocial(s.data);
    if (u?.ok) setMyUsername(u.data?.username ?? null);
    if (f?.ok) {
      setFeed(f.data.feed);
      setFeedError(false);
    } else {
      setFeed([]);
      setFeedError(true);
    }
  }, [date]);

  const loadBoard = useCallback(async () => {
    const r = await fetch(`/api/social/leaderboard?scope=${scope}&date=${date}`)
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    if (r?.ok) setBoard(r.data);
  }, [scope, date]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: !!data?.ok, message: data?.message as string | undefined };
  }

  async function followFromBoard(username: string | null) {
    if (!username) return;
    haptic("tap");
    const r = await post("/api/social/request", { username });
    flash(r.ok ? `Permintaan ke @${username} dikirim` : r.message ?? "Gagal");
    if (r.ok) {
      loadBoard();
      load();
    }
  }

  async function respond(p: Person, accept: boolean) {
    haptic("tap");
    const r = await post("/api/social/respond", { followId: p.followId, accept });
    if (r.ok) {
      flash(accept ? `${p.name} sekarang temanmu` : "Ditolak");
      load();
      loadBoard();
    } else flash(r.message ?? "Gagal");
  }

  async function removeFriend(p: Person) {
    haptic("tap");
    const r = await post("/api/social/unfollow", { userId: p.user.id });
    if (r.ok) {
      flash(`${p.name} dihapus`);
      load();
      loadBoard();
    } else flash(r.message ?? "Gagal");
  }

  const incoming = social?.incoming ?? [];
  const friends = social?.friends ?? [];
  const outgoing = social?.outgoing ?? [];
  const rows = board?.rows ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div
      style={{
        maxWidth: 520,
        margin: "0 auto",
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        fontFamily: SANS,
        background: "#050406",
      }}
    >
      {/* ── Floating header ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "calc(14px + env(safe-area-inset-top)) 18px 14px",
          background:
            "linear-gradient(180deg,rgba(5,4,6,.95),rgba(5,4,6,.55) 65%,transparent)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f1ede9", letterSpacing: ".3px", lineHeight: 1, whiteSpace: "nowrap" }}>
            Teman<span style={{ color: "#ee3c30" }}>.</span>
          </div>
          <div className="mono" style={{ fontSize: 10, fontWeight: 500, letterSpacing: "1.4px", color: "#f1ede9", marginTop: 5 }}>
            {fmtDateID(date)}
          </div>
        </div>
        {/* Adding someone is the whole point of this screen, so it gets a
            labelled button in the header rather than only a small pill in the
            corner and a CTA on the very last reel — which you could only reach
            by scrolling past every friend you already have. */}
        <button
          type="button"
          className="tm-tap mono"
          onClick={() => {
            haptic("tap");
            setSearchOpen(true);
          }}
          style={{
            flex: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 15px",
            borderRadius: 999,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: ".08em",
            color: "#fff",
            background: FIRE,
            border: "1px solid rgba(255,150,120,.6)",
            boxShadow: "0 6px 16px rgba(238,60,48,.4)",
            cursor: "pointer",
          }}
        >
          ＋ TAMBAH
        </button>
        <button
          type="button"
          className="tm-tap"
          onClick={() => setSearchOpen(true)}
          aria-label="Profil & permintaan masuk"
          style={{
            position: "relative",
            flex: "none",
            width: 36,
            height: 36,
            borderRadius: "50%",
            // Neutral now that TAMBAH TEMAN carries the fire — two fire
            // buttons side by side and neither reads as the primary one.
            background: "rgba(255,255,255,.07)",
            border: "1px solid rgba(255,255,255,.14)",
            color: "#cfc8c2",
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {myUsername ? myUsername.slice(0, 2).toUpperCase() : "??"}
          {incoming.length > 0 && (
            <span
              style={{
                position: "absolute",
                top: -3,
                right: -3,
                minWidth: 16,
                height: 16,
                borderRadius: 999,
                background: "#22c55e",
                color: "#062611",
                fontSize: 9,
                fontWeight: 800,
                display: "grid",
                placeItems: "center",
                border: "1.5px solid #050406",
              }}
            >
              {incoming.length}
            </span>
          )}
        </button>
      </div>

      <div className="tm-feed">
        {/* ══ REEL 0 · PAPAN PERINGKAT ══ */}
        <section
          className="tm-reel"
          style={{ background: "radial-gradient(700px 480px at 50% 12%,#26140f,#0a0708 58%,#050406)" }}
        >
          {/* scope switcher */}
          <div
            style={{
              display: "flex",
              gap: 5,
              marginBottom: 14,
              padding: 4,
              borderRadius: 13,
              background: "rgba(255,255,255,.05)",
              border: "1px solid rgba(255,255,255,.09)",
            }}
          >
            {SCOPES.map((s) => {
              const on = scope === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  className="tm-tap mono"
                  onClick={() => {
                    haptic("tap");
                    setScope(s.key);
                  }}
                  style={{
                    flex: 1,
                    padding: "9px 4px",
                    borderRadius: 10,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: ".08em",
                    cursor: "pointer",
                    border: "none",
                    color: on ? "#141011" : "#9a938d",
                    background: on ? "#f1ede9" : "transparent",
                  }}
                >
                  {s.key === "friends" ? "TEMAN" : board && board.scope === s.key ? board.scopeLabel : s.label}
                </button>
              );
            })}
          </div>

          <Podium rows={podium} />

          {/* ranks 4+ */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              scrollbarWidth: "none",
              display: "flex",
              flexDirection: "column",
              gap: 7,
              margin: "14px -2px 0",
              padding: "0 2px 46px",
            }}
          >
            {rest.length === 0 && podium.length > 0 && (
              <div className="mono" style={{ fontSize: 10, color: "#6a6660", textAlign: "center", padding: "10px 0" }}>
                {board && board.total <= 3
                  ? `Baru ${board.total} orang di papan ini — ajak temanmu.`
                  : ""}
              </div>
            )}
            {rest.map((r) => (
              <BoardRow key={r.userId} row={r} onFollow={() => followFromBoard(r.username)} />
            ))}
            {board && board.total === 0 && (
              <div className="mono" style={{ fontSize: 11, color: "#7c736e", textAlign: "center", padding: "18px 0" }}>
                Belum ada yang catat hari ini.
              </div>
            )}
          </div>

          {/* scroll cue */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 12,
              zIndex: 6,
              display: "grid",
              placeItems: "center",
              width: 30,
              height: 30,
              borderRadius: "50%",
              fontSize: 15,
              color: "#fff",
              textShadow: "0 2px 4px rgba(120,15,5,.6)",
              background: "linear-gradient(180deg,#ff9d6b,#ee3c30 52%,#a8180c)",
              border: "1px solid rgba(255,180,150,.7)",
              boxShadow: "inset 0 2px 1px rgba(255,235,220,.6),0 3px 0 #7a1408,0 8px 16px rgba(238,60,48,.5)",
              animation: "tm-arrowbounce 1.5s cubic-bezier(.34,1.56,.64,1) infinite",
              pointerEvents: "none",
            }}
          >
            ↓
          </div>
        </section>

        {/* ══ REEL 1 · DAFTAR TEMAN ══ */}
        <FriendsReel
          friends={friends}
          incoming={incoming}
          outgoing={outgoing}
          onRespond={respond}
          onRemove={removeFriend}
          onOpenSearch={() => setSearchOpen(true)}
        />

        {/* ══ FRIEND REELS ══ */}
        {(feed ?? []).map((d, i) => (
          <FriendReel key={d.user.id} day={d} rank={i + 1} me={feedMe(feed)} />
        ))}

        {/* ══ INVITE REEL ══ */}
        <section
          className="tm-reel"
          style={{
            background: "radial-gradient(600px 400px at 50% 40%,#1c1210,#0a0708 60%,#050406)",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f1ede9", marginTop: 14 }}>
            Makin rame, makin susah bolos
          </div>
          <div className="mono" style={{ fontSize: 11, color: "#8a837d", marginTop: 8, lineHeight: 1.6, maxWidth: 280 }}>
            {feedError
              ? "Feed gagal dimuat — cek koneksi."
              : (feed?.length ?? 0) === 0
              ? "Kamu belum punya teman di sini. Cari @username temanmu."
              : "Ajak lebih banyak orang biar papan peringkatnya hidup."}
          </div>
          <button
            type="button"
            className="tm-tap mono"
            onClick={() => setSearchOpen(true)}
            style={{
              marginTop: 22,
              padding: "14px 22px",
              borderRadius: 999,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "1px",
              background: FIRE,
              border: "1px solid rgba(255,150,120,.6)",
              cursor: "pointer",
              animation: "wo-firepulse 2.4s ease-in-out infinite",
            }}
          >
            ＋ CARI @USERNAME
          </button>
          <button
            type="button"
            className="tm-tap mono"
            onClick={async () => {
              const url = typeof window !== "undefined" ? window.location.origin : "";
              try {
                if (navigator.share) await navigator.share({ title: "R2·FIT", url });
                else {
                  await navigator.clipboard.writeText(url);
                  flash("Link undangan disalin");
                }
              } catch {
                /* dismissed */
              }
            }}
            style={{
              marginTop: 11,
              padding: "13px 20px",
              borderRadius: 999,
              color: "#cfc8c2",
              fontSize: 11,
              letterSpacing: "1px",
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.14)",
              cursor: "pointer",
            }}
          >
            ↗ BAGIKAN LINK UNDANGAN
          </button>
        </section>
      </div>

      {toast && (
        <div
          className="mono"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 78,
            zIndex: 60,
            transform: "translateX(-50%)",
            padding: "11px 16px",
            borderRadius: 999,
            fontSize: 11,
            color: "#fff",
            background: FIRE,
            border: "1px solid rgba(255,150,120,.6)",
            boxShadow: "0 10px 26px rgba(238,60,48,.5)",
            animation: "tm-toastin .28s cubic-bezier(.34,1.56,.64,1)",
            whiteSpace: "nowrap",
          }}
        >
          {toast}
        </div>
      )}

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          myUsername={myUsername}
          setMyUsername={setMyUsername}
          social={social}
          reload={() => {
            load();
            loadBoard();
          }}
          flash={flash}
        />
      )}
    </div>
  );
}

/** The viewer's own day, used for the tug-of-war comparison. The feed only
 *  contains friends, so "me" is derived from the leaderboard's detail instead;
 *  when unavailable the comparison rows simply don't render. */
function feedMe(feed: Day[] | null): Day | null {
  void feed;
  return null;
}

// ── Podium ──────────────────────────────────────────────────────────────────

function Podium({ rows }: { rows: Row[] }) {
  const [p1, p2, p3] = [rows[0], rows[1], rows[2]];
  if (!p1) {
    return (
      <div className="mono" style={{ fontSize: 11, color: "#7c736e", textAlign: "center", padding: "40px 0" }}>
        Belum ada skor hari ini.
      </div>
    );
  }
  return (
    <div style={{ position: "relative", paddingTop: 6 }}>
      {/* spotlight cone */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -70,
          left: "50%",
          width: 210,
          height: 250,
          background:
            "conic-gradient(from 180deg at 50% 0%,transparent 42%,rgba(255,190,120,.22) 50%,transparent 58%)",
          filter: "blur(6px)",
          animation: "tm-beam 3.6s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", alignItems: "end", gap: 10 }}>
        <Pedestal row={p2} place={2} />
        <Pedestal row={p1} place={1} />
        <Pedestal row={p3} place={3} />
      </div>
      <div style={{ height: 2, background: "linear-gradient(90deg,transparent,rgba(255,200,140,.4),transparent)" }} />
    </div>
  );
}

const PED = {
  1: {
    tone: "gold" as const,
    topH: 18,
    pad: "17px 6px 46px",
    top: "linear-gradient(178deg,#fffaea 0%,#f4d089 46%,#c8933b 100%)",
    face:
      "linear-gradient(180deg,rgba(255,252,240,.28),rgba(255,255,255,0) 26%,rgba(60,34,2,.34) 100%),linear-gradient(90deg,#7a5210 0%,#b8862c 20%,#e9cb8c 44%,#cfa24e 60%,#96671a 84%,#6b4810 100%)",
    shadow:
      "inset 0 2px 1px rgba(255,250,230,.55),inset 0 -1px 0 rgba(60,34,2,.55),inset 10px 0 22px -8px rgba(60,34,2,.45),inset -10px 0 22px -8px rgba(60,34,2,.45)",
    drop: "drop-shadow(0 10px 12px rgba(0,0,0,.5)) drop-shadow(0 22px 34px rgba(120,60,0,.42))",
    delay: "0s",
    avatar: 72,
  },
  2: {
    tone: "silver" as const,
    topH: 15,
    pad: "14px 6px 30px",
    top: "linear-gradient(178deg,#fbfdff 0%,#b6c0c8 46%,#848e96 100%)",
    face:
      "linear-gradient(180deg,rgba(255,255,255,.3),rgba(255,255,255,0) 26%,rgba(0,0,0,.36) 100%),linear-gradient(90deg,#5b656d 0%,#8f9aa3 20%,#cad3da 44%,#9ba6ae 60%,#6d777f 84%,#4f585f 100%)",
    shadow:
      "inset 0 2px 1px rgba(255,255,255,.6),inset 0 -1px 0 rgba(0,0,0,.5),inset 10px 0 22px -8px rgba(0,0,0,.4),inset -10px 0 22px -8px rgba(0,0,0,.4)",
    drop: "drop-shadow(0 8px 10px rgba(0,0,0,.48)) drop-shadow(0 18px 26px rgba(0,0,0,.3))",
    delay: ".1s",
    avatar: 54,
  },
  3: {
    tone: "bronze" as const,
    topH: 14,
    pad: "12px 6px 22px",
    top: "linear-gradient(178deg,#fff0e2 0%,#dfab80 46%,#a56c36 100%)",
    face:
      "linear-gradient(180deg,rgba(255,240,225,.26),rgba(255,255,255,0) 26%,rgba(44,22,4,.36) 100%),linear-gradient(90deg,#74441a 0%,#ab7440 20%,#e3ba91 44%,#b8814b 60%,#8a561f 84%,#5f3812 100%)",
    shadow:
      "inset 0 2px 1px rgba(255,242,228,.5),inset 0 -1px 0 rgba(44,22,4,.5),inset 10px 0 22px -8px rgba(44,22,4,.42),inset -10px 0 22px -8px rgba(44,22,4,.42)",
    drop: "drop-shadow(0 8px 10px rgba(0,0,0,.48)) drop-shadow(0 18px 26px rgba(0,0,0,.3))",
    delay: ".2s",
    avatar: 52,
  },
};

function Pedestal({ row, place }: { row: Row | undefined; place: 1 | 2 | 3 }) {
  const c = PED[place];
  if (!row) return <div />;
  const inner = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
      {place === 1 && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ position: "absolute", top: 8, left: "14%", fontSize: 9, color: "#ffe19a", animation: "tm-sparkle 2.2s ease-in-out .2s infinite" }}>✦</div>
          <div style={{ position: "absolute", top: 14, right: "10%", fontSize: 8, color: "#fff3cf", animation: "tm-sparkle 2.6s ease-in-out 1.1s infinite" }}>✦</div>
        </div>
      )}
      <div
        style={{
          position: "relative",
          animation: `tm-avatarpop .65s cubic-bezier(.34,1.56,.64,1) ${place === 1 ? ".05s" : place === 2 ? ".18s" : ".28s"} both`,
        }}
      >
        {place === 1 && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 104,
              height: 104,
              borderRadius: "50%",
              background: "radial-gradient(circle,rgba(255,180,90,.45),transparent 68%)",
              animation: "tm-haloglow 2.8s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
        )}
        <div
          style={{
            position: "relative",
            width: c.avatar,
            height: c.avatar,
            borderRadius: "50%",
            background:
              place === 1
                ? "linear-gradient(160deg,#fff6d8,#f0a53c 46%,#8a5410)"
                : place === 2
                ? "linear-gradient(160deg,#eef3f7,#98a4ae 52%,#5c666e)"
                : "linear-gradient(160deg,#f0c49a,#cf9463 52%,#8d5828)",
            padding: place === 1 ? 2.5 : 2,
            boxShadow:
              place === 1
                ? "0 14px 34px rgba(200,120,20,.6)"
                : place === 2
                ? "0 8px 22px rgba(120,135,150,.45)"
                : "0 8px 22px rgba(150,95,45,.45)",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background: place === 1 ? FIRE : "#1a1517",
              display: "grid",
              placeItems: "center",
              fontFamily: MONO,
              fontSize: place === 1 ? 19 : 15,
              fontWeight: 700,
              color: place === 1 ? "#fff" : place === 2 ? "#e8eef4" : "#f0d5bd",
            }}
          >
            {row.initials}
          </div>
        </div>
      </div>

      {/* the block */}
      <div
        style={{
          width: "100%",
          transformOrigin: "bottom",
          animation: `tm-podrise .75s cubic-bezier(.22,.61,.36,1) ${c.delay} both`,
          filter: c.drop,
        }}
      >
        {/* angled top face — reads as a horizontal plane */}
        <div style={{ height: c.topH, clipPath: "polygon(9% 0,91% 0,100% 100%,0 100%)", background: c.top }} />
        <div style={{ position: "relative", padding: c.pad, textAlign: "center", background: c.face, boxShadow: c.shadow }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <span style={carved(c.tone, place === 1 ? 12 : 10.5, 900, place === 1 ? 3 : 1.8)}>
              {row.name.split(/\s+/)[0].toUpperCase()}
            </span>
          </div>
          <div style={{ ...carved(c.tone, place === 1 ? 22 : 18, 900, 1), marginTop: 7 }}>{row.score}</div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10, maxWidth: 120, marginLeft: "auto", marginRight: "auto" }}>
            {row.badges.slice(0, 2).map((b) => (
              <span key={b} style={carved(c.tone, 6.5, 700, 1)}>
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return row.username ? (
    <Link href={`/social/${row.username}`} style={{ textDecoration: "none" }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

function BoardRow({ row, onFollow }: { row: Row; onFollow: () => void }) {
  const body = (
    <>
      <span className="mono" style={{ flex: "none", width: 26, textAlign: "center", fontSize: 13, fontWeight: 700, color: row.isMe ? "#ff8a72" : "#cfc8c2" }}>
        {row.score}
      </span>
      <span
        style={{
          flex: "none",
          width: 32,
          height: 32,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 700,
          color: "#fff",
          background: row.isMe ? FIRE : "rgba(255,255,255,.07)",
          border: "1px solid rgba(255,255,255,.12)",
        }}
      >
        {row.initials}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#f1ede9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.name}
          </span>
          {row.badges.slice(0, 3).map((b) => (
            <span key={b} style={badgeStyle(tierOf(b), "xs")}>
              {b}
            </span>
          ))}
        </span>
        <span className="mono" style={{ display: "block", fontSize: 8.5, color: "#7c736e", marginTop: 4 }}>
          {row.detail ?? `#${row.rank}`}
        </span>
      </span>
      {row.isMe ? (
        <span className="mono" style={{ flex: "none", fontSize: 8.5, letterSpacing: ".1em", color: "#ff8a72", fontWeight: 700 }}>KAMU</span>
      ) : row.isFriend ? (
        <span style={{ flex: "none", fontSize: 12, color: "#22c55e" }}>✓</span>
      ) : (
        <button
          type="button"
          className="mono tm-tap"
          onClick={(e) => {
            e.preventDefault();
            onFollow();
          }}
          style={{
            flex: "none",
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: ".08em",
            color: "#fff",
            background: FIRE,
            border: "1px solid rgba(255,150,120,.5)",
            borderRadius: 999,
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          ＋ TAMBAH
        </button>
      )}
    </>
  );

  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 13,
    textDecoration: "none",
    background: row.isMe ? "rgba(238,60,48,.1)" : "rgba(255,255,255,.035)",
    border: row.isMe ? "1px solid rgba(255,150,120,.4)" : "1px solid rgba(255,255,255,.08)",
  };

  return row.username && !row.isMe && row.isFriend ? (
    <Link href={`/social/${row.username}`} className="tm-tap" style={style}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
}

// ── Friend list reel ────────────────────────────────────────────────────────
//
// Who you're actually friends with — the list the app never had. Before this,
// /api/social returned `following`/`followers`/`incoming`/`outgoing` and the
// page read exactly one of them (`incoming`, inside a modal). So you could
// accept someone and then find no trace of them anywhere: not on the board
// (that read the graph one way round), not in a list (there wasn't one).
//
// It's a reel rather than another thing buried in the TAMBAH sheet because
// "who are my friends" is a question you ask on the way past, not a setup step.

function FriendsReel({
  friends,
  incoming,
  outgoing,
  onRespond,
  onRemove,
  onOpenSearch,
}: {
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
  onRespond: (p: Person, accept: boolean) => void;
  onRemove: (p: Person) => void;
  onOpenSearch: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <section
      className="tm-reel"
      style={{ background: "radial-gradient(620px 420px at 50% 8%,#1a1512,#0a0708 58%,#050406)", overflowY: "auto" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#f1ede9" }}>Temanmu</span>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, ...FIRE_TEXT }}>
          {friends.length}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 9.5, letterSpacing: ".1em", color: "#7c736e", marginBottom: 14 }}>
        SALING LIHAT CATATAN HARIAN
      </div>

      {/* Requests waiting on you — first, because they're the only thing here
          that needs a decision. */}
      {incoming.length > 0 && (
        <>
          <div className="mono" style={{ fontSize: 9, letterSpacing: ".16em", color: "#ffb99e", margin: "0 0 9px" }}>
            PERMINTAAN MASUK · {incoming.length}
          </div>
          {incoming.map((p) => (
            <div
              key={p.followId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 12px",
                borderRadius: 14,
                background: "rgba(238,60,48,.08)",
                border: "1px solid rgba(255,150,120,.4)",
                marginBottom: 8,
              }}
            >
              <Avatar name={p.name} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#f1ede9" }}>{p.name}</span>
                <span className="mono" style={{ display: "block", fontSize: 9, color: "#8a837d", marginTop: 3 }}>
                  {p.user.username ? `@${p.user.username}` : fmtSince(p.since)}
                </span>
              </span>
              <button type="button" className="mono tm-tap" style={pill} onClick={() => onRespond(p, true)}>
                TERIMA
              </button>
              <button type="button" className="mono tm-tap" style={ghost} onClick={() => onRespond(p, false)}>
                TOLAK
              </button>
            </div>
          ))}
          <div style={{ height: 14 }} />
        </>
      )}

      {friends.length === 0 && incoming.length === 0 && outgoing.length === 0 ? (
        <div
          style={{
            padding: "24px 18px",
            borderRadius: 16,
            border: "1.5px dashed rgba(238,60,48,.35)",
            background: "rgba(238,60,48,.05)",
            textAlign: "center",
          }}
        >
          <div className="mono" style={{ fontSize: 11, color: "#ffb99e", lineHeight: 1.7 }}>
            Belum ada teman di sini.
            <br />
            Cari @username temannya, atau bagikan linknya.
          </div>
          <button
            type="button"
            className="mono tm-tap"
            onClick={onOpenSearch}
            style={{ ...pill, marginTop: 14, padding: "11px 18px", fontSize: 10.5 }}
          >
            ＋ TAMBAH TEMAN
          </button>
        </div>
      ) : (
        friends.map((p) => {
          const armed = confirming === p.user.id;
          const row = (
            <>
              <Avatar name={p.name} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "#f1ede9",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.name}
                </span>
                <span className="mono" style={{ display: "block", fontSize: 9, color: "#7c736e", marginTop: 3 }}>
                  {p.user.username ? `@${p.user.username} · ` : ""}
                  teman sejak {fmtSince(p.since)}
                </span>
              </span>
            </>
          );
          // HAPUS lives INSIDE the card, so a friend row is exactly as wide as
          // a request row. It can't go inside the Link (nesting a button in an
          // anchor is invalid), hence the card is a div wrapping both.
          const inner: CSSProperties = {
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: 1,
            minWidth: 0,
            textDecoration: "none",
          };
          return (
            <div
              key={p.followId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 12px",
                borderRadius: 14,
                marginBottom: 8,
                background: "rgba(255,255,255,.035)",
                border: "1px solid rgba(255,255,255,.09)",
              }}
            >
              {p.user.username ? (
                <Link href={`/social/${p.user.username}`} className="tm-tap" style={inner}>
                  {row}
                </Link>
              ) : (
                <div style={inner}>{row}</div>
              )}
              {/* Two taps to remove — one stray thumb shouldn't undo a friendship. */}
              <button
                type="button"
                className="mono tm-tap"
                onClick={() => {
                  if (armed) {
                    onRemove(p);
                    setConfirming(null);
                  } else {
                    haptic("tap");
                    setConfirming(p.user.id);
                  }
                }}
                onBlur={() => setConfirming((c) => (c === p.user.id ? null : c))}
                style={{
                  ...ghost,
                  color: armed ? "#fff" : "#6a6660",
                  background: armed ? "rgba(238,60,48,.9)" : "rgba(255,255,255,.04)",
                  border: armed ? "1px solid rgba(255,150,120,.6)" : "1px solid rgba(255,255,255,.1)",
                }}
              >
                {armed ? "YAKIN?" : "HAPUS"}
              </button>
            </div>
          );
        })
      )}

      {outgoing.length > 0 && (
        <>
          <div className="mono" style={{ fontSize: 9, letterSpacing: ".16em", color: "#7c736e", margin: "14px 0 9px" }}>
            MENUNGGU DITERIMA · {outgoing.length}
          </div>
          {outgoing.map((p) => (
            <div
              key={p.followId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 12px",
                borderRadius: 14,
                background: "rgba(255,255,255,.025)",
                border: "1px dashed rgba(255,255,255,.14)",
                marginBottom: 8,
              }}
            >
              <Avatar name={p.name} dim />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#9a938d" }}>{p.name}</span>
                <span className="mono" style={{ display: "block", fontSize: 9, color: "#6a6660", marginTop: 3 }}>
                  dikirim {fmtSince(p.since)}
                </span>
              </span>
              <span className="mono" style={{ flex: "none", fontSize: 9, letterSpacing: ".1em", color: "#ffb99e" }}>
                MENUNGGU
              </span>
            </div>
          ))}
        </>
      )}

      {(friends.length > 0 || outgoing.length > 0) && (
        <button
          type="button"
          className="mono tm-tap"
          onClick={onOpenSearch}
          style={{
            width: "100%",
            marginTop: 6,
            marginBottom: 40,
            padding: 13,
            borderRadius: 14,
            fontSize: 10.5,
            letterSpacing: ".08em",
            color: "#ffb99e",
            background: "rgba(238,60,48,.06)",
            border: "1.5px dashed rgba(238,60,48,.4)",
            cursor: "pointer",
          }}
        >
          ＋ TAMBAH TEMAN LAGI
        </button>
      )}
    </section>
  );
}

function Avatar({ name, dim = false }: { name: string; dim?: boolean }) {
  return (
    <span
      style={{
        flex: "none",
        width: 32,
        height: 32,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 700,
        color: dim ? "#8a837d" : "#f1ede9",
        background: "rgba(255,255,255,.07)",
        border: "1px solid rgba(255,255,255,.12)",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

// ── Friend reel ─────────────────────────────────────────────────────────────

function FriendReel({ day, rank, me }: { day: Day; rank: number; me: Day | null }) {
  void me;
  const machines = day.workouts.reduce((a, w) => a + w.machines, 0);
  const logged = day.kcal > 0 || day.workouts.length > 0 || day.cardio.length > 0;
  return (
    <section
      className="tm-reel"
      style={{ background: "radial-gradient(600px 420px at 50% 10%,#1a1210,#0a0708 58%,#050406)", overflowY: "auto" }}
    >
      <div
        aria-hidden="true"
        style={{ position: "absolute", top: 56, right: 10, fontSize: 150, fontWeight: 800, lineHeight: 1, color: "rgba(255,255,255,.035)", letterSpacing: "-6px" }}
      >
        {rank}
      </div>

      {/* identity */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative", flex: "none" }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: FIRE,
              border: "2px solid rgba(255,180,150,.6)",
              display: "grid",
              placeItems: "center",
              fontFamily: MONO,
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {initialsOf(day.name)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#f1ede9", lineHeight: 1.1 }}>{day.name}</div>
          {day.user.username && (
            <div className="mono" style={{ fontSize: 10, letterSpacing: ".5px", color: "#8a837d", marginTop: 4 }}>
              @{day.user.username}
            </div>
          )}
        </div>
        {day.user.username && (
          <Link
            href={`/social/${day.user.username}`}
            className="tm-lihat mono"
            style={{
              position: "relative",
              overflow: "hidden",
              flex: "none",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "1px",
              color: "#fff",
              textDecoration: "none",
              textShadow: "0 1px 2px rgba(120,15,5,.6)",
              background: "linear-gradient(180deg,#ff9d6b,#ee3c30 52%,#a8180c)",
              border: "1px solid rgba(255,180,150,.7)",
              borderTopColor: "rgba(255,225,205,.9)",
              borderRadius: 999,
              padding: "9px 15px",
              boxShadow:
                "inset 0 2px 1px rgba(255,235,220,.75),inset 0 -3px 4px rgba(120,15,5,.5),0 5px 0 #7a1408,0 9px 18px rgba(238,60,48,.55)",
              animation: "tm-lihatbob 5s cubic-bezier(.33,.9,.4,1) infinite",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 34,
                height: "100%",
                background: "linear-gradient(90deg,rgba(255,255,255,.55),transparent)",
                animation: "tm-lihatshine 5s ease-in-out infinite",
              }}
            />
            LIHAT →
          </Link>
        )}
      </div>

      {!logged ? (
        <div
          className="mono"
          style={{
            marginTop: 22,
            padding: "26px 18px",
            borderRadius: 16,
            textAlign: "center",
            fontSize: 11,
            lineHeight: 1.7,
            color: "#6a6660",
            background: "rgba(255,255,255,.025)",
            border: "1px dashed rgba(255,255,255,.1)",
          }}
        >
          belum latihan · belum catat apa-apa
        </div>
      ) : (
        <>
          {/* hero tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
            <Tile label="KALORI" value={day.kcal.toLocaleString("id-ID")} />
            <Tile label="MESIN" value={String(machines)} />
          </div>

          {/* macro strip */}
          <div
            className="mono"
            style={{
              display: "flex",
              gap: 14,
              marginTop: 10,
              padding: "10px 13px",
              borderRadius: 12,
              background: "rgba(255,255,255,.035)",
              border: "1px solid rgba(255,255,255,.08)",
              fontSize: 11.5,
            }}
          >
            <span><span style={{ color: "#5fe39a" }}>{day.protein}</span><span style={{ color: "#6a6660" }}>p</span></span>
            <span><span style={{ color: "#9a938d" }}>{day.carbs}</span><span style={{ color: "#6a6660" }}>c</span></span>
            <span><span style={{ color: "#9a938d" }}>{day.fat}</span><span style={{ color: "#6a6660" }}>f</span></span>
            <span><span style={{ color: "#ffb99e" }}>{day.sugar}</span><span style={{ color: "#6a6660" }}>g gula</span></span>
          </div>

          {/* sessions */}
          {day.workouts.map((w, i) => (
            <div
              key={`w${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 10,
                padding: "11px 13px",
                borderRadius: 13,
                background: "linear-gradient(90deg,rgba(238,60,48,.1),transparent)",
                border: "1px solid rgba(255,150,120,.25)",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#f1ede9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {w.exercises.length > 0 ? w.exercises.join(", ") : w.sessionType}
                </span>
                <span className="mono" style={{ display: "block", fontSize: 8.5, color: "#8a837d", marginTop: 3 }}>
                  {w.machines} MESIN{w.location ? ` · ${w.location}` : ""}
                </span>
              </span>
            </div>
          ))}
          {day.cardio.map((c, i) => (
            <div
              key={`c${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 10,
                padding: "11px 13px",
                borderRadius: 13,
                background: "rgba(255,255,255,.035)",
                border: "1px solid rgba(255,255,255,.09)",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#f1ede9", textTransform: "capitalize" }}>
                  {c.kind}
                </span>
                <span className="mono" style={{ display: "block", fontSize: 8.5, color: "#8a837d", marginTop: 3 }}>
                  {c.distanceM > 0 ? `${km(c.distanceM)} km · ` : ""}
                  {mins(c.durationSec)}
                  {c.location ? ` · ${c.location}` : ""}
                </span>
              </span>
            </div>
          ))}

          {/* meals */}
          {day.meals.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14, paddingBottom: 10 }}>
              {day.meals.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
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
        </>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "14px 14px 12px",
        borderRadius: 15,
        background: "rgba(255,255,255,.035)",
        border: "1px solid rgba(255,255,255,.09)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 800, color: "#f1ede9", lineHeight: 1 }}>{value}</div>
      <div className="mono" style={{ fontSize: 8.5, letterSpacing: "2px", color: "#7c736e", marginTop: 7 }}>{label}</div>
    </div>
  );
}

// ── Search / setup modal ────────────────────────────────────────────────────

function SearchModal({
  onClose,
  myUsername,
  setMyUsername,
  social,
  reload,
  flash,
}: {
  onClose: () => void;
  myUsername: string | null;
  setMyUsername: (u: string | null) => void;
  social: Social | null;
  reload: () => void;
  flash: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState(myUsername ?? "");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: !!data?.ok, message: data?.message as string | undefined };
  }

  async function claim() {
    const err = usernameError(draft);
    if (err) return setMsg({ kind: "err", text: err });
    setBusy(true);
    const r = await post("/api/social/username", { username: draft });
    setBusy(false);
    if (r.ok) {
      setMyUsername(normalizeUsername(draft));
      setMsg({ kind: "ok", text: "Username aktif." });
      haptic("success");
      reload();
    } else setMsg({ kind: "err", text: r.message ?? "Gagal." });
  }

  const term = normalizeUsername(q);
  const incoming = social?.incoming ?? [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(4,3,5,.74)",
        backdropFilter: "blur(9px)",
        WebkitBackdropFilter: "blur(9px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "calc(52px + env(safe-area-inset-top)) 16px 16px",
        animation: "wo-fadein .2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          maxHeight: "84%",
          overflowY: "auto",
          borderRadius: 26,
          padding: "18px 16px 20px",
          background: "linear-gradient(180deg,rgba(46,34,31,.5),rgba(14,12,13,.42))",
          backdropFilter: "blur(30px) saturate(1.5)",
          WebkitBackdropFilter: "blur(30px) saturate(1.5)",
          border: "1px solid rgba(255,255,255,.18)",
          boxShadow: "0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.22)",
          animation: "wo-popin .34s cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        {/* your handle */}
        <div className="mono" style={{ fontSize: 9, letterSpacing: ".16em", color: "#7c736e", marginBottom: 9 }}>
          USERNAME KAMU
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#ff8a72" }}>@</span>
          <input
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="richie"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setMsg(null);
            }}
            className="mono"
            style={{
              flex: 1,
              minWidth: 0,
              background: "rgba(0,0,0,.3)",
              border: "1px solid rgba(255,255,255,.14)",
              borderRadius: 12,
              padding: "11px 13px",
              color: "#f1ede9",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button type="button" onClick={claim} disabled={busy || !draft.trim()} className="mono tm-tap" style={{ ...pill, opacity: busy || !draft.trim() ? 0.5 : 1 }}>
            SIMPAN
          </button>
        </div>
        {msg && (
          <div className="mono" style={{ fontSize: 10.5, marginTop: 7, color: msg.kind === "ok" ? "#5fe39a" : "#ff9a80" }}>
            {msg.text}
          </div>
        )}

        {/* incoming requests */}
        {incoming.length > 0 && (
          <>
            <div className="mono" style={{ fontSize: 9, letterSpacing: ".16em", color: "#ffb99e", margin: "18px 0 9px" }}>
              PERMINTAAN MASUK · {incoming.length}
            </div>
            {incoming.map((p) => (
              <div key={p.followId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 13, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,150,120,.35)", marginBottom: 7 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: "#f1ede9" }}>{p.name}</span>
                <button
                  type="button"
                  className="mono tm-tap"
                  onClick={async () => {
                    await post("/api/social/respond", { followId: p.followId, accept: true });
                    reload();
                    flash("Diterima");
                  }}
                  style={pill}
                >
                  TERIMA
                </button>
                <button
                  type="button"
                  className="mono tm-tap"
                  onClick={async () => {
                    await post("/api/social/respond", { followId: p.followId, accept: false });
                    reload();
                  }}
                  style={ghost}
                >
                  TOLAK
                </button>
              </div>
            ))}
          </>
        )}

        {/* search */}
        <div className="mono" style={{ fontSize: 9, letterSpacing: ".16em", color: "#7c736e", margin: "18px 0 9px" }}>
          CARI TEMAN
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#ff8a72" }}>@</span>
          <input
            autoFocus
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
              background: "rgba(0,0,0,.3)",
              border: "1px solid rgba(255,150,120,.3)",
              borderRadius: 12,
              padding: "11px 13px",
              color: "#f1ede9",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
          {searching && <div className="mono" style={{ fontSize: 10.5, color: "#7c736e" }}>mencari…</div>}
          {hits.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 13, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#f1ede9" }}>{h.name}</span>
                <span className="mono" style={{ display: "block", fontSize: 9.5, color: "#8a837d", marginTop: 3 }}>@{h.username}</span>
              </span>
              {h.status === "ACCEPTED" ? (
                <span className="mono" style={{ fontSize: 9.5, color: "#5fe39a" }}>TEMAN</span>
              ) : h.status === "PENDING" ? (
                <span className="mono" style={{ fontSize: 9.5, color: "#ffb99e" }}>MENUNGGU</span>
              ) : (
                <button
                  type="button"
                  className="mono tm-tap"
                  onClick={async () => {
                    const r = await post("/api/social/request", { username: h.username });
                    if (r.ok) {
                      setHits((hs) => hs.map((x) => (x.id === h.id ? { ...x, status: "PENDING" } : x)));
                      reload();
                      flash("Permintaan dikirim");
                    } else setMsg({ kind: "err", text: r.message ?? "Gagal." });
                  }}
                  style={pill}
                >
                  ＋ TAMBAH
                </button>
              )}
            </div>
          ))}

          {!searching && term.length >= 2 && hits.length === 0 && (
            <div
              style={{
                padding: 14,
                borderRadius: 14,
                border: "1.5px dashed rgba(238,60,48,.4)",
                background: "rgba(238,60,48,.06)",
                textAlign: "center",
              }}
            >
              <div className="mono" style={{ fontSize: 10.5, color: "#ffb99e", lineHeight: 1.6 }}>
                Nggak ada @{term} di R2·FIT — ajak dia gabung
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="mono tm-tap"
          onClick={async () => {
            const url = typeof window !== "undefined" ? window.location.origin : "";
            try {
              if (navigator.share) await navigator.share({ title: "R2·FIT", url });
              else {
                await navigator.clipboard.writeText(url);
                flash("Link undangan disalin");
              }
            } catch {
              /* dismissed */
            }
          }}
          style={{
            width: "100%",
            marginTop: 14,
            padding: 13,
            borderRadius: 13,
            fontSize: 10.5,
            letterSpacing: ".08em",
            color: "#cfc8c2",
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.14)",
            cursor: "pointer",
          }}
        >
          Nggak nemu temanmu? Bagikan link ↗
        </button>
      </div>
    </div>
  );
}

const pill: CSSProperties = {
  flex: "none",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: ".08em",
  color: "#fff",
  background: FIRE,
  border: "1px solid rgba(255,150,120,.5)",
  borderRadius: 999,
  padding: "9px 13px",
  cursor: "pointer",
};
const ghost: CSSProperties = {
  flex: "none",
  fontSize: 9.5,
  letterSpacing: ".08em",
  color: "#9a938d",
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 999,
  padding: "9px 11px",
  cursor: "pointer",
};
