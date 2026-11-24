"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { applySetupToDevice, SETUP_CACHE_KEY } from "@/lib/setupDevice";
import { scopedKey, setActiveUser } from "@/lib/userScope";
import { mergeServerMeasurements } from "@/lib/measurements";
import type { AccountSetup, SetupState } from "@/lib/setup";
import { rememberAccount } from "@/lib/deviceAccount";

const Context = createContext<
  | (SetupState & { accept: (setup: AccountSetup) => void; offline: boolean })
  | null
>(null);

export function useAccountSetup() {
  return useContext(Context);
}

function readCachedSetup(userId: string): SetupState | null {
  if (typeof window === "undefined") return null;
  try {
    setActiveUser(userId);
    const cached = JSON.parse(
      localStorage.getItem(scopedKey(SETUP_CACHE_KEY)) || "null",
    ) as AccountSetup | null;
    if (cached?.completedAt) {
      return { person: cached.person, setup: cached, latest: null };
    }
  } catch {}
  return null;
}

export default function SetupProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const path = usePathname(),
    router = useRouter();
  const [state, setState] = useState<SetupState | null>(null),
    [owner, setOwner] = useState<string | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [offline, setOffline] = useState(false);

  const accept = useCallback((setup: AccountSetup) => {
    applySetupToDevice(setup);
    setState((s) => ({
      person: setup.person,
      setup,
      latest: s?.latest ?? setup.measurement,
    }));
    window.dispatchEvent(new Event("r2:data"));
  }, []);

  useEffect(() => {
    if (!userId) {
      setState(null);
      setOwner(null);
      return;
    }
    setActiveUser(userId);
    setError("");

    // Cache-first instant boot: hydrate immediately from localStorage so returning
    // users never wait on a slow network or see a splash screen before the UI loads.
    const cached = readCachedSetup(userId);
    if (cached) {
      setState(cached);
      setOwner(userId);
      setOffline(false);
    } else {
      setOwner(null);
      setOffline(false);
    }

    const controller = new AbortController();
    // Shorter timeout when we already rendered from cache so flaky networks settle quickly.
    const timer = setTimeout(() => controller.abort(), cached ? 7000 : 12000);
    let current = true;

    fetch("/api/setup", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Data belum bisa dimuat.");
        if (!current) return;
        const next = data as SetupState;
        rememberAccount(next.person);
        if (next.setup) applySetupToDevice(next.setup);
        if (next.latest) mergeServerMeasurements([next.latest]);
        setState(next);
        setOwner(userId);
        setOffline(false);
      })
      .catch(() => {
        if (!current) return;
        if (cached) {
          // Already rendered cleanly from device cache — stay usable offline.
          setOffline(true);
          return;
        }
        const fallback = readCachedSetup(userId);
        if (fallback) {
          setState(fallback);
          setOwner(userId);
          setOffline(true);
          return;
        }
        setError(
          "Data akun belum bisa dimuat. Periksa koneksi lalu coba lagi.",
        );
      })
      .finally(() => clearTimeout(timer));

    return () => {
      current = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [userId, retry]);

  const needsSetup = !!userId && owner === userId && state && !state.setup;
  const setupRoute = path === "/onboarding";
  useEffect(() => {
    if (needsSetup && !setupRoute) router.replace("/onboarding");
  }, [needsSetup, setupRoute, router]);

  if (!userId) return children;
  if (error)
    return (
      <main className="entry-loading">
        <h1>Koneksi terputus</h1>
        <p>{error}</p>
        <button
          className="entry-primary"
          onClick={() => setRetry((r) => r + 1)}
        >
          Coba lagi
        </button>
        <button
          className="entry-link"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Ganti akun
        </button>
      </main>
    );
  if (!state || owner !== userId || (needsSetup && !setupRoute))
    return (
      <main className="entry-loading" aria-busy="true">
        <span className="friendly-brand">
          r2<span>fit</span>
        </span>
        <p>Menyiapkan akunmu…</p>
      </main>
    );
  return (
    <Context.Provider value={{ ...state, accept, offline }}>
      {children}
    </Context.Provider>
  );
}
