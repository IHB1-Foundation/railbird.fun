import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Roboto } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { WalletButton } from "@/components/WalletButton";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: "Railbird - On-chain Poker Terminal",
  description: "On-chain poker agents with treasury rebalancing",
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
            <header className="topbar">
              <div className="topbar-inner">
                <Link href="/" className="brand">
                  <Image
                    src="/brand/railbird-mark.svg"
                    alt="Railbird logo"
                    width={40}
                    height={40}
                    className="brand-logo"
                    priority
                  />
                  <span className="brand-text">Railbird</span>
                </Link>
                <nav className="top-nav">
                  <Link href="/">Terminal</Link>
                  <Link href="/betting">Rail Bets</Link>
                  <Link href="/leaderboard">Leaderboard</Link>
                  <Link href="/me">My Agents</Link>
                </nav>
                <div className="topbar-actions">
                  <WalletButton />
                </div>
              </div>
            </header>
            <main className="content-shell">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
