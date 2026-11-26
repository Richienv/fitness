"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";

type PushPlatform = "loading" | "ios-browser" | "unsupported" | "ready";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushOptInCard({
  compact = false,
  partnerName,
  partnerPushEnabled,
  onStatusChange,
}: {
  compact?: boolean;
  partnerName?: string | null;
  partnerPushEnabled?: boolean | null;
  onStatusChange?: (subscribed: boolean) => void;
}) {
  const [platform, setPlatform] = useState<PushPlatform>("loading");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    const supportsPush =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (isIOS && !isStandalone) {
      setPlatform("ios-browser");
      return;
    }
    if (!supportsPush) {
      setPlatform("unsupported");
      return;
    }

    setPlatform("ready");
    setPermissionDenied(Notification.permission === "denied");

    try {
      const [cfgRes, subRes] = await Promise.all([
        fetch("/api/push/config", { cache: "no-store" }),
        fetch("/api/push/subscribe", { cache: "no-store" }),
      ]);
      const cfg = await cfgRes.json().catch(() => null);
      setConfigured(Boolean(cfg?.enabled && cfg?.publicKey));
      setPublicKey(cfg?.publicKey ?? null);

      if (subRes.status === 401) {
        setAuthNeeded(true);
        return;
      }
      setAuthNeeded(false);
      const subData = await subRes.json().catch(() => null);
      const reg = await navigator.serviceWorker.getRegistration("/");
      const browserSub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
      const active = Boolean(subData?.data?.subscribed && browserSub);
      setSubscribed(active);
      onStatusChange?.(active);
    } catch {
      // keep silent when offline
    }
  }, [onStatusChange]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const enablePush = async () => {
    if (busy || !publicKey) return;
    setBusy(true);
    setFeedback(null);
    haptic("tap");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPermissionDenied(perm === "denied");
        setFeedback("Izin notifikasi belum diberikan.");
        return;
      }
      setPermissionDenied(false);

      const existing = await navigator.serviceWorker.getRegistration("/");
      if (!existing) {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          },
          userAgent: navigator.userAgent,
        }),
      });
      if (res.status === 401) {
        setAuthNeeded(true);
        setFeedback("Masuk akun dulu untuk mengaktifkan notifikasi.");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "Gagal menyimpan langganan notif.");
      }
      if (data?.data?.degraded) {
        setFeedback("Server database belum siap untuk push, tapi izin HP sudah aktif.");
      } else {
        setSubscribed(true);
        onStatusChange?.(true);
        haptic("success");
        setFeedback("🔔 Notifikasi HP aktif! Pesan pasangan bakal muncul di lock screen.");
      }
    } catch (err) {
      setFeedback((err as Error).message || "Gagal mengaktifkan notif HP.");
    } finally {
      setBusy(false);
    }
  };

  const sendTestPush = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    haptic("tap");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => null);
      const sent = data?.data?.push?.sentCount ?? 0;
      if (sent > 0) {
        haptic("success");
        setFeedback("✨ Tes notif terkirim! Cek layar HP kamu.");
      } else {
        setFeedback("Belum ada perangkat terdaftar. Coba aktifkan ulang notif.");
      }
    } catch {
      setFeedback("Gagal mengirim tes notif.");
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe().catch(() => {});
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setSubscribed(false);
      onStatusChange?.(false);
      setFeedback("Notifikasi HP dimatikan di perangkat ini.");
    } catch {
      setFeedback("Gagal mematikan notif.");
    } finally {
      setBusy(false);
    }
  };

  if (platform === "loading") return null;

  return (
    <div className={`push-optin-card${compact ? " is-compact" : ""}`}>
      <div className="push-optin-head">
        <div className="push-optin-title">
          <span className="push-optin-ico" aria-hidden="true">
            {subscribed ? "🔔" : "📲"}
          </span>
          <div>
            <strong>
              {subscribed
                ? "Notif HP aktif di perangkat ini"
                : "Notif Lock Screen HP"}
            </strong>
            <small>
              {partnerName
                ? partnerPushEnabled
                  ? `HP ${partnerName} juga sudah aktif notif ✨`
                  : `HP ${partnerName} belum aktif notif — minta ${partnerName} buka halaman ini & aktifkan`
                : "Biar ucapan semangat & pengingat pasangan muncul langsung di HP"}
            </small>
          </div>
        </div>
        {subscribed && <span className="push-optin-badge">Aktif</span>}
      </div>

      {platform === "ios-browser" && (
        <div className="push-optin-note">
          Di iPhone, notif lock screen hanya muncul jika R2 Fit dibuka dari Home Screen:{" "}
          <strong>Share → Add to Home Screen</strong>, lalu buka app-nya dari ikon.{" "}
          <Link href="/install">Panduan pasang →</Link>
        </div>
      )}

      {platform === "unsupported" && (
        <div className="push-optin-note">
          Browser ini belum mendukung Web Push. Gunakan Safari (iOS Home Screen) atau Chrome Android.
        </div>
      )}

      {platform === "ready" && authNeeded && (
        <div className="push-optin-actions">
          <Link href="/login" className="push-optin-btn primary">
            Masuk akun untuk aktifkan notif →
          </Link>
        </div>
      )}

      {platform === "ready" && !authNeeded && configured === false && (
        <div className="push-optin-note">
          Web Push server belum dikonfigurasi (VAPID keys belum diisi). Pesan tetap masuk ke banner live R2 Fit &amp; tombol Share WA.
        </div>
      )}

      {platform === "ready" && !authNeeded && configured && (
        <>
          {permissionDenied ? (
            <div className="push-optin-note">
              Izin notifikasi ditolak di browser. Buka Settings HP / browser → izinkan notifikasi untuk situs ini.
            </div>
          ) : (
            <div className="push-optin-actions">
              {!subscribed ? (
                <button
                  type="button"
                  className="push-optin-btn primary"
                  disabled={busy}
                  onClick={enablePush}
                >
                  {busy ? "Mengaktifkan…" : "Aktifkan Notif HP"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="push-optin-btn secondary"
                    disabled={busy}
                    onClick={sendTestPush}
                  >
                    {busy ? "Mengirim…" : "Tes Notif"}
                  </button>
                  <button
                    type="button"
                    className="push-optin-btn ghost"
                    disabled={busy}
                    onClick={disablePush}
                  >
                    Matikan
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {feedback && (
        <p className="push-optin-feedback" role="status">
          {feedback}
        </p>
      )}
    </div>
  );
}
