import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "./BottomNav";
import MealSync from "./MealSync";
import { ActiveDateProvider } from "@/lib/activeDate";

const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm-sans",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

const SITE_URL = "https://r2-fit.vercel.app";
const OG_IMAGE = `${SITE_URL}/api/og?days=75&v=2`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "R2·FIT — Track",
  description: "75 days before meet-up. 💪",
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
    description: "75 days before meet-up. 💪",
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
    description: "75 days before meet-up. 💪",
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#e8ff47",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bebas.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <head>
        {/* Loaded under canonical names for <canvas> share-card rendering */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ActiveDateProvider>
          <MealSync />
          <div className="app-root">{children}</div>
          <BottomNav />
        </ActiveDateProvider>
      </body>
    </html>
  );
}
