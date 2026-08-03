import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. This is what turns the site into an
// installable app — both for "Add to Home Screen" in Safari and for the
// Capacitor iOS wrapper's web layer.
//
// `display: standalone` is the one that actually removes the browser chrome.
// The icon set is deliberately small: iOS reads apple-touch-icon (app/apple-icon.png)
// and ignores this list entirely, so these entries exist for Android/desktop.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "R2·FIT",
    short_name: "R2·FIT",
    description: "Catat makan, latihan, dan progres — 75 hari.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070608",
    theme_color: "#070608",
    lang: "id",
    dir: "ltr",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press the home-screen icon. Android honours these directly; on iOS
    // the equivalent lives in the native shell's Info.plist (see docs/IOS_APP.md).
    shortcuts: [
      {
        name: "Catat makan",
        short_name: "Makan",
        description: "Langsung ke pencarian makanan",
        url: "/meal?add=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Mulai latihan",
        short_name: "Latihan",
        description: "Buka sesi gym hari ini",
        url: "/workout",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Teman",
        short_name: "Teman",
        description: "Papan peringkat teman",
        url: "/social",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
