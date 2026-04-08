// Feature-vector embedder for hand summaries (Option B — offline, no external API)
// Produces a ~20-dimensional numeric vector from HandSummary fields.

import type { HandSummary } from "./types.js";

const POSITION_MAP: Record<string, number> = {
  BTN: 3,
  CO: 2,
  MP: 1,
  UTG: 0,
  SB: 1,
  BB: 0,
};

function positionScore(position: string): number {
  return (POSITION_MAP[position.toUpperCase()] ?? 1) / 3; // 0–1
}

const BOARD_WETNESS: Record<string, number> = {
  "dry rainbow": 0.0,
  dry: 0.1,
  "paired board": 0.2,
  "low connected": 0.3,
  "one suit": 0.5,
  "flush draw": 0.7,
  "wet flush draw": 0.8,
  "two tone": 0.6,
  wet: 0.7,
};

function boardWetness(texture: string): number {
  const lower = texture.toLowerCase();
  for (const [key, val] of Object.entries(BOARD_WETNESS)) {
    if (lower.includes(key)) return val;
  }
  return 0.3; // default medium
}

function parseHoleCardStrength(holeCards: string): number {
  // Simple: rank the high card and pair bonus
  const cards = holeCards.split(" ");
  if (cards.length < 2) return 0.5;
  const ranks: Record<string, number> = {
    "2": 0, "3": 1, "4": 2, "5": 3, "6": 4, "7": 5, "8": 6,
    "9": 7, "T": 8, "J": 9, "Q": 10, "K": 11, "A": 12,
  };
  const r1 = ranks[cards[0][0]] ?? 6;
  const r2 = ranks[cards[1][0]] ?? 6;
  const isPair = r1 === r2;
  const high = Math.max(r1, r2) / 12;
  const low = Math.min(r1, r2) / 12;
  const suited = cards[0][1] === cards[1][1] ? 0.1 : 0;
  const base = isPair ? 0.5 + high * 0.5 : high * 0.7 + low * 0.2 + suited;
  return Math.min(1, base);
}

function actionCounts(actions: string[]): { raises: number; calls: number; checks: number; total: number } {
  let raises = 0, calls = 0, checks = 0;
  for (const a of actions) {
    const lower = a.toLowerCase();
    if (lower.startsWith("raise")) raises++;
    else if (lower === "call") calls++;
    else if (lower === "check") checks++;
  }
  return { raises, calls, checks, total: actions.length };
}

/** Convert a HandSummary into a ~20-dimensional feature vector (all values 0–1). */
export function embedHand(summary: HandSummary): number[] {
  const position = positionScore(summary.position);
  const handStrength = parseHoleCardStrength(summary.holeCards);
  const wetness = boardWetness(summary.boardTexture);
  const result = summary.result === "won" ? 1 : summary.result === "split" ? 0.5 : 0;
  const pnlNormalized = Math.tanh(Number(summary.pnl) / 1000); // squash large values to (-1,1), then shift
  const pnlNorm01 = (pnlNormalized + 1) / 2; // 0–1
  const streetCount = Math.min(summary.actions.length, 4) / 4;

  const myActions = actionCounts(summary.actions);
  const oppActions = actionCounts(summary.opponentActions);

  const myRaiseRate = myActions.total > 0 ? myActions.raises / myActions.total : 0;
  const myCallRate = myActions.total > 0 ? myActions.calls / myActions.total : 0;
  const myCheckRate = myActions.total > 0 ? myActions.checks / myActions.total : 0;
  const oppRaiseRate = oppActions.total > 0 ? oppActions.raises / oppActions.total : 0;
  const oppCallRate = oppActions.total > 0 ? oppActions.calls / oppActions.total : 0;
  const oppFoldRate = oppActions.total > 0 ? 1 - oppCallRate - oppRaiseRate : 0;
  const hasReasoning = summary.reasoning ? 1 : 0;
  const communityCardsCount = summary.communityCards.split(" ").filter(Boolean).length / 5;

  return [
    position,
    handStrength,
    wetness,
    result,
    pnlNorm01,
    streetCount,
    myRaiseRate,
    myCallRate,
    myCheckRate,
    oppRaiseRate,
    oppCallRate,
    Math.max(0, oppFoldRate),
    Math.min(myActions.total / 10, 1),     // total actions (normalized)
    Math.min(myActions.raises / 3, 1),      // raise count
    communityCardsCount,
    hasReasoning,
    // Padding / extra features
    (handStrength + result) / 2,            // combined strength+result
    (position + (1 - wetness)) / 2,         // position advantage vs board
    Math.min(myActions.calls / 4, 1),       // calls count
    myRaiseRate > 0 ? wetness : 0,          // bluff indicator (raised on wet board)
  ];
}

/** Cosine similarity between two equal-length vectors. Returns 0–1. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Build a query vector from partial game state info for similarity search. */
export function buildQueryVector(params: {
  position: string;
  holeCards: string;
  boardTexture: string;
}): number[] {
  const summary: HandSummary = {
    handId: "query",
    position: params.position,
    holeCards: params.holeCards,
    communityCards: "",
    actions: [],
    result: "lost",
    pnl: 0n,
    boardTexture: params.boardTexture,
    opponentActions: [],
  };
  return embedHand(summary);
}
