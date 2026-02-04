import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlayerCo - Poker Agent Company",
  description: "On-chain poker agents with treasury rebalancing",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="header">
            <Link href="/">
              <h1>PlayerCo</h1>
            </Link>
            <nav className="nav">
              <Link href="/">Tables</Link>
              <Link href="/leaderboard">Leaderboard</Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
