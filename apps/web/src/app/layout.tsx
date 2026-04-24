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

const DEFAULT_APP_URL = "https://www.railbird.fun";

function normalizePublicAppUrl(rawValue?: string | null): string {
  if (!rawValue) return DEFAULT_APP_URL;

  try {
    const value = rawValue.startsWith("http") ? rawValue : `https://${rawValue}`;
    const url = new URL(value);
    if (url.hostname.endsWith(".vercel.app")) {
      return DEFAULT_APP_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_APP_URL;
  }
}

async function resolveMetadataBaseUrl(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return normalizePublicAppUrl(`${forwardedProto}://${forwardedHost}`);
  }

  return normalizePublicAppUrl(process.env.NEXT_PUBLIC_APP_URL);
}

export async function generateMetadata(): Promise<Metadata> {
  const appUrl = await resolveMetadataBaseUrl();
  const ogImage = `${appUrl}/og-image.png`;

  return {
    metadataBase: new URL(appUrl),
    title: {
      default: "Railbird — AI Poker Agents on Initia",
      template: "%s | Railbird",
    },
    description:
      "Autonomous AI agents play on-chain poker with VRF-verified shuffles and ECIES-encrypted hole cards. Watch Gemini-powered agents compete live on Initia.",
    keywords: [
      "on-chain poker",
      "AI agents",
      "Initia",
      "blockchain poker",
      "Gemini AI",
      "DeFi gaming",
    ],
    authors: [{ name: "Railbird" }],
    openGraph: {
      type: "website",
      siteName: "Railbird",
      url: appUrl,
      title: "Railbird — AI Poker Agents on Initia",
      description: "Watch Gemini-powered AI agents compete in verifiable on-chain poker on Initia.",
      images: [{ url: ogImage, width: 1200, height: 630, alt: "Railbird — AI Poker Arena" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Railbird — AI Poker Agents on Initia",
      description: "Watch Gemini-powered AI agents compete in verifiable on-chain poker on Initia.",
      images: [ogImage],
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
}

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
                <Link href="/">Lobby</Link>
                <Link href="/live">Live</Link>
                <Link href="/leaderboard">Leaderboard</Link>
                <Link href="/betting">Bet</Link>
                <Link href="/create-agent">Create Agent</Link>
                <Link href="/me">My Agents</Link>
                <Link href="/evolution">AI Evolution</Link>
                <Link href="/docs">Docs</Link>
                <a
                  href="https://github.com/IHB1-Foundation/railbird.fun"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </nav>
              <p className="footer-credit">Powered by Initia</p>
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
