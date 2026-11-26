"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import Icon from "@/app/ui/Icon";
import PushOptInCard from "@/app/ui/PushOptInCard";
import { haptic } from "@/lib/haptics";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { formatKg, formatWeighTime } from "@/lib/weighIn";
import {
  CHEER_KINDS,
  CHEER_TEMPLATES,
  type CheerKind,
  type FormattedCheerNotification,
} from "@/lib/cheerFormat";
import type { Character } from "@/lib/companionProgress";
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

export type UnreadCheer = {
  id: string;
  senderId: string;
  senderName: string;
  kind: CheerKind;
  message: string;
  createdAt: string;
  formatted: FormattedCheerNotification;
};

export type PresenceData = {
  partners: PartnerSummary[];
  activeVisitors: VisitorPresence[];
  recentNudges: NudgeItem[];
  unreadCheers?: UnreadCheer[];
  unreadCount?: number;
  degraded?: boolean;
};

type CoupleMeal = {
  id: string;
  mealType: string;
  kcal: number;
  protein?: number;
  items: string[];
  photoUrl: string | null;
  createdAt?: string | null;
};

type CoupleSide = {
  user: { id: string; name: string | null; username: string | null };
  displayName: string;
  character: Character;
  avatar: {
    level: number;
    highestLevel: number;
    demoted: boolean;
    demotedFrom: number | null;
    fraction: number;
    title: string;
    tierLabel: string;
    tierAccent: string;
    imageSrc: string;
    currentKg: number | null;
    targetKg: number | null;
    baselineKg: number | null;
    weighedAt: string | null;
    weighedDate: string | null;
  };
  targets: { kcal: number; protein: number };
  today: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    meals: CoupleMeal[];
    workouts: {
      sessionType: string;
      totalVolume: number;
      machines: number;
      location: string | null;
      exercises: string[];
    }[];
    cardio: {
      kind: string;
      distanceM: number;
      durationSec: number;
      location: string | null;
    }[];
    lastActivityAt: string | null;
    lastActivityLabel: string | null;
  };
  pushEnabled: boolean;
};

type CheerItem = {
  id: string;
  senderId: string;
  targetId: string;
  senderName: string;
  kind: CheerKind;
  message: string;
  readAt: string | null;
  createdAt: string;
  isMine: boolean;
  formatted: FormattedCheerNotification;
};

type CoupleData = {
  date: string;
  me: CoupleSide;
  partner: CoupleSide | null;
  partners: PartnerSummary[];
  presence: {
    activeVisitors: VisitorPresence[];
    recentNudges: NudgeItem[];
    partnerVisitingMe: boolean;
  };
  cheers: CheerItem[];
  pushConfigured: boolean;
};

type DeliveryReceipt = {
  cheer: CheerItem;
  push: { configured: boolean; totalSubscriptions: number; sentCount: number };
  formatted: FormattedCheerNotification;
};

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

function ArenaSideCard({
  side,
  isMe,
  isPeeking,
}: {
  side: CoupleSide;
  isMe: boolean;
  isPeeking?: boolean;
}) {
  const weighTime = formatWeighTime(side.avatar.weighedAt);
  const pct = Math.max(0, Math.min(100, Math.round(side.avatar.fraction * 100)));

  return (
    <article
      className={`pr-arena-card${isMe ? " is-me" : " is-partner"}${isPeeking ? " is-peeking" : ""}`}
      style={{ ["--tier-accent" as string]: side.avatar.tierAccent } as CSSProperties}
    >
      <div className="pr-arena-card-top">
        <span className="pr-arena-role">{isMe ? "Aku" : "Pasangan"}</span>
        {isPeeking ? (
          <span className="pr-arena-peek-pill">✨ Ngintip</span>
        ) : side.today.lastActivityAt ? (
          <span className="pr-arena-time">{relativeTime(side.today.lastActivityAt)}</span>
        ) : null}
      </div>

      <div className="pr-arena-avatar-box">
        <span className="pr-arena-aura" aria-hidden="true" />
        <img
          src={side.avatar.imageSrc}
          alt={`${side.displayName} level ${side.avatar.level}`}
          width={120}
          height={160}
          className="pr-arena-avatar-img"
        />
        <span className="pr-arena-lv-badge">
          Lv {side.avatar.level}/12
        </span>
      </div>

      <div className="pr-arena-identity">
        <strong>{side.displayName}</strong>
        <small>{side.avatar.title}</small>
        {side.avatar.demoted && side.avatar.demotedFrom && (
          <span className="pr-arena-demoted">
            ↓ Mundur dari Lv {side.avatar.demotedFrom}
          </span>
        )}
      </div>

      <div className="pr-arena-weight">
        <div className="pr-arena-weight-nums">
          <span>
            {side.avatar.currentKg !== null
              ? `${formatKg(side.avatar.currentKg)} kg`
              : "Belum timbang"}
          </span>
          {side.avatar.targetKg !== null && (
            <small>→ {formatKg(side.avatar.targetKg)} kg</small>
          )}
        </div>
        <div className="pr-arena-bar-track" aria-hidden="true">
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <div className="pr-arena-weight-sub">
          {weighTime
            ? `Timbang ${weighTime}`
            : side.avatar.weighedDate
              ? side.avatar.weighedDate
              : "Catat berat untuk naik level"}
        </div>
      </div>
    </article>
  );
}

