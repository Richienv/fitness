"use client";

// A friend's profile: HARI INI (calorie ring, meals, sessions, badges) and
// MINGGU INI (tiles, metric-switchable chart, selected-day stats).
//
// Everything here is gated server-side by `canView` — a non-friend gets a 403
// with only the public identity, which renders the locked state below.

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { todayKey } from "@/lib/targets";
import { badgeStyle } from "../metal";
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
type Meal = { id: string; mealType: string; kcal: number; items: string[]; photoUrl: string | null };
type Workout = { sessionType: string; totalVolume: number; machines: number; location: string | null; exercises: string[] };
type Cardio = { kind: string; distanceM: number; durationSec: number; location: string | null };
type Day = {
  user: PubUser; name: string; kcal: number; protein: number; carbs: number; fat: number; sugar: number;
  meals: Meal[]; workouts: Workout[]; cardio: Cardio[];
};
type WeekDay = { date: string; kcal: number; protein: number; machines: number; reps: number; beban: number; steps: number; distanceM: number; sessions: number };
type Badge = { key: string; label: string; tier: BadgeTier; milestone: string; progress: number; target: number; unit: string; earned: boolean };
type Data = {
  user: PubUser; name: string; date: string; today: Day | null;
  score: { total: number } | null;
  targets: { kcal: number; protein: number };
  week: WeekDay[];
  weekly: { avgKcal: number; totalMachines: number; avgProtein: number; consistency: number };
  badges: Badge[];
};

const MEAL_LABEL: Record<string, string> = {
  breakfast: "SARAPAN", lunch: "SIANG", snack: "SNACK", dinner: "MALAM",
};
const METRICS = [
  { key: "kcal", label: "KALORI" },
  { key: "machines", label: "MESIN" },
  { key: "reps", label: "REPS" },
  { key: "beban", label: "BEBAN" },
] as const;
type Metric = (typeof METRICS)[number]["key"];

const DOW = ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"];
function dowOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return DOW[new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)).getUTCDay()];
}

