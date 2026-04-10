/**
 * G-28: Agent XP & Level system
 *
 * XP sources:
 *   hand played  → +1
 *   hand won     → +5
 *   bluff win    → +10
 *   jackpot win  → +50
 *
 * Level 1–50 with exponential XP curve.
 */

export interface XpEvent {
  type: "hand_played" | "hand_won" | "bluff_win" | "jackpot";
  multiplier?: number;
}

const XP_TABLE: Record<XpEvent["type"], number> = {
  hand_played: 1,
  hand_won: 5,
  bluff_win: 10,
  jackpot: 50,
};

/** Max level */
export const MAX_LEVEL = 50;

/**
 * Total XP required to reach a given level.
 * Exponential curve: xpForLevel(n) ≈ 100 * n^1.8
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.8));
}

/**
 * XP required to go from current level to next level
 */
export function xpToNextLevel(currentLevel: number): number {
  return xpForLevel(currentLevel + 1) - xpForLevel(currentLevel);
}

/**
 * Current level from total XP
 */
export function getLevelFromXp(totalXp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= totalXp) {
    level++;
  }
  return level;
}

/**
 * Progress within current level (0–1)
 */
export function getLevelProgress(totalXp: number): number {
  const level = getLevelFromXp(totalXp);
  if (level >= MAX_LEVEL) return 1;
  const levelStart = xpForLevel(level);
  const levelEnd = xpForLevel(level + 1);
  return (totalXp - levelStart) / (levelEnd - levelStart);
}

/**
 * Calculate XP gain for an event
 */
export function getXpGain(event: XpEvent): number {
  const base = XP_TABLE[event.type] ?? 0;
  return Math.round(base * (event.multiplier ?? 1));
}

/**
 * Calculate total XP from agent stats
 */
export function calculateTotalXp(stats: {
  handsPlayed: number;
  handsWon: number;
  bluffWins?: number;
  jackpots?: number;
}): number {
  return (
    stats.handsPlayed * XP_TABLE.hand_played +
    stats.handsWon * XP_TABLE.hand_won +
    (stats.bluffWins ?? 0) * XP_TABLE.bluff_win +
    (stats.jackpots ?? 0) * XP_TABLE.jackpot
  );
}

/**
 * Get level display info
 */
export interface LevelInfo {
  level: number;
  totalXp: number;
  xpInLevel: number;
  xpNeeded: number;
  progress: number;
  isMaxLevel: boolean;
}

export function getLevelInfo(totalXp: number): LevelInfo {
  const level = getLevelFromXp(totalXp);
  const levelStart = xpForLevel(level);
  const levelEnd = level >= MAX_LEVEL ? totalXp : xpForLevel(level + 1);
  const xpInLevel = totalXp - levelStart;
  const xpNeeded = levelEnd - levelStart;

  return {
    level,
    totalXp,
    xpInLevel,
    xpNeeded,
    progress: getLevelProgress(totalXp),
    isMaxLevel: level >= MAX_LEVEL,
  };
}
