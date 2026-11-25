"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import Icon from "@/app/ui/Icon";
import { haptic } from "@/lib/haptics";
import { useReducedMotion } from "@/lib/useReducedMotion";
import "./partner-room.css";

export type PartnerSummary = {
  id: string;
  name: string | null;
  username: string | null;
  displayName: string;
};

export type VisitorPresence = {
  user: { id: string; name: string | null; username: string | null };
  name: string;
  lastSeenAt: string;
  nudgeText: string | null;
  nudgeAt: string | null;
};

export type NudgeItem = {
  user: { id: string; name: string | null; username: string | null };
  name: string;
  text: string;
  at: string;
  activeNow: boolean;
};

export type PresenceData = {
  partners: PartnerSummary[];
  activeVisitors: VisitorPresence[];
  recentNudges: NudgeItem[];
  degraded?: boolean;
};

type PartnerProfile = {
  user: { id: string; name: string | null; username: string | null };
  name: string;
  date: string;
  score: { total: number; verdict: string } | null;
  targets: { kcal: number; protein: number };
  today: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    lastActivityAt?: string | null;
    lastActivityLabel?: string | null;
    meals: { id: string; mealType: string; kcal: number; items: string[]; photoUrl: string | null }[];
    workouts: { sessionType: string; totalVolume: number; machines: number; location: string | null; exercises: string[] }[];
    cardio: { kind: string; distanceM: number; durationSec: number; location: string | null }[];
  } | null;
};

