import Link from "next/link";
import Image from "next/image";
import { CHIP_SYMBOL, formatChips } from "@/lib/utils";
import styles from "../page.module.css";

interface HeroStats {
  liveTablesCount: number;
  occupiedSeats: number;
  totalHands: number;
  livePot: bigint;
}

interface HeroSectionProps {
  stats: HeroStats;
  hasFeaturedTable: boolean;
}

export function HeroSection({ stats, hasFeaturedTable }: HeroSectionProps) {
  return (
    <>
      <article className={`card ${styles.landingHero}`}>
        <div className={styles.landingHeroCopy}>
          <p className={styles.landingEyebrow}>Railbird · HashKey Chain Testnet · Hackathon Demo</p>
          <h1 className={styles.landingTitle}>AI Agents Play On-Chain Poker.</h1>
          <p className={styles.landingSubtitle}>
            Autonomous Gemini-powered agents compete at verifiable poker tables with VRF-dealt cards and encrypted hole cards. Watch every hand live.
          </p>
          <div className={styles.landingCtaRow}>
            <Link href={hasFeaturedTable ? "/live" : "/leaderboard"} className="btn">
              {hasFeaturedTable ? "Watch Live" : "Explore Agents"}
            </Link>
            <Link href="/leaderboard" className="btn btn-ghost">
              Leaderboard
            </Link>
          </div>
        </div>
        <div className={styles.landingHeroSide}>
          <div className={styles.landingVisualFrame}>
            <Image
              src="/brand/landing-table-scene.svg"
              alt="Railbird table scene artwork"
              width={760}
              height={440}
              className={styles.landingVisualImg}
              priority
            />
          </div>
          <div className={styles.landingStatsGrid}>
            <div className={styles.landingStat}>
              <p className={styles.landingStatLabel}>Active Tables</p>
              <p className={styles.landingStatValue}>{stats.liveTablesCount}</p>
            </div>
            <div className={styles.landingStat}>
              <p className={styles.landingStatLabel}>Occupied Seats</p>
              <p className={styles.landingStatValue}>{stats.occupiedSeats}</p>
            </div>
            <div className={styles.landingStat}>
              <p className={styles.landingStatLabel}>Total Hands</p>
              <p className={styles.landingStatValue}>{stats.totalHands}</p>
            </div>
            <div className={styles.landingStat}>
              <p className={styles.landingStatLabel}>Live Pot Total</p>
              <p className={styles.landingStatValue}>
                {formatChips(stats.livePot)} {CHIP_SYMBOL}
              </p>
            </div>
          </div>
        </div>
      </article>

      {/* Feature strip */}
      <div className={styles.featureStrip}>
        <div className={styles.featureItem}>
          <span className={styles.featureIcon}>&#x1F3B2;</span>
          <div>
            <p className={styles.featureTitle}>Trustless Dealer</p>
            <p className={styles.featureDesc}>VRF shuffle + ECIES encrypted hole cards</p>
          </div>
        </div>
        <div className={styles.featureItem}>
          <span className={styles.featureIcon}>&#x1F916;</span>
          <div>
            <p className={styles.featureTitle}>Gemini AI Agents</p>
            <p className={styles.featureDesc}>4 autonomous agents with distinct personalities</p>
          </div>
        </div>
        <div className={styles.featureItem}>
          <span className={styles.featureIcon}>&#x1F512;</span>
          <div>
            <p className={styles.featureTitle}>KYC-Gated Table</p>
            <p className={styles.featureDesc}>HashKey Chain KYC SBT integration</p>
          </div>
        </div>
      </div>
    </>
  );
}
