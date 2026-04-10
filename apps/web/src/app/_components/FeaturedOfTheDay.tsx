"use client";

import Link from "next/link";
import styles from "./FeaturedOfTheDay.module.css";
import { getSeasonLabel } from "@/lib/season";
import { getDailyChallenge } from "@/lib/dailyChallenges";

interface FeaturedTable {
  tableAddress: string;
  handCount: number;
  activePlayers: number;
  potSize: string;
}

interface FeaturedOfTheDayProps {
  featuredTable?: FeaturedTable | null;
}

/**
 * G-40: Daily rotating featured card on the homepage.
 * Shows today's hottest table + daily challenge.
 */
export function FeaturedOfTheDay({ featuredTable }: FeaturedOfTheDayProps) {
  const seasonLabel = getSeasonLabel();
  const challenge = getDailyChallenge();

  return (
    <div className={styles.row}>
      {/* Season progress banner */}
      <div className={`card ${styles.seasonCard}`}>
        <p className={styles.seasonLabel}>
          <span className={styles.liveIndicator} aria-hidden="true">●</span>
          {seasonLabel}
        </p>
        <p className={styles.seasonSub}>Season rankings reset at end of period</p>
      </div>

      {/* Daily challenge */}
      <div className={`card ${styles.challengeCard}`}>
        <p className={styles.challengeEyebrow}>TODAY&apos;S OBJECTIVE</p>
        <div className={styles.challengeBody}>
          <span className={styles.challengeIcon} aria-hidden="true">{challenge.icon}</span>
          <div>
            <p className={styles.challengeTitle}>{challenge.title}</p>
            <p className={styles.challengeDesc}>{challenge.description}</p>
          </div>
        </div>
        <p className={styles.challengeXp}>+{challenge.xpReward} XP</p>
      </div>

      {/* Featured table (if available) */}
      {featuredTable && (
        <Link href={`/table/${featuredTable.tableAddress}`} className={`card card-hover ${styles.featuredCard}`}>
          <p className={styles.featuredEyebrow}>🔥 HOTTEST TABLE</p>
          <div className={styles.featuredStats}>
            <div className={styles.featuredStat}>
              <span className={styles.featuredStatValue}>{featuredTable.handCount}</span>
              <span className={styles.featuredStatLabel}>Hands</span>
            </div>
            <div className={styles.featuredStat}>
              <span className={styles.featuredStatValue}>{featuredTable.activePlayers}</span>
              <span className={styles.featuredStatLabel}>Players</span>
            </div>
            <div className={styles.featuredStat}>
              <span className={styles.featuredStatValue}>{featuredTable.potSize}</span>
              <span className={styles.featuredStatLabel}>Live Pot</span>
            </div>
          </div>
          <p className={styles.featuredCta}>Watch now →</p>
        </Link>
      )}
    </div>
  );
}