const QUICK_NUDGES = [
  "Ketuk / Kirim semangat 💛",
  "Udah makan belum? 🍚",
  "Semangat latihan! 💪",
  "Kangen nih ✨",
];

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Sarapan",
  lunch: "Makan siang",
  dinner: "Makan malam",
  snack: "Camilan",
};

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 60) return "baru saja";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}j lalu`;
}

function sendLeaveSignal(hostId: string) {
  if (!hostId || typeof fetch === "undefined") return;
  try {
    void fetch("/api/social/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostId, leaving: true }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // non-fatal on teardown
  }
}

export function pickDefaultPartnerId(
  partners: PartnerSummary[],
  initialPartnerId?: string | null,
): string | null {
  if (initialPartnerId && partners.some((p) => p.id === initialPartnerId)) {
    return initialPartnerId;
  }
  const romanticMatch = partners.find((p) =>
    /\b(renita|richie)\b/i.test(`${p.displayName} ${p.name ?? ""} ${p.username ?? ""}`),
  );
  return romanticMatch?.id ?? partners[0]?.id ?? null;
}

export default function PartnerRoomSheet({
  open,
  onClose,
  partners,
  initialPartnerId,
  presence,
  dateKey,
}: {
  open: boolean;
  onClose: () => void;
  partners: PartnerSummary[];
  initialPartnerId?: string | null;
  presence: PresenceData | null;
  dateKey: string;
}) {
  const reduced = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    pickDefaultPartnerId(partners, initialPartnerId),
  );
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customNudge, setCustomNudge] = useState("");
  const [sendingNudge, setSendingNudge] = useState(false);
  const [sentBanner, setSentBanner] = useState<string | null>(null);
  const activeVisitHostRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId((prev) => {
      if (initialPartnerId && partners.some((p) => p.id === initialPartnerId)) {
        return initialPartnerId;
      }
      if (prev && partners.some((p) => p.id === prev)) return prev;
      return pickDefaultPartnerId(partners, initialPartnerId);
    });
  }, [open, partners, initialPartnerId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const activePartner = useMemo(
    () => partners.find((p) => p.id === selectedId) ?? partners[0] ?? null,
    [partners, selectedId],
  );

  const loadProfile = useCallback(async (partnerId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/social/profile?userId=${encodeURIComponent(partnerId)}&date=${encodeURIComponent(dateKey)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error("Belum bisa membuka ruang teman.");
      }
      setProfile(data.data as PartnerProfile);
    } catch (e) {
      setError((e as Error).message || "Gagal memuat progress pasangan.");
    } finally {
      setLoading(false);
    }
  }, [dateKey]);

  useEffect(() => {
    if (!open || !activePartner) return;
    void loadProfile(activePartner.id);
    const refreshId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadProfile(activePartner.id);
      }
    }, 15_000);
    return () => window.clearInterval(refreshId);
  }, [open, activePartner, loadProfile]);

  // Live visit heartbeat: illuminates partner's Home "sign nyala" doorway while open.
  useEffect(() => {
    if (!open || !activePartner) {
      if (activeVisitHostRef.current) {
        sendLeaveSignal(activeVisitHostRef.current);
        activeVisitHostRef.current = null;
      }
      return;
    }

    const hostId = activePartner.id;
    activeVisitHostRef.current = hostId;

    const beat = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetch("/api/social/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId }),
      }).catch(() => {});
    };

    beat();
    const timer = window.setInterval(beat, 15_000);
    const onPageHide = () => sendLeaveSignal(hostId);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
      sendLeaveSignal(hostId);
      if (activeVisitHostRef.current === hostId) {
        activeVisitHostRef.current = null;
      }
    };
  }, [open, activePartner]);

  const sendNudge = async (text: string) => {
    const clean = text.trim();
    if (!clean || !activePartner || sendingNudge) return;
    setSendingNudge(true);
    haptic("success");
    try {
      const res = await fetch("/api/social/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId: activePartner.id, nudge: clean }),
      });
      if (res.ok) {
        setSentBanner(`✨ Terkirim ke pintu ${activePartner.displayName}: "${clean}"`);
        setCustomNudge("");
        window.setTimeout(() => setSentBanner(null), 4500);
      }
    } finally {
      setSendingNudge(false);
    }
  };

  if (!open) return null;

  const partnerName = profile?.name ?? activePartner?.displayName ?? "Pasangan";
  const today = profile?.today;
  const kcalTarget = Math.max(1, profile?.targets.kcal ?? 2200);
  const proteinTarget = Math.max(1, profile?.targets.protein ?? 140);
  const kcalPct = Math.min(1, (today?.kcal ?? 0) / kcalTarget);
  const proteinPct = Math.min(1, (today?.protein ?? 0) / proteinTarget);

  const partnerVisitingMe = activePartner
    ? presence?.activeVisitors.find((v) => v.user.id === activePartner.id)
    : undefined;
  const partnerRecentNudge = activePartner
    ? presence?.recentNudges.find((n) => n.user.id === activePartner.id)
    : undefined;

  return (
    <div
      className="pr-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Ruang progress ${partnerName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className={`pr-sheet${reduced ? " is-reduced" : ""}`}>
        <header className="pr-head">
          <div className="pr-title-wrap">
            <span className="pr-door-badge" aria-hidden="true">
              <Icon name="door" size={18} />
            </span>
            <div>
              <h2>
                {partners.length > 0 ? `Ruang ${partnerName}` : "Pintu Pasangan"}
              </h2>
              {partners.length > 0 ? (
                <p className="pr-live-sub">
                  <span className="pr-live-dot" aria-hidden="true" />
                  Lampu pintu menyala di beranda {partnerName}
                </p>
              ) : (
                <p className="pr-live-sub">Intip progres harian &amp; kirim semangat</p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="pr-close-btn"
            aria-label="Tutup ruang pasangan"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        {partners.length === 0 ? (
          <div className="pr-empty-card">
            <div className="pr-empty-glow" aria-hidden="true">
              <Icon name="heart" size={26} />
            </div>
            <h3>Belum ada pasangan yang terhubung</h3>
            <p>
              Tambahkan Richie atau Renita di halaman Teman agar kalian bisa saling
              ketuk pintu, lihat progres kalori &amp; latihan hari ini, dan nyalakan tanda
              ketika sedang mengintip.
            </p>
            <div className="pr-empty-actions">
              <Link href="/social" className="pr-cta-btn" onClick={onClose}>
                Buka Teman &amp; Hubungkan
              </Link>
              <Link href="/companion" className="pr-secondary-link" onClick={onClose}>
                Atur target &amp; progres
              </Link>
            </div>
          </div>
        ) : (
          <div className="pr-body">
            {partners.length > 1 && (
              <div className="pr-partner-pills" role="tablist" aria-label="Pilih teman">
                {partners.map((p) => {
                  const active = p.id === activePartner?.id;
                  const peeking = presence?.activeVisitors.some((v) => v.user.id === p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`pr-partner-pill${active ? " active" : ""}${peeking ? " peeking" : ""}`}
                      onClick={() => {
                        haptic("tap");
                        setSelectedId(p.id);
                      }}
                    >
                      {p.displayName}
                      {peeking && <span className="pr-pill-spark" aria-label="lagi ngintip"> ✨</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {(partnerVisitingMe || partnerRecentNudge) && (
              <div className="pr-mutual-banner">
                <Icon name="heart" size={16} />
                <span>
                  {partnerVisitingMe
                    ? `✨ ${partnerName} juga lagi ngintip progress kamu sekarang!`
                    : `💌 ${partnerName}: "${partnerRecentNudge?.text}" (${relativeTime(partnerRecentNudge?.at)})`}
                </span>
              </div>
            )}

            <div className="pr-status-strip">
              <span className="pr-activity-pill">
                {today?.lastActivityLabel
                  ? `${today.lastActivityLabel} · ${relativeTime(today.lastActivityAt)}`
                  : "Belum ada aktivitas hari ini"}
              </span>
              {profile?.score && (
                <span className="pr-score-pill">
                  Skor {profile.score.total} · {profile.score.verdict}
                </span>
              )}
            </div>

            {loading && !profile && (
              <div className="pr-loading">Mengetuk pintu {partnerName}…</div>
            )}
            {error && <div className="pr-error">{error}</div>}

            {profile && today && (
              <>
                <div className="pr-macro-grid">
                  <div className="pr-stat-card">
                    <div className="pr-stat-top">
                      <span>Kalori</span>
                      <strong>
                        {today.kcal} <small>/ {kcalTarget} kkal</small>
                      </strong>
                    </div>
                    <div className="pr-bar-track">
                      <div
                        className="pr-bar-fill kcal"
                        style={{ "--p": kcalPct } as CSSProperties}
                      />
                    </div>
                  </div>
                  <div className="pr-stat-card">
                    <div className="pr-stat-top">
                      <span>Protein</span>
                      <strong>
                        {today.protein}g <small>/ {proteinTarget}g</small>
                      </strong>
                    </div>
                    <div className="pr-bar-track">
                      <div
                        className="pr-bar-fill protein"
                        style={{ "--p": proteinPct } as CSSProperties}
                      />
                    </div>
                  </div>
                </div>

                <div className="pr-micro-macros">
                  <span>Karbo {today.carbs}g</span>
                  <span>Lemak {today.fat}g</span>
                  <span>Gula {today.sugar}g</span>
                </div>

                <div className="pr-section">
                  <h3>Makan hari ini ({today.meals.length})</h3>
                  {today.meals.length === 0 ? (
                    <p className="pr-muted">Belum ada catatan makan hari ini.</p>
                  ) : (
                    <ul className="pr-list">
                      {today.meals.map((m) => (
                        <li key={m.id} className="pr-list-item">
                          <div>
                            <strong>{MEAL_LABELS[m.mealType] ?? m.mealType}</strong>
                            <p>{m.items.join(" · ") || "Menu makan"}</p>
                          </div>
                          <span className="pr-num">{m.kcal} kkal</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pr-section">
                  <h3>
                    Latihan &amp; Kardio ({today.workouts.length + today.cardio.length})
                  </h3>
                  {today.workouts.length === 0 && today.cardio.length === 0 ? (
                    <p className="pr-muted">Belum ada latihan tercatat hari ini.</p>
                  ) : (
                    <ul className="pr-list">
                      {today.workouts.map((w, idx) => (
                        <li key={`w-${idx}`} className="pr-list-item">
                          <div>
                            <strong>{w.sessionType}</strong>
                            <p>
                              {w.machines} gerakan · {w.exercises.slice(0, 3).join(", ")}
                              {w.exercises.length > 3 ? "…" : ""}
                            </p>
                          </div>
                          <span className="pr-num">
                            {w.totalVolume > 0 ? `${Math.round(w.totalVolume)} kg` : "Selesai"}
                          </span>
                        </li>
                      ))}
                      {today.cardio.map((c, idx) => (
                        <li key={`c-${idx}`} className="pr-list-item">
                          <div>
                            <strong>{c.kind}</strong>
                            <p>
                              {c.distanceM > 0 ? `${(c.distanceM / 1000).toFixed(1)} km · ` : ""}
                              {Math.round(c.durationSec / 60)} menit
                              {c.location ? ` · ${c.location}` : ""}
                            </p>
                          </div>
                          <span className="pr-num">Kardio</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            <div className="pr-nudge-box">
              <span className="pr-nudge-label">Ketuk pintu / kirim semangat</span>
              <div className="pr-nudge-chips">
                {QUICK_NUDGES.map((msg) => (
                  <button
                    key={msg}
                    type="button"
                    disabled={sendingNudge}
                    className="pr-nudge-chip"
                    onClick={() => sendNudge(msg)}
                  >
                    {msg}
                  </button>
                ))}
              </div>
              <form
                className="pr-nudge-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendNudge(customNudge);
                }}
              >
                <input
                  value={customNudge}
                  maxLength={120}
                  onChange={(e) => setCustomNudge(e.target.value)}
                  placeholder={`Tulis pesan manis untuk ${partnerName}…`}
                />
                <button
                  type="submit"
                  className="pr-send-btn"
                  disabled={!customNudge.trim() || sendingNudge}
                >
                  Kirim
                </button>
              </form>
              {sentBanner && (
                <p className="pr-sent-banner" role="status">
                  {sentBanner}
                </p>
              )}
            </div>

            {activePartner?.username && (
              <div className="pr-foot-link">
                <Link
                  href={`/social/${encodeURIComponent(activePartner.username)}`}
                  onClick={onClose}
                >
                  Lihat riwayat mingguan lengkap →
                </Link>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
