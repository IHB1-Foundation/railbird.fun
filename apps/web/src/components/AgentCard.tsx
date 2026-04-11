"use client";

/**
 * G-13: Agent Trading Card — Hearthstone/Pokémon style card layout.
 * Shows agent stats in a collectible card format with rarity tier theming.
 *
 * G-12: Personality avatars via CSS gradient + emoji until illustration assets land.
 */

import { useState } from "react";
import { getAgentTier } from "@/lib/rarity";
import { generateNickname } from "@/lib/nicknames";
import { getTopAchievements } from "@/lib/achievements";
import styles from "./AgentCard.module.css";

export interface AgentCardData {
  address: string;
  operatorAddress?: string;
  /** ELO rating (1000 default) */
  elo: number;
  /** Win rate 0–1 */
  winRate: number;
  /** Total hands played */
  handsPlayed: number;
  /** Net ROI as fraction (0.1 = +10%) */
  roi?: number;
  /** Aggression score 0–1 */
  aggressionFactor?: number;
  /** Bluff frequency 0–1 */
  bluffFrequency?: number;
  /** Persona id (shark, maniac, rock, adaptive, etc.) */
  personaId?: string;
  /** Flavor text (from persona description) */
  flavor?: string;
  /** Agent accent color */
  accentColor?: string;
  /** Agent emoji */
  emoji?: string;
}

interface AgentCardProps {
  data: AgentCardData;
  /** Card size: "sm" for leaderboard hover preview, "md" for default, "lg" for profile hero */
  size?: "sm" | "md" | "lg";
  /** If true, show back face (detailed stats). Controlled externally for leaderboard hover. */
  flipped?: boolean;
  className?: string;
}

/**
 * G-12: CSS avatar — personality-based gradient + emoji.
 * Real illustration assets can replace this when available.
 */
function PersonaAvatar({
  emoji,
  accentColor,
  personaId,
  size,
}: {
  emoji?: string;
  accentColor?: string;
  personaId?: string;
  size: "sm" | "md" | "lg";
}) {
  const defaultEmoji = personaId
    ? { shark: "🦈", maniac: "🔥", rock: "🪨", adaptive: "🧠", gto: "🤖" }[personaId] ?? "🃏"
    : "🃏";

  const avatarEmoji = emoji ?? defaultEmoji;
  const accent = accentColor ?? "#8b5cf6";

  return (
    <div
      className={`${styles.avatar} ${styles[`avatarSize${size.toUpperCase()}`]}`}
      style={{
        background: `radial-gradient(circle at 38% 30%, ${accent}44 0%, ${accent}11 60%, rgba(0,0,0,0) 100%)`,
        borderColor: `${accent}66`,
      }}
      aria-hidden="true"
    >
      <span className={styles.avatarEmoji} role="img">{avatarEmoji}</span>
    </div>
  );
}

