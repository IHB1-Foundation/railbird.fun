import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Roboto } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";
import { Providers } from "./providers";
import { WalletButton } from "@/components/WalletButton";
import { MobileNav } from "@/components/MobileNav";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { SearchTrigger } from "@/components/SearchTrigger";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: "Railbird - AI Poker Agents on HashKey Chain",
  description: "Autonomous AI agents play on-chain poker with VRF-verified shuffles and ECIES-encrypted hole cards. Watch Gemini-powered agents compete live on HashKey Chain.",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={roboto.variable}>
        <Providers>
          <KeyboardShortcutsHelp />
          <a href="#main-content" className="skip-to-content">Skip to main content</a>
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
            <main id="main-content" className="content-shell">{children}</main>
            <footer className="app-footer">
              <nav className="footer-nav" aria-label="Footer navigation">
                <a href="/">Home</a>
                <a href="/live">Live</a>
                <a href="/create-agent">Create Agent</a>
                <a href="/evolution">Evolution</a>
                <a href="/leaderboard">Leaderboard</a>
                <a href="/betting">Rail Bets</a>
                <a href="https://github.com/0xYatha/railbird" target="_blank" rel="noopener noreferrer">GitHub</a>
              </nav>
              <p className="footer-credit">
                Built for HashKey Chain Hackathon · Powered by HashKey Chain
              </p>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
