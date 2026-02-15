import type { Metadata } from "next";
import Link from "next/link";
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
                  <span className="brand-mark" />
                  <span className="brand-text">Railbird</span>
                </Link>
                <nav className="top-nav">
                  <Link href="/">Terminal</Link>
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
