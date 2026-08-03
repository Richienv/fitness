import type { CapacitorConfig } from "@capacitor/cli";

// The native shell around the existing web app.
//
// `server.url` instead of a bundled build, and that is not laziness: every
// page here is server-rendered and talks to Prisma, so there is no static
// export to ship. The app is a WKWebView pointed at the deployment, which
// keeps one codebase and means a Vercel deploy updates every phone with no
// TestFlight round-trip. What the native layer adds on top is the part the
// web can't do: a home-screen widget, real haptics, and the app icon.
//
// Override the target with CAP_SERVER_URL before `npx cap sync ios` to build a
// shell that points at a preview deployment or a laptop on the same Wi-Fi.
const SERVER_URL = process.env.CAP_SERVER_URL || "https://r2-fit.vercel.app";

const config: CapacitorConfig = {
  appId: "com.richienv.r2fit",
  appName: "R2 FIT",
  // Only reached when SERVER_URL is unreachable at launch — see native/www.
  webDir: "native/www",
  server: {
    url: SERVER_URL,
    cleartext: SERVER_URL.startsWith("http://"),
  },
  ios: {
    // The web layout already handles safe areas itself (viewport-fit=cover +
    // env(safe-area-inset-*)). Letting WKWebView also inset would double it.
    contentInset: "never",
    backgroundColor: "#070608",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#070608",
      showSpinner: false,
      launchAutoHide: true,
      launchShowDuration: 500,
    },
  },
};

export default config;