export default function ProfilePage({ username }: { username: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [locked, setLocked] = useState<{ name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"today" | "week">("today");
  const [metric, setMetric] = useState<Metric>("kcal");
  const [selected, setSelected] = useState<number>(6);
  const [showBadges, setShowBadges] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/social/profile?username=${encodeURIComponent(username)}&date=${todayKey()}`);
    const j = await res.json().catch(() => null);
    if (j?.ok) {
      setData(j.data);
      setLocked(null);
      setErr(null);
    } else if (res.status === 403) {
      setLocked({ name: j?.data?.name ?? username });
    } else {
      setErr(j?.message ?? "Gagal memuat profil.");
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const shell: CSSProperties = {
    maxWidth: 520,
    margin: "0 auto",
    minHeight: "100dvh",
    fontFamily: SANS,
    background: "radial-gradient(1100px 700px at 50% -8%, #17100f 0%, #0a0809 42%, #050406 100%)",
    padding: "calc(18px + env(safe-area-inset-top)) 18px calc(90px + env(safe-area-inset-bottom))",
  };

  if (locked) {
    return (
      <main style={shell}>
        <Back />
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#f1ede9", marginTop: 14 }}>{locked.name}</div>
          <div className="mono" style={{ fontSize: 11, color: "#8a837d", marginTop: 8, lineHeight: 1.6 }}>
            Kamu belum bisa lihat harinya.
            <br />
            Dia harus terima permintaanmu dulu.
          </div>
        </div>
      </main>
    );
  }
  if (err) {
    return (
      <main style={shell}>
        <Back />
        <div className="mono" style={{ fontSize: 11, color: "#ff9a80", marginTop: 30 }}>{err}</div>
      </main>
    );
  }
  if (!data) {
    return (
      <main style={shell}>
        <Back />
        <div className="mono" style={{ fontSize: 11, color: "#7c736e", marginTop: 30 }}>Memuat…</div>
      </main>
    );
  }

  const t = data.today;
  const earned = data.badges.filter((b) => b.earned);
  const sel = data.week[selected] ?? data.week[6];
  const maxVal = Math.max(1, ...data.week.map((d) => d[metric] as number));

  return (
    <main style={shell}>
      <Back />

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
        <div
          style={{
            width: 60, height: 60, flex: "none", borderRadius: "50%", background: FIRE,
            border: "2px solid rgba(255,180,150,.55)", display: "grid", placeItems: "center",
            fontFamily: MONO, fontSize: 17, fontWeight: 700, color: "#fff",
          }}
        >
          {data.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f1ede9" }}>{data.name}</div>
          {data.user.username && (
            <div className="mono" style={{ fontSize: 10, color: "#8a837d", marginTop: 3 }}>@{data.user.username}</div>
          )}
        </div>
        {data.score && (
          <div style={{ textAlign: "right", flex: "none" }}>
            <div style={{ fontSize: 26, fontWeight: 800, ...FIRE_TEXT, lineHeight: 1 }}>{data.score.total}</div>
            <div className="mono" style={{ fontSize: 8, letterSpacing: "1.5px", color: "#7c736e", marginTop: 3 }}>SKOR</div>
          </div>
        )}
      </div>

      {earned.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
          {earned.map((b) => (
            <span key={b.key} style={badgeStyle(b.tier, "sm")}>{b.label}</span>
          ))}
        </div>
      )}

      {/* tabs */}
      <div style={{ display: "flex", gap: 5, margin: "18px 0 16px", padding: 4, borderRadius: 13, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)" }}>
        {([["today", "HARI INI"], ["week", "MINGGU INI"]] as const).map(([k, label]) => {
          const on = tab === k;
          return (
            <button
              key={k}
              type="button"
              className="mono tm-tap"
              onClick={() => setTab(k)}
              style={{
                flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 9.5, fontWeight: 700,
                letterSpacing: ".08em", cursor: "pointer", border: "none",
                color: on ? "#141011" : "#9a938d", background: on ? "#f1ede9" : "transparent",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "today" ? (
        <>
          {/* calorie ring + macros */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, borderRadius: 18, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.09)" }}>
            <Ring value={t?.kcal ?? 0} target={data.targets.kcal} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
              <MacroBar label="PROTEIN" value={t?.protein ?? 0} target={data.targets.protein} color="#5fe39a" />
              <MacroBar label="KARBO" value={t?.carbs ?? 0} target={250} color="#9a938d" />
              <MacroBar label="LEMAK" value={t?.fat ?? 0} target={70} color="#ffb99e" />
            </div>
          </div>

          {/* meals */}
          {(t?.meals.length ?? 0) > 0 && (
            <>
              <Label>MAKAN HARI INI</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {t!.meals.map((m) => (
                  <div key={m.id} style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: 8.5, letterSpacing: ".14em", color: "#ff8a72" }}>
                          {MEAL_LABEL[m.mealType] ?? m.mealType.toUpperCase()}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "#f1ede9", marginTop: 5, lineHeight: 1 }}>
                          {m.kcal}
                          <span style={{ fontSize: 12, color: "#7c736e", fontWeight: 600 }}> kkal</span>
                        </div>
                        {m.items.length > 0 && (
                          <div className="mono" style={{ fontSize: 10, color: "#8a837d", marginTop: 8, lineHeight: 1.6 }}>
                            {m.items.join(" · ")}
                          </div>
                        )}
                      </div>
                      {/* photo slot — proof of the meal */}
                      <button
                        type="button"
                        onClick={() => m.photoUrl && setPhoto(m.photoUrl)}
                        aria-label="Foto makanan"
                        style={{
                          flex: "none", width: 58, height: 58, borderRadius: 12, cursor: m.photoUrl ? "pointer" : "default",
                          display: "grid", placeItems: "center", overflow: "hidden", padding: 0,
                          background: "rgba(238,60,48,.06)",
                          border: m.photoUrl ? "1px solid rgba(255,150,120,.5)" : "1px dashed rgba(255,150,120,.35)",
                        }}
                      >
                        {m.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: 17, opacity: 0.5 }}>📷</span>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* gym */}
          {(t?.workouts.length ?? 0) > 0 && (
            <>
              <Label>LATIHAN</Label>
              {t!.workouts.map((w, i) => (
                <div key={i} style={{ ...cardStyle, marginBottom: 9 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, ...FIRE_TEXT }}>{w.sessionType}</span>
                    <span className="mono" style={{ fontSize: 9.5, color: "#8a837d" }}>
                      {w.machines} MESIN{w.location ? ` · ${w.location}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                    {w.exercises.map((e, k) => (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#cfc8c2" }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* cardio */}
          {(t?.cardio.length ?? 0) > 0 && (
            <>
              <Label>CARDIO</Label>
              {t!.cardio.map((c, i) => (
                <div key={i} style={{ ...cardStyle, marginBottom: 9 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#f1ede9", textTransform: "capitalize" }}>{c.kind}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 11 }}>
                    <Mini label="KM" value={(c.distanceM / 1000).toFixed(1)} />
                    <Mini label="DURASI" value={`${Math.round(c.durationSec / 60)}`} />
                    <Mini label="PACE" value={c.distanceM > 0 ? (c.durationSec / 60 / (c.distanceM / 1000)).toFixed(1) : "—"} />
                  </div>
                  {c.location && (
                    <div className="mono" style={{ fontSize: 9.5, color: "#7c736e", marginTop: 9 }}>{c.location}</div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* badges */}
          <Label>LENCANA</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {earned.slice(0, 3).map((b) => (
              <div key={b.key} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={badgeStyle(b.tier, "sm")}>{b.label}</span>
                <span className="mono" style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: "#8a837d", lineHeight: 1.5 }}>
                  {b.milestone}
                </span>
              </div>
            ))}
            <button
              type="button"
              className="mono tm-tap"
              onClick={() => setShowBadges(true)}
              style={{
                padding: 13, borderRadius: 13, fontSize: 10, letterSpacing: ".08em", color: "#ffb99e",
                background: "rgba(255,138,60,.08)", border: "1px solid rgba(255,150,120,.3)", cursor: "pointer",
              }}
            >
              LIHAT SEMUA LENCANA · {earned.length} / {data.badges.length}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* weekly tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Tile label="RATA KALORI" value={data.weekly.avgKcal.toLocaleString("id-ID")} />
            <Tile label="TOTAL MESIN" value={String(data.weekly.totalMachines)} />
            <Tile label="RATA PROTEIN" value={`${data.weekly.avgProtein}g`} />
            <Tile label="KONSISTENSI" value={`${data.weekly.consistency}%`} />
          </div>

          {/* chart */}
          <div style={{ ...cardStyle, marginTop: 14 }}>
            <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
              {METRICS.map((m) => {
                const on = metric === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    className="mono tm-tap"
                    onClick={() => setMetric(m.key)}
                    style={{
                      flex: 1, padding: "7px 3px", borderRadius: 9, fontSize: 8.5, fontWeight: 700,
                      letterSpacing: ".06em", cursor: "pointer",
                      color: on ? "#fff" : "#8a837d",
                      background: on ? FIRE : "rgba(255,255,255,.04)",
                      border: on ? "1px solid rgba(255,150,120,.5)" : "1px solid rgba(255,255,255,.1)",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
              {data.week.map((d, i) => {
                const v = d[metric] as number;
                const h = v > 0 ? Math.max(8, (v / maxVal) * 100) : 5;
                const on = i === selected;
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setSelected(i)}
                    style={{
                      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      background: "none", border: "none", padding: 0, cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: "100%", height: `${h}%`, borderRadius: 6,
                        background: on ? FIRE : v > 0 ? "rgba(255,138,60,.28)" : "rgba(255,255,255,.07)",
                        border: on ? "1px solid rgba(255,150,120,.6)" : "1px solid transparent",
                        transition: "height .35s cubic-bezier(.22,.61,.36,1)",
                      }}
                    />
                    <span className="mono" style={{ fontSize: 8, color: on ? "#ffb99e" : "#6a6660" }}>{dowOf(d.date)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* selected day */}
          <div style={{ ...cardStyle, marginTop: 12 }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "#7c736e", marginBottom: 12 }}>
              {sel.date}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Mini label="LANGKAH" value={sel.steps > 0 ? sel.steps.toLocaleString("id-ID") : "—"} />
              <Mini label="KM LARI" value={sel.distanceM > 0 ? (sel.distanceM / 1000).toFixed(1) : "—"} />
              <Mini label="TOTAL REPS" value={sel.reps > 0 ? String(sel.reps) : "—"} />
              <Mini label="TOTAL WORKOUT" value={String(sel.sessions)} />
            </div>
          </div>
        </>
      )}

      {/* badges modal */}
      {showBadges && (
        <div
          onClick={() => setShowBadges(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,3,5,.74)",
            backdropFilter: "blur(9px)", WebkitBackdropFilter: "blur(9px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            animation: "wo-fadein .2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 400, maxHeight: "80%", overflowY: "auto", borderRadius: 26, padding: 18,
              background: "linear-gradient(180deg,rgba(46,34,31,.5),rgba(14,12,13,.42))",
              backdropFilter: "blur(30px) saturate(1.5)", WebkitBackdropFilter: "blur(30px) saturate(1.5)",
              border: "1px solid rgba(255,255,255,.18)",
              animation: "wo-popin .34s cubic-bezier(.34,1.56,.64,1)",
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800, color: "#f1ede9", marginBottom: 14 }}>Semua Lencana</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.badges.map((b) => (
                <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 12, opacity: b.earned ? 1 : 0.62 }}>
                  <span style={badgeStyle(b.earned ? b.tier : "locked", "sm")}>{b.label}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="mono" style={{ display: "block", fontSize: 9.5, color: "#8a837d", lineHeight: 1.5 }}>
                      {b.milestone}
                    </span>
                    <span style={{ display: "block", height: 4, borderRadius: 999, marginTop: 6, background: "rgba(255,255,255,.07)", overflow: "hidden" }}>
                      <span
                        style={{
                          display: "block", height: "100%", borderRadius: 999,
                          width: `${Math.min(100, (b.progress / b.target) * 100)}%`,
                          background: b.earned ? "linear-gradient(90deg,#4ade80,#22c55e)" : "linear-gradient(90deg,#ff8a3d,#ee2f1f)",
                        }}
                      />
                    </span>
                    <span className="mono" style={{ display: "block", fontSize: 8.5, color: "#6a6660", marginTop: 4 }}>
                      {Math.round(b.progress)} / {b.target} {b.unit}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* photo lightbox */}
      {photo && (
        <div
          onClick={() => setPhoto(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 210, background: "rgba(4,3,5,.92)",
            display: "grid", placeItems: "center", padding: 18, animation: "wo-fadein .2s ease",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 16 }} />
        </div>
      )}
    </main>
  );
}

function Back() {
  return (
    <Link href="/social" className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "#8a837d", textDecoration: "none" }}>
      ← TEMAN
    </Link>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{ fontSize: 9.5, letterSpacing: ".16em", color: "#7c736e", margin: "22px 0 10px" }}>
      {children}
    </div>
  );
}

const cardStyle: CSSProperties = {
  padding: 15,
  borderRadius: 16,
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.09)",
};

function Ring({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const CIRC = 339;
  return (
    <div style={{ position: "relative", width: 118, height: 118, flex: "none" }}>
      <svg width="118" height="118" viewBox="0 0 118 118">
        <circle cx="59" cy="59" r="54" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="9" />
        <circle
          cx="59" cy="59" r="54" fill="none" stroke="url(#ringgrad)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC - CIRC * pct}
          transform="rotate(-90 59 59)"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.22,.61,.36,1)" }}
        />
        <defs>
          <linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff8a3d" />
            <stop offset="1" stopColor="#ee2f1f" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "#f1ede9", lineHeight: 1 }}>{value.toLocaleString("id-ID")}</div>
          <div className="mono" style={{ fontSize: 8.5, color: "#7c736e", marginTop: 4 }}>/ {target.toLocaleString("id-ID")}</div>
        </div>
      </div>
    </div>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 8.5, color: "#8a837d" }}>
        <span>{label}</span>
        <span>{Math.round(value)}g</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.07)", overflow: "hidden", marginTop: 5 }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: color, animation: "tm-growx .8s cubic-bezier(.22,.61,.36,1)" }} />
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...cardStyle, textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#f1ede9", lineHeight: 1 }}>{value}</div>
      <div className="mono" style={{ fontSize: 8, letterSpacing: "1.6px", color: "#7c736e", marginTop: 7 }}>{label}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#f1ede9", lineHeight: 1 }}>{value}</div>
      <div className="mono" style={{ fontSize: 7.5, letterSpacing: "1.4px", color: "#7c736e", marginTop: 5 }}>{label}</div>
    </div>
  );
}
