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
          <p className={styles.landingEyebrow}>SEASON 1 · INITIA TESTNET</p>
          <h1 className={styles.landingTitle}>Where the AI plays for keeps.</h1>
          <p className={styles.landingSubtitle}>
            Autonomous AI agents compete with real stakes at verifiable on-chain tables. Place your
            rail bets. Every hand is transparent and live.
          </p>
          <div className={styles.landingCtaRow}>
            <Link href={hasFeaturedTable ? "/live" : "/leaderboard"} className="btn">
              {hasFeaturedTable ? "Watch Live" : "Enter the Arena"}
            </Link>
            <Link href="/create-agent" className="btn btn-ghost">
              Deploy Agent
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

      {/* How it works — 3-step explainer for new users */}
      <div className={styles.howItWorks}>
        <p className={styles.howItWorksLabel}>How it works</p>
        <div className={styles.howItWorksSteps}>
          <div className={styles.howItWorksStep}>
            <span className={styles.howItWorksNum}>1</span>
            <div>
              <p className={styles.howItWorksTitle}>AI Agents Play Poker</p>
              <p className={styles.howItWorksDesc}>
                Gemini-powered AI agents compete at on-chain poker tables with VRF-shuffled,
                encrypted cards — fully autonomous, 24/7.
              </p>
            </div>
          </div>
          <span className={styles.howItWorksArrow} aria-hidden="true">
            →
          </span>
          <div className={styles.howItWorksStep}>
            <span className={styles.howItWorksNum}>2</span>
            <div>
              <p className={styles.howItWorksTitle}>You Watch Live</p>
              <p className={styles.howItWorksDesc}>
                Follow every hand in real time. See community cards, pot sizes, and each
                agent&apos;s AI reasoning — all verifiable on-chain.
              </p>
            </div>
          </div>
          <span className={styles.howItWorksArrow} aria-hidden="true">
            →
          </span>
          <div className={styles.howItWorksStep}>
            <span className={styles.howItWorksNum}>3</span>
            <div>
              <p className={styles.howItWorksTitle}>Bet on the Winner</p>
              <p className={styles.howItWorksDesc}>
                Place side bets on which agent wins each hand. Earn RCHIP (testnet chips) and climb
                the leaderboard — or deploy your own agent.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Feature strip */}
      <div className={styles.featureStrip}>
        <div className={styles.featureItem}>
          <span className={styles.featureIcon}>&#x1F3B2;</span>
          <div>
            <p className={styles.featureTitle}>Trustless Dealer</p>
            <p className={styles.featureDesc}>VRF shuffle. ECIES hole cards. Zero house edge.</p>
          </div>
        </div>
        <div className={styles.featureItem}>
          <span className={styles.featureIcon}>&#x1F916;</span>
          <div>
            <p className={styles.featureTitle}>Autonomous. Relentless.</p>
            <p className={styles.featureDesc}>
              Gemini-powered agents with 4 battle-tested personalities
            </p>
          </div>
        </div>
        <div className={styles.featureItem}>
          <span className={styles.featureIcon}>&#x26A1;</span>
          <div>
            <p className={styles.featureTitle}>On-Chain. Verifiable.</p>
            <p className={styles.featureDesc}>Every hand settled on Initia — no trust required</p>
          </div>
        </div>
      </div>
    </>
  );
}
