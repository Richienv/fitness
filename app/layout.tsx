import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "./BottomNav";
import ServerSync from "./ServerSync";
import ToastStack from "./Toast";
import Providers from "./Providers";
import UserScopeInit from "./UserScopeInit";
import { ActiveDateProvider } from "@/lib/activeDate";
import { auth } from "@/auth";

// weuseai "fire" system: Plus Jakarta Sans for everything (display + body),
// JetBrains Mono for UI chrome. We keep the OLD variable names so the entire
// stylesheet picks up the new fonts without touching every rule; --font-bebas
// (old condensed display role) is aliased to Jakarta in globals.css :root.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-dm-sans",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

const SITE_URL = "https://r2-fit.vercel.app";
const OG_IMAGE = `${SITE_URL}/api/og?days=75&v=2`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "R2·FIT — Track",
  description: "75 days before meet-up.",
  applicationName: "R2·FIT",
  appleWebApp: {
    title: "R2·FIT",
    capable: true,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "R2·FIT",
    title: "R2·FIT — Track",
    description: "75 days before meet-up.",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "R2·FIT",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "R2·FIT — Track",
    description: "75 days before meet-up.",
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#070608",
  // Lets `100dvh` shrink while the on-screen keyboard is open so bottom-sheet
  // modals (custom food, custom workout) stay reachable instead of being
  // pushed behind the keyboard.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Also loaded under canonical names for <canvas> share-card rendering */}
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          {/* Sets the per-user localStorage scope before ServerSync / pages read. */}
          <UserScopeInit userId={userId} />
          <ActiveDateProvider>
            <ServerSync />
            <div className="app-root">{children}</div>
            <BottomNav />
            <ToastStack />
          </ActiveDateProvider>
        </Providers>
      </body>
    </html>
  );
}
