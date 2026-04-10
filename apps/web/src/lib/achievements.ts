/**
 * G-16: Achievement & Title system
 * Defines all achievements with unlock conditions, badge icons, and display metadata.
 */

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** Short flavor text displayed on badge */
  flavor: string;
  /** Emoji icon for badge */
  icon: string;
  /** Category grouping */
  category: "combat" | "skill" | "grind" | "social" | "special";
  /** Tier: bronze / silver / gold / platinum */
  tier: "bronze" | "silver" | "gold" | "platinum";
  /** Check function — returns true if agent stats satisfy this achievement */
  check: (stats: AgentAchievementStats) => boolean;
  /** Progress fraction 0–1 for locked achievements */
  progress?: (stats: AgentAchievementStats) => number;
}

export interface AgentAchievementStats {
  handsPlayed: number;
  handsWon: number;
  riverReversal?: number; // hands won on the river after trailing
  coolerWins?: number;    // won against AA/KK
  bluffNoShowdown?: number; // won without showdown
  bigPotWins?: number;    // pots over 1000 chips won
  nemesisWins?: Record<string, number>; // wins against specific opponents
  consecutiveWins?: number;
  foldFrequency?: number; // 0–1
  elo: number;
  winRate: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "river_rat",
    title: "River Rat",
    description: "Win 5 hands on the river after trailing",
    flavor: "They said fold. You said ship it.",
    icon: "🌊",
    category: "combat",
    tier: "silver",
    check: (s) => (s.riverReversal ?? 0) >= 5,
    progress: (s) => Math.min((s.riverReversal ?? 0) / 5, 1),
  },
  {
    id: "cooler",
    title: "Cooler",
    description: "Win 10 hands against AA or KK",
    flavor: "Aces? Nice hand. Better luck next time.",
    icon: "🧊",
    category: "combat",
    tier: "gold",
    check: (s) => (s.coolerWins ?? 0) >= 10,
    progress: (s) => Math.min((s.coolerWins ?? 0) / 10, 1),
  },
  {
    id: "ice_cold",
    title: "Ice Cold",
    description: "Play 200 hands with zero bluffs",
    flavor: "Pure GTO. No tricks needed.",
    icon: "🥶",
    category: "skill",
    tier: "gold",
    check: (s) => s.handsPlayed >= 200 && (s.bluffNoShowdown ?? 0) === 0,
    progress: (s) => Math.min(s.handsPlayed / 200, 1),
  },
  {
    id: "jackpot",
    title: "Jackpot",
    description: "Win a single pot of 1000+ chips",
    flavor: "The table felt it.",
    icon: "💰",
    category: "combat",
    tier: "silver",
    check: (s) => (s.bigPotWins ?? 0) >= 1,
    progress: (s) => (s.bigPotWins ?? 0) >= 1 ? 1 : 0,
  },
  {
    id: "nemesis",
    title: "Nemesis",
    description: "Beat the same opponent 10 times",
    flavor: "They know your name. They fear it.",
    icon: "⚔️",
    category: "social",
    tier: "gold",
    check: (s) => {
      const wins = s.nemesisWins ?? {};
      return Object.values(wins).some((w) => w >= 10);
    },
    progress: (s) => {
      const wins = s.nemesisWins ?? {};
      const max = Math.max(0, ...Object.values(wins));
      return Math.min(max / 10, 1);
    },
  },
  {
    id: "grinder",
    title: "Grinder",
    description: "Play 1000 hands",
    flavor: "Volume is a strategy.",
    icon: "⚙️",
    category: "grind",
    tier: "bronze",
    check: (s) => s.handsPlayed >= 1000,
    progress: (s) => Math.min(s.handsPlayed / 1000, 1),
  },
  {
    id: "centurion",
    title: "Centurion",
    description: "Play 100 hands",
    flavor: "First 100 is just the warmup.",
    icon: "💯",
    category: "grind",
    tier: "bronze",
    check: (s) => s.handsPlayed >= 100,
    progress: (s) => Math.min(s.handsPlayed / 100, 1),
  },
  {
    id: "hot_streak",
    title: "Hot Streak",
    description: "Win 5 consecutive hands",
    flavor: "Variance? Never heard of her.",
    icon: "🔥",
    category: "combat",
    tier: "silver",
    check: (s) => (s.consecutiveWins ?? 0) >= 5,
    progress: (s) => Math.min((s.consecutiveWins ?? 0) / 5, 1),
  },
  {
    id: "legend",
    title: "Legend",
    description: "Reach ELO 1700+",
    flavor: "The algorithm fears you.",
    icon: "👑",
    category: "skill",
    tier: "platinum",
    check: (s) => s.elo >= 1700,
    progress: (s) => Math.min((s.elo - 1000) / 700, 1),
  },
  {
    id: "nit",
    title: "Nit",
    description: "Maintain >60% fold rate over 100 hands",
    flavor: "If in doubt, fold it out.",
    icon: "🐢",
    category: "skill",
    tier: "bronze",
    check: (s) => s.handsPlayed >= 100 && (s.foldFrequency ?? 0) >= 0.6,
    progress: (s) => s.handsPlayed >= 100 ? ((s.foldFrequency ?? 0) >= 0.6 ? 1 : (s.foldFrequency ?? 0) / 0.6) : s.handsPlayed / 100,
  },
];

/**
 * Get all unlocked achievements for an agent
 */
export function getUnlockedAchievements(stats: AgentAchievementStats): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.check(stats));
}

/**
 * Get achievement progress (0–1) for a specific achievement
 */
export function getAchievementProgress(id: string, stats: AgentAchievementStats): number {
  const achievement = ACHIEVEMENTS.find((a) => a.id === id);
  if (!achievement) return 0;
  if (achievement.check(stats)) return 1;
  return achievement.progress?.(stats) ?? 0;
}

/**
 * Get top N achievements for leaderboard badge display
 */
export function getTopAchievements(stats: AgentAchievementStats, limit = 3): Achievement[] {
  const tierOrder: Record<Achievement["tier"], number> = {
    platinum: 4,
    gold: 3,
    silver: 2,
    bronze: 1,
  };
  return getUnlockedAchievements(stats)
    .sort((a, b) => tierOrder[b.tier] - tierOrder[a.tier])
    .slice(0, limit);
}
