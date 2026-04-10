/**
 * G-14: Rarity tier system — 5 tiers based on ELO / win rate
 *
 * Common → Rare → Epic → Legendary → Mythic
 */

export type RarityTier = "common" | "rare" | "epic" | "legendary" | "mythic";

export interface TierConfig {
  tier: RarityTier;
  label: string;
  minElo: number;
  color: string;
  glowColor: string;
  borderColor: string;
  badgeClass: string;
}

export const TIER_CONFIG: TierConfig[] = [
  {
    tier: "mythic",
    label: "MYTHIC",
    minElo: 2000,
    color: "#facc15",
    glowColor: "rgba(250, 204, 21, 0.6)",
    borderColor: "rgba(250, 204, 21, 0.8)",
    badgeClass: "tier-mythic",
  },
  {
    tier: "legendary",
    label: "LEGENDARY",
    minElo: 1700,
    color: "#facc15",
    glowColor: "rgba(250, 204, 21, 0.4)",
    borderColor: "rgba(250, 204, 21, 0.6)",
    badgeClass: "tier-legendary",
  },
  {
    tier: "epic",
    label: "EPIC",
    minElo: 1500,
    color: "#a78bfa",
    glowColor: "rgba(167, 139, 250, 0.4)",
    borderColor: "rgba(167, 139, 250, 0.6)",
    badgeClass: "tier-epic",
  },
  {
    tier: "rare",
    label: "RARE",
    minElo: 1300,
    color: "#22d3ee",
    glowColor: "rgba(34, 211, 238, 0.35)",
    borderColor: "rgba(34, 211, 238, 0.5)",
    badgeClass: "tier-rare",
  },
  {
    tier: "common",
    label: "COMMON",
    minElo: 0,
    color: "#9ba3c1",
    glowColor: "rgba(155, 163, 193, 0.2)",
    borderColor: "rgba(155, 163, 193, 0.3)",
    badgeClass: "tier-common",
  },
];

/**
 * Get rarity tier config from ELO score
 */
export function getTierByElo(elo: number): TierConfig {
  for (const config of TIER_CONFIG) {
    if (elo >= config.minElo) return config;
  }
  return TIER_CONFIG[TIER_CONFIG.length - 1]; // fallback: common
}

/**
 * Get rarity tier config from win rate (0–1) as secondary signal
 */
export function getTierByWinRate(winRate: number, handsPlayed: number): TierConfig {
  // Require minimum hands to qualify for high tiers
  if (handsPlayed < 50) return TIER_CONFIG[TIER_CONFIG.length - 1];

  if (winRate >= 0.65) return TIER_CONFIG[0]; // mythic
  if (winRate >= 0.55) return TIER_CONFIG[1]; // legendary
  if (winRate >= 0.45) return TIER_CONFIG[2]; // epic
  if (winRate >= 0.35) return TIER_CONFIG[3]; // rare
  return TIER_CONFIG[TIER_CONFIG.length - 1];
}

/**
 * Combined tier: higher of ELO-based or winRate-based
 */
export function getAgentTier(elo: number, winRate?: number, handsPlayed?: number): TierConfig {
  const eloTier = getTierByElo(elo);
  if (winRate !== undefined && handsPlayed !== undefined) {
    const wrTier = getTierByWinRate(winRate, handsPlayed);
    // Return whichever has a lower index (higher tier)
    const eloIdx = TIER_CONFIG.findIndex((c) => c.tier === eloTier.tier);
    const wrIdx = TIER_CONFIG.findIndex((c) => c.tier === wrTier.tier);
    return eloIdx <= wrIdx ? eloTier : wrTier;
  }
  return eloTier;
}
