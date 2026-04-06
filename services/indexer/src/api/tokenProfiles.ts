// Token profile configuration — extracted from routes.ts for maintainability.
// T-M6-05: move TOKEN_PROFILES to a separate config file.

export type PlayerKey = "a" | "b" | "c" | "d";

export interface TokenProfile {
  key: PlayerKey;
  slug: string;
  player: "A" | "B" | "C" | "D";
  name: string;
  symbol: string;
  archetype: string;
  aggression: string;
  riskProfile: string;
  style: string;
  description: string;
  palette: {
    bgA: string;
    bgB: string;
    accent: string;
    text: string;
  };
}

export const TOKEN_PROFILES: Record<PlayerKey, TokenProfile> = {
  a: {
    key: "a",
    slug: "player-a",
    player: "A",
    name: "Railbird Player A",
    symbol: "RBPA",
    archetype: "Tight",
    aggression: "0.15",
    riskProfile: "Low",
    style: "Selective preflop entries and value-first betting lines.",
    description:
      "Disciplined tight profile focused on high-probability spots, bankroll protection, and low-variance play.",
    palette: {
      bgA: "#0f172a",
      bgB: "#1e293b",
      accent: "#22d3ee",
      text: "#e2e8f0",
    },
  },
  b: {
    key: "b",
    slug: "player-b",
    player: "B",
    name: "Railbird Player B",
    symbol: "RBPB",
    archetype: "Balanced",
    aggression: "0.35",
    riskProfile: "Medium",
    style: "Adaptive tempo with controlled pressure and robust showdown paths.",
    description:
      "Balanced profile that blends positional pressure and pot control, aiming for steady edge across streets.",
    palette: {
      bgA: "#052e16",
      bgB: "#14532d",
      accent: "#4ade80",
      text: "#dcfce7",
    },
  },
  c: {
    key: "c",
    slug: "player-c",
    player: "C",
    name: "Railbird Player C",
    symbol: "RBPC",
    archetype: "Loose",
    aggression: "0.60",
    riskProfile: "High",
    style: "Wider ranges, frequent probes, and momentum-driven turn pressure.",
    description:
      "Loose profile that opens wider and contests more pots, trading variance for higher upside in active games.",
    palette: {
      bgA: "#172554",
      bgB: "#1d4ed8",
      accent: "#60a5fa",
      text: "#dbeafe",
    },
  },
  d: {
    key: "d",
    slug: "player-d",
    player: "D",
    name: "Railbird Player D",
    symbol: "RBPD",
    archetype: "Maniac",
    aggression: "0.85",
    riskProfile: "Very High",
    style: "Relentless pressure, high-bet frequency, and volatility-first strategy.",
    description:
      "Maniac profile optimized for maximum table pressure, forcing difficult decisions and embracing volatility.",
    palette: {
      bgA: "#3b0764",
      bgB: "#6b21a8",
      accent: "#c084fc",
      text: "#f3e8ff",
    },
  },
};