function MealColumn({
  title,
  meals,
}: {
  title: string;
  meals: CoupleMeal[];
}) {
  return (
    <div className="pr-meal-col">
      <div className="pr-meal-col-head">
        <strong>{title}</strong>
        <span>{meals.length} makan</span>
      </div>
      {meals.length === 0 ? (
        <p className="pr-muted">Belum catat makan hari ini.</p>
      ) : (
        <ul className="pr-list compact">
          {meals.map((m) => {
            const t = formatWeighTime(m.createdAt);
            return (
              <li key={m.id} className="pr-list-item compact">
                <div>
                  <div className="pr-meal-meta">
                    <strong>{MEAL_LABELS[m.mealType] ?? m.mealType}</strong>
                    {t && <span className="pr-meal-clock">{t}</span>}
                  </div>
                  <p>{m.items.join(" · ") || "Menu makan"}</p>
                </div>
                <span className="pr-num">
                  {m.kcal} kkal
                  {typeof m.protein === "number" && m.protein > 0 && (
                    <small>{m.protein}g P</small>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function PartnerRoomSheet({
  open,
  onClose,
  partners,
  initialPartnerId,
  presence,
  dateKey,
  onUnreadCleared,
}: {
  open: boolean;
  onClose: () => void;
  partners: PartnerSummary[];
  initialPartnerId?: string | null;
  presence: PresenceData | null;
  dateKey: string;
  onUnreadCleared?: () => void;
}) {
  const reduced = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    pickDefaultPartnerId(partners, initialPartnerId),
  );
  const [couple, setCouple] = useState<CoupleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mealFilter, setMealFilter] = useState<"both" | "me" | "partner">("both");
  const [cheerKind, setCheerKind] = useState<CheerKind>("say");
  const [customMessage, setCustomMessage] = useState("");
  const [sendingCheer, setSendingCheer] = useState(false);
  const [lastDelivery, setLastDelivery] = useState<DeliveryReceipt | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
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

  const markRead = useCallback(
    async (partnerId?: string) => {
      if (!partnerId) return;
      try {
        await fetch("/api/social/cheer", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerId }),
        });
        onUnreadCleared?.();
      } catch {
        // ignore offline
      }
    },
    [onUnreadCleared],
  );

  const loadCouple = useCallback(
    async (partnerId?: string | null, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ date: dateKey });
        if (partnerId) qs.set("partnerId", partnerId);
        const res = await fetch(`/api/social/couple?${qs.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error("Belum bisa membuka Arena Berdua.");
        }
        const nextCouple = data.data as CoupleData;
        setCouple(nextCouple);
        if (
          nextCouple.partner &&
          nextCouple.cheers.some((c) => !c.isMine && !c.readAt)
        ) {
          void markRead(nextCouple.partner.user.id);
        }
      } catch (e) {
        if (!silent) {
          setError((e as Error).message || "Gagal memuat data berdua.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [dateKey, markRead],
  );

  // Real-time 10s polling + visibilitychange refresh while open
  useEffect(() => {
    if (!open) return;
    const pid = activePartner?.id ?? null;
    void loadCouple(pid, false);
    if (pid) void markRead(pid);

    const refreshId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadCouple(pid, true);
      }
    }, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadCouple(pid, true);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(refreshId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, activePartner?.id, loadCouple, markRead]);

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

  const sendCheer = async (text: string, kind: CheerKind = cheerKind) => {
    const clean = text.trim();
    const targetId = couple?.partner?.user.id ?? activePartner?.id;
    if (!clean || !targetId || sendingCheer) return;
    setSendingCheer(true);
    setShareCopied(false);
    haptic("success");
    try {
      const res = await fetch("/api/social/cheer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: targetId, kind, message: clean }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && json?.data) {
        setLastDelivery(json.data as DeliveryReceipt);
        setCustomMessage("");
        void loadCouple(targetId, true);
      }
    } finally {
      setSendingCheer(false);
    }
  };

  const handleNativeShare = async () => {
    if (!lastDelivery) return;
    const shareUrl = `${window.location.origin}/?couple=1`;
    const shareTitle = lastDelivery.formatted.title;
    const shareText = lastDelivery.formatted.shareText;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch {
        // cancelled or fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2600);
    } catch {
      // ignore clipboard errors
    }
  };

  if (!open) return null;

  const me = couple?.me ?? null;
  const partner = couple?.partner ?? null;
  const partnerName = partner?.displayName ?? activePartner?.displayName ?? "Pasangan";
  const allPartners = couple?.partners ?? partners;
  const partnerVisitingMe = Boolean(
    couple?.presence.partnerVisitingMe ||
      (activePartner &&
        presence?.activeVisitors.some((v) => v.user.id === activePartner.id)),
  );
  const partnerRecentNudge = activePartner
    ? presence?.recentNudges.find((n) => n.user.id === activePartner.id)
    : undefined;
  const filteredTemplates = CHEER_TEMPLATES.filter((t) => t.kind === cheerKind);
  const activeKindMeta =
    CHEER_KINDS.find((k) => k.kind === cheerKind) ?? CHEER_KINDS[0];

  const renderMacroCompare = (
    label: string,
    unit: string,
    meVal: number,
    meTarget: number,
    partnerVal: number,
    partnerTarget: number,
    tone: "kcal" | "protein",
  ) => {
    const mePct = Math.min(1, meVal / Math.max(1, meTarget));
    const partnerPct = Math.min(1, partnerVal / Math.max(1, partnerTarget));
    const meRem = Math.round(meTarget - meVal);
    const partnerRem = Math.round(partnerTarget - partnerVal);

    return (
      <div className="pr-compare-card">
        <div className="pr-compare-head">
          <span>{label}</span>
          <small>Real-time hari ini</small>
        </div>
        <div className="pr-compare-rows">
          <div className="pr-compare-row">
            <div className="pr-compare-label">
              <strong>{me?.displayName ?? "Aku"}</strong>
              <span>
                {meVal} <small>/ {meTarget} {unit}</small>
              </span>
            </div>
            <div className="pr-bar-track">
              <div
                className={`pr-bar-fill ${tone}`}
                style={{ "--p": mePct } as CSSProperties}
              />
            </div>
            {tone === "kcal" && (
              <em className="pr-compare-rem">
                {meRem >= 0 ? `Sisa ${meRem} ${unit}` : `Lebih ${Math.abs(meRem)} ${unit}`}
              </em>
            )}
          </div>
          {partner && (
            <div className="pr-compare-row">
              <div className="pr-compare-label">
                <strong>{partner.displayName}</strong>
                <span>
                  {partnerVal} <small>/ {partnerTarget} {unit}</small>
                </span>
              </div>
              <div className="pr-bar-track">
                <div
                  className={`pr-bar-fill ${tone} is-partner`}
                  style={{ "--p": partnerPct } as CSSProperties}
                />
              </div>
              {tone === "kcal" && (
                <em className="pr-compare-rem">
                  {partnerRem >= 0
                    ? `Sisa ${partnerRem} ${unit}`
                    : `Lebih ${Math.abs(partnerRem)} ${unit}`}
                </em>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="pr-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Richie & Renita — Arena Berdua"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className={`pr-sheet pr-arena-sheet${reduced ? " is-reduced" : ""}`}>
        <header className="pr-head">
          <div className="pr-title-wrap">
            <span className="pr-door-badge" aria-hidden="true">
              <Icon name="heart" size={18} />
            </span>
            <div>
              <h2>
                {partner ? `${me?.displayName ?? "Aku"} & ${partner.displayName}` : "Richie & Renita"}
              </h2>
              <p className="pr-live-sub">
                <span className="pr-live-dot" aria-hidden="true" />
                {partner
                  ? partnerVisitingMe
                    ? `✨ ${partner.displayName} juga lagi buka arena berdua`
                    : `Live berdua · update otomatis tiap 10 dtk`
                  : "Arena progres & kirim semangat berdua"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="pr-close-btn"
            aria-label="Tutup Arena Berdua"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="pr-body">
          {allPartners.length > 1 && (
            <div className="pr-partner-pills" role="tablist" aria-label="Pilih pasangan">
              {allPartners.map((p) => {
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
                    {peeking && <span className="pr-pill-spark"> ✨</span>}
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
                  ? `✨ ${partnerName} lagi ngintip progres kamu sekarang!`
                  : `💌 ${partnerName}: "${partnerRecentNudge?.text}" (${relativeTime(partnerRecentNudge?.at)})`}
              </span>
            </div>
          )}

          {loading && !couple && (
            <div className="pr-loading">Menyinkronkan kondisi berdua…</div>
          )}
          {error && <div className="pr-error">{error}</div>}

          {me && (
            <>
              {/* Section A — Dual Avatar & Weight Arena */}
              <section className="pr-arena-grid" aria-label="Perbandingan level dan berat badan berdua">
                <ArenaSideCard side={me} isMe />
                {partner ? (
                  <ArenaSideCard
                    side={partner}
                    isMe={false}
                    isPeeking={partnerVisitingMe}
                  />
                ) : (
                  <div className="pr-arena-card is-empty">
                    <div className="pr-empty-glow" aria-hidden="true">
                      <Icon name="heart" size={22} />
                    </div>
                    <strong>Belum terhubung</strong>
                    <p>
                      Tambahkan akun Richie atau Renita di Teman supaya avatar,
                      kalori &amp; makan tampil berdua di sini.
                    </p>
                    <Link href="/social" className="pr-cta-btn small" onClick={onClose}>
                      Hubungkan di Teman →
                    </Link>
                  </div>
                )}
              </section>

              {/* Section B — Real-Time Calorie & Macro Comparison */}
              <section className="pr-section" aria-label="Perbandingan kalori dan makro hari ini">
                <div className="pr-compare-grid">
                  {renderMacroCompare(
                    "Kalori hari ini",
                    "kkal",
                    me.today.kcal,
                    me.targets.kcal,
                    partner?.today.kcal ?? 0,
                    partner?.targets.kcal ?? 1450,
                    "kcal",
                  )}
                  {renderMacroCompare(
                    "Protein hari ini",
                    "g",
                    me.today.protein,
                    me.targets.protein,
                    partner?.today.protein ?? 0,
                    partner?.targets.protein ?? 100,
                    "protein",
                  )}
                </div>

                <div className="pr-dual-chips">
                  <div className="pr-dual-chip-row">
                    <strong>{me.displayName}</strong>
                    <span>Karbo {me.today.carbs}g</span>
                    <span>Lemak {me.today.fat}g</span>
                    <span>Gula {me.today.sugar}g</span>
                    <span>
                      {me.today.workouts.length + me.today.cardio.length} latihan
                    </span>
                  </div>
                  {partner && (
                    <div className="pr-dual-chip-row is-partner">
                      <strong>{partner.displayName}</strong>
                      <span>Karbo {partner.today.carbs}g</span>
                      <span>Lemak {partner.today.fat}g</span>
                      <span>Gula {partner.today.sugar}g</span>
                      <span>
                        {partner.today.workouts.length + partner.today.cardio.length} latihan
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* Section C — Makan Hari Ini Berdua */}
              <section className="pr-section" aria-label="Makan hari ini berdua">
                <div className="pr-section-head">
                  <h3>Makan hari ini berdua</h3>
                  {partner && (
                    <div className="pr-filter-pills" role="group" aria-label="Filter makanan">
                      {(
                        [
                          ["both", "Berdua"],
                          ["me", me.displayName],
                          ["partner", partner.displayName],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          aria-pressed={mealFilter === val}
                          className={mealFilter === val ? "is-on" : undefined}
                          onClick={() => {
                            haptic("tap");
                            setMealFilter(val);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className={`pr-meals-columns${mealFilter === "both" && partner ? " is-dual" : ""}`}
                >
                  {(mealFilter === "both" || mealFilter === "me" || !partner) && (
                    <MealColumn title={me.displayName} meals={me.today.meals} />
                  )}
                  {partner && (mealFilter === "both" || mealFilter === "partner") && (
                    <MealColumn
                      title={partner.displayName}
                      meals={partner.today.meals}
                    />
                  )}
                </div>
              </section>

              {/* Section D — Kirim Semangat & Pengingat + Push */}
              {partner && (
                <section className="pr-nudge-box" aria-label="Kirim semangat ke pasangan">
                  <div className="pr-nudge-head">
                    <span className="pr-nudge-label">
                      Kirim ke HP {partner.displayName}
                    </span>
                    <span className="pr-push-pill">
                      {partner.pushEnabled ? "🔔 Push HP siap" : "💌 Banner R2 Fit"}
                    </span>
                  </div>

                  <div className="pr-kind-tabs" role="tablist" aria-label="Jenis pesan">
                    {CHEER_KINDS.map((k) => (
                      <button
                        key={k.kind}
                        type="button"
                        role="tab"
                        aria-selected={cheerKind === k.kind}
                        className={`pr-kind-tab${cheerKind === k.kind ? " is-on" : ""}`}
                        onClick={() => {
                          haptic("tap");
                          setCheerKind(k.kind);
                        }}
                      >
                        {k.emoji} {k.label}
                      </button>
                    ))}
                  </div>

                  <div className="pr-nudge-chips">
                    {filteredTemplates.map((tpl) => (
                      <button
                        key={tpl.text}
                        type="button"
                        disabled={sendingCheer}
                        className="pr-nudge-chip"
                        onClick={() => void sendCheer(tpl.text, tpl.kind)}
                      >
                        {tpl.text}
                      </button>
                    ))}
                  </div>

                  <form
                    className="pr-nudge-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void sendCheer(customMessage, cheerKind);
                    }}
                  >
                    <input
                      value={customMessage}
                      maxLength={180}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder={activeKindMeta.placeholder}
                    />
                    <button
                      type="submit"
                      className="pr-send-btn"
                      disabled={!customMessage.trim() || sendingCheer}
                    >
                      {sendingCheer ? "…" : "Kirim"}
                    </button>
                  </form>

                  {lastDelivery && (
                    <div className="pr-delivery-card" role="status">
                      <p className="pr-sent-banner">
                        {lastDelivery.push.sentCount > 0
                          ? `🔔 Notif langsung dikirim ke HP ${partner.displayName}!`
                          : `💌 Tersimpan di R2 Fit ${partner.displayName} (muncul di banner live saat dibuka)`}
                      </p>
                      <button
                        type="button"
                        className="pr-share-fallback-btn"
                        onClick={() => void handleNativeShare()}
                      >
                        {shareCopied
                          ? "✓ Pesan tersalin — tempel di WA / WeChat"
                          : `Kirim ke HP ${partner.displayName} via WA / Share`}
                      </button>
                    </div>
                  )}

                  {couple && couple.cheers.length > 0 && (
                    <div className="pr-cheer-thread" aria-label="Riwayat pesan terakhir">
                      {couple.cheers.slice(-4).map((c) => (
                        <div
                          key={c.id}
                          className={`pr-cheer-msg${c.isMine ? " is-mine" : ""}`}
                        >
                          <span>{c.formatted.banner}</span>
                          <small>{relativeTime(c.createdAt)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {(!me.pushEnabled || (partner && !partner.pushEnabled)) && (
                <div className="pr-push-wrap">
                  <PushOptInCard
                    compact
                    partnerName={partner?.displayName}
                    partnerPushEnabled={partner?.pushEnabled}
                    onStatusChange={() => void loadCouple(activePartner?.id, true)}
                  />
                </div>
              )}
            </>
          )}

          <div className="pr-foot-links">
            <Link href="/companion" onClick={onClose}>
              Pengaturan Target &amp; Grafik →
            </Link>
            {partner?.user.username && (
              <Link
                href={`/social/${encodeURIComponent(partner.user.username)}`}
                onClick={onClose}
              >
                Lihat riwayat mingguan lengkap →
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
