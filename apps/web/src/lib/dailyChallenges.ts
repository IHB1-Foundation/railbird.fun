/**
 * G-29: Daily challenge system
 * Challenges rotate every 24h, seeded by UTC date.
 */

export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  /** localStorage key to track completion */
  completionKey: string;
}

const ALL_CHALLENGES: DailyChallenge[] = [
  {
    id: "watch_showdown",
    title: "Watch a Showdown",
    description: "Watch an all-in showdown on any live table",
    icon: "🎴",
    xpReward: 20,
    completionKey: "challenge:watch_showdown",
  },
  {
    id: "bet_rail",
    title: "Place a Rail Bet",
    description: "Bet on 3 rails in the betting arena",
    icon: "🎲",
    xpReward: 30,
    completionKey: "challenge:bet_rail",
  },
  {
    id: "create_agent",
    title: "Deploy Your Agent",
    description: "Create and deploy your first AI agent",
    icon: "🤖",
    xpReward: 100,
    completionKey: "challenge:create_agent",
  },
  {
    id: "check_leaderboard",
    title: "Scout the Competition",
    description: "Check the leaderboard and review the top agent's profile",
    icon: "🏆",
    xpReward: 10,
    completionKey: "challenge:check_leaderboard",
  },
  {
    id: "watch_live",
    title: "Watch Live Action",
    description: "Spend 5 minutes watching a live table",
    icon: "📺",
    xpReward: 15,
    completionKey: "challenge:watch_live",
  },
  {
    id: "view_evolution",
    title: "Study the Meta",
    description: "Review your agent's evolution stats and GTO deviation",
    icon: "📈",
    xpReward: 20,
    completionKey: "challenge:view_evolution",
  },
  {
    id: "share_agent",
    title: "Show Off Your Agent",
    description: "Copy and share your agent's profile link",
    icon: "📣",
    xpReward: 15,
    completionKey: "challenge:share_agent",
  },
];

/**
 * Get today's challenge (deterministic by UTC date)
 */
export function getDailyChallenge(): DailyChallenge {
  const now = new Date();
  const dayIndex = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
  return ALL_CHALLENGES[dayIndex % ALL_CHALLENGES.length];
}

/**
 * Check if today's challenge is completed (localStorage)
 */
export function isDailyChallengeCompleted(): boolean {
  if (typeof window === "undefined") return false;
  const challenge = getDailyChallenge();
  const stored = localStorage.getItem(challenge.completionKey);
  if (!stored) return false;
  // Check it was completed today
  const completedDate = new Date(parseInt(stored, 10));
  const today = new Date();
  return (
    completedDate.getUTCFullYear() === today.getUTCFullYear() &&
    completedDate.getUTCMonth() === today.getUTCMonth() &&
    completedDate.getUTCDate() === today.getUTCDate()
  );
}

/**
 * Mark today's challenge as completed
 */
export function completeDailyChallenge(): void {
  if (typeof window === "undefined") return;
  const challenge = getDailyChallenge();
  localStorage.setItem(challenge.completionKey, String(Date.now()));
}
