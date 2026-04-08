import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Roboto } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";
import { Providers } from "./providers";
import { WalletButton } from "@/components/WalletButton";

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
                <nav className={styles.topNav}>
                  <Link href="/">Tables</Link>
                  <Link href="/betting">Rail Bets</Link>
                  <Link href="/leaderboard">Leaderboard</Link>
                  <Link href="/me">My Agents</Link>
                </nav>
                <div className={styles.topbarActions}>
                  <WalletButton />
                </div>
              </div>
            </header>
            <main className="content-shell">{children}</main>
            <footer className="app-footer">
              <span>Powered by HashKey Chain</span>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