export function AgentCard({ data, size = "md", flipped: controlledFlipped, className }: AgentCardProps) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isFlipped = controlledFlipped !== undefined ? controlledFlipped : internalFlipped;

  const tierConfig = getAgentTier(data.elo, data.winRate, data.handsPlayed);
  const nickname = generateNickname(data.address);
  const achievements = getTopAchievements({
    elo: data.elo,
    winRate: data.winRate,
    handsPlayed: data.handsPlayed,
    handsWon: Math.round(data.handsPlayed * data.winRate),
    foldFrequency: data.aggressionFactor !== undefined ? 1 - data.aggressionFactor : undefined,
  }, 3);

  const winRatePct = Math.round((data.winRate ?? 0) * 100);
  const roiPct = data.roi !== undefined ? Math.round(data.roi * 100) : null;
  const aggrPct = data.aggressionFactor !== undefined ? Math.round(data.aggressionFactor * 100) : null;
  const bluffPct = data.bluffFrequency !== undefined ? Math.round(data.bluffFrequency * 100) : null;

  return (
    <div
      className={[
        styles.cardScene,
        styles[`size${size.toUpperCase()}`],
        isFlipped ? styles.flipped : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        if (controlledFlipped === undefined) setInternalFlipped((v) => !v);
      }}
      role={controlledFlipped === undefined ? "button" : undefined}
      aria-label={controlledFlipped === undefined ? (isFlipped ? "Show card front" : "Flip to see stats") : undefined}
      tabIndex={controlledFlipped === undefined ? 0 : undefined}
      onKeyDown={
        controlledFlipped === undefined
          ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInternalFlipped((v) => !v); } }
          : undefined
      }
    >
      <div className={styles.cardInner}>
        {/* ── Front Face ── */}
        <div
          className={styles.cardFront}
          style={{
            borderColor: tierConfig.borderColor,
            boxShadow: `0 0 20px ${tierConfig.glowColor}, 0 8px 32px rgba(0,0,0,0.5)`,
          }}
        >
          {/* Tier corner badge */}
          <div className={`${styles.tierBadge} ${styles[tierConfig.tier]}`}>
            {tierConfig.label}
          </div>

          {/* Header: Name + ELO (mana cost position) */}
          <div className={styles.cardHeader}>
            <span className={styles.cardName}>{nickname}</span>
            <span className={styles.cardElo} style={{ color: tierConfig.color }}>{data.elo}</span>
          </div>

          {/* Center: avatar illustration */}
          <PersonaAvatar
            emoji={data.emoji}
            accentColor={data.accentColor}
            personaId={data.personaId}
            size={size}
          />

          {/* Achievements strip (max 3 icons) */}
          {achievements.length > 0 && (
            <div className={styles.achievementStrip} aria-label="Unlocked achievements">
              {achievements.map((a) => (
                <span key={a.id} title={a.title} className={styles.achievementIcon}>{a.icon ?? "🏆"}</span>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className={styles.statsGrid}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{winRatePct}%</span>
              <span className={styles.statLabel}>Win</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{data.handsPlayed}</span>
              <span className={styles.statLabel}>Hands</span>
            </div>
            {roiPct !== null && (
              <div className={styles.stat}>
                <span className={styles.statValue} style={{ color: roiPct >= 0 ? "var(--neon-lime)" : "var(--neon-crimson)" }}>
                  {roiPct >= 0 ? "+" : ""}{roiPct}%
                </span>
                <span className={styles.statLabel}>ROI</span>
              </div>
            )}
          </div>

          {/* Flavor text */}
          {data.flavor && (
            <p className={styles.flavorText}>&ldquo;{data.flavor}&rdquo;</p>
          )}

          {size !== "sm" && (
            <p className={styles.flipHint}>Click to flip</p>
          )}
        </div>

        {/* ── Back Face ── */}
        <div
          className={styles.cardBack}
          style={{ borderColor: tierConfig.borderColor }}
        >
          <div className={styles.backHeader}>
            <span className={styles.backName}>{nickname}</span>
            <span className={styles.backSub}>{data.address.slice(0, 6)}…{data.address.slice(-4)}</span>
          </div>

          <div className={styles.backStats}>
            <div className={styles.backStat}>
              <span className={styles.backStatLabel}>ELO</span>
              <span className={styles.backStatValue} style={{ color: tierConfig.color }}>{data.elo}</span>
            </div>
            <div className={styles.backStat}>
              <span className={styles.backStatLabel}>Win Rate</span>
              <span className={styles.backStatValue}>{winRatePct}%</span>
            </div>
            <div className={styles.backStat}>
              <span className={styles.backStatLabel}>Hands</span>
              <span className={styles.backStatValue}>{data.handsPlayed.toLocaleString()}</span>
            </div>
            {aggrPct !== null && (
              <div className={styles.backStat}>
                <span className={styles.backStatLabel}>Aggression</span>
                <span className={styles.backStatValue}>{aggrPct}%</span>
              </div>
            )}
            {bluffPct !== null && (
              <div className={styles.backStat}>
                <span className={styles.backStatLabel}>Bluff Freq</span>
                <span className={styles.backStatValue}>{bluffPct}%</span>
              </div>
            )}
            {roiPct !== null && (
              <div className={styles.backStat}>
                <span className={styles.backStatLabel}>ROI</span>
                <span
                  className={styles.backStatValue}
                  style={{ color: roiPct >= 0 ? "var(--neon-lime)" : "var(--neon-crimson)" }}
                >
                  {roiPct >= 0 ? "+" : ""}{roiPct}%
                </span>
              </div>
            )}
          </div>

          <div className={styles.backAddress}>
            <span className={styles.backAddressLabel}>Contract</span>
            <span className={`text-mono ${styles.backAddressValue}`} title={data.address}>
              {data.address.slice(0, 10)}…{data.address.slice(-6)}
            </span>
          </div>

          {size !== "sm" && (
            <p className={styles.flipHint}>Click to flip back</p>
          )}
        </div>
      </div>
    </div>
  );
}
