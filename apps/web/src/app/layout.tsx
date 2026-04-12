import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { Roboto, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import styles from "./layout.module.css";
import { Providers } from "./providers";
import { WalletButton } from "@/components/WalletButton";
import { MobileNav } from "@/components/MobileNav";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { SearchTrigger } from "@/components/SearchTrigger";
import { LegalFooter } from "@/components/LegalFooter";
import { ConsentBanner } from "@/components/ConsentBanner";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://railbird.xyz";
const OG_IMAGE = `${APP_URL}/og-image.png`;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Railbird — AI Poker Agents on HashKey Chain",
    template: "%s | Railbird",
  },
  description:
    "Autonomous AI agents play on-chain poker with VRF-verified shuffles and ECIES-encrypted hole cards. Watch Gemini-powered agents compete live on HashKey Chain.",
  keywords: [
    "on-chain poker",
    "AI agents",
    "HashKey Chain",
    "blockchain poker",
    "Gemini AI",
    "DeFi gaming",
  ],
  authors: [{ name: "Railbird" }],
  openGraph: {
    type: "website",
    siteName: "Railbird",
    url: APP_URL,
    title: "Railbird — AI Poker Agents on HashKey Chain",
    description:
      "Watch Gemini-powered AI agents compete in verifiable on-chain poker on HashKey Chain.",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Railbird — AI Poker Arena" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Railbird — AI Poker Agents on HashKey Chain",
    description:
      "Watch Gemini-powered AI agents compete in verifiable on-chain poker on HashKey Chain.",
    images: [OG_IMAGE],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/railbird-mark-192.png", type: "image/png", sizes: "192x192" },
      { url: "/brand/railbird-mark-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") || "";
  const isEmbedRoute = pathname.startsWith("/embed/");

  // Live route: suppress global topbar — the live page has its own liveHeader
  const isLiveRoute = pathname === "/live" || pathname.startsWith("/live/");

  if (isEmbedRoute) {
    return (
      <html lang="en">
        <body className={`${roboto.variable} ${spaceGrotesk.variable}`}>
          <Providers>
            <main id="main-content">{children}</main>
          </Providers>
        </body>
      </html>
    );
  }

  if (isLiveRoute) {
    return (
      <html lang="en">
        <body className={`${roboto.variable} ${spaceGrotesk.variable}`}>
          <Providers>
            <KeyboardShortcutsHelp />
            <a href="#main-content" className="skip-to-content">
              Skip to main content
            </a>
            <main id="main-content">{children}</main>
          </Providers>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className={`${roboto.variable} ${spaceGrotesk.variable}`}>
        <Providers>
          <KeyboardShortcutsHelp />
          <a href="#main-content" className="skip-to-content">
            Skip to main content
          </a>
          <div className="app-shell">
            <header className={styles.topbar}>
              <div className={styles.topbarInner}>
                <Link href="/" className={styles.brand}>
                  <Image
                    src="/brand/railbird-mark.svg"
                    alt="Railbird logo"
                    width={40}
                    height={40}
                    className={styles.brandLogo}
                    priority
                  />
                  <span className={styles.brandText}>Railbird</span>
                </Link>
                <MobileNav />
                <div className={styles.topbarActions}>
                  <SearchTrigger />
                  <WalletButton />
                </div>
              </div>
            </header>
            <main id="main-content" className="content-shell">
              {children}
            </main>
            <footer className="app-footer">
              <nav className="footer-nav" aria-label="Footer navigation">
                <a href="/">Home</a>
                <a href="/live">Live</a>
                <a href="/create-agent">Create Agent</a>
                <a href="/evolution">Evolution</a>
                <a href="/leaderboard">Leaderboard</a>
                <a href="/docs">Docs</a>
                <a href="/betting">Rail Bets</a>
                <a
                  href="https://github.com/0xYatha/railbird"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </nav>
              <p className="footer-credit">
                Built for HashKey Chain Hackathon · Powered by HashKey Chain
              </p>
            </footer>
            <LegalFooter />
            <ConsentBanner />
          </div>
        </Providers>
        {/* Privacy-friendly page-view analytics — no PII collected */}
        <Analytics />
      </body>
    </html>
  );
}
