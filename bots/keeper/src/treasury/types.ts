// Treasury rebalancing types for AI-driven advisor

export interface RebalanceContext {
  navPerShare: bigint;             // current NAV per share (in base units)
  externalAssets: bigint;          // vault external assets (in base units)
  treasuryShares: bigint;          // vault's own token holdings
  outstandingShares: bigint;       // circulating supply (totalSupply - treasuryShares)
  tokenMarketPrice: bigint;        // current market price on nad.fun (in base units)
  recentPnl: bigint;              // this hand's PnL
  cumulativePnl: bigint;           // cumulative PnL
  tokenStage: string;              // "bonding" | "locked" | "graduated"
  rebalanceMaxMonBps: number;      // max buy rebalance size (bps of externalAssets)
  rebalanceMaxTokenBps: number;    // max sell rebalance size (bps of treasuryShares)
}

export interface RebalanceRecommendation {
  action: "buy" | "sell" | "skip";
  amountBps: number;               // recommended rebalancing size (bps)
  reasoning: string;               // AI analysis rationale
  confidence: number;              // 0.0 – 1.0
  factors: {
    navVsMarket: string;           // e.g. "NAV $1.20 vs market $0.95 — 21% discount"
    pnlTrend: string;              // e.g. "positive hand +1200 chips"
    sizeJustification: string;     // e.g. "conservative 50bps — early bonding stage"
  };
}
