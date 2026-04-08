// Hand history RAG types

export interface HandSummary {
  handId: string;
  position: string;                // "BTN", "SB", "BB", etc.
  holeCards: string;               // "Ah Kd"
  communityCards: string;          // "As 7h 2c Td 9s"
  actions: string[];               // ["raise 200", "call", "check"]
  result: "won" | "lost" | "split";
  pnl: bigint;
  boardTexture: string;            // "dry rainbow", "wet flush draw", etc.
  opponentActions: string[];       // opponent action sequence
  reasoning?: string;             // AI reasoning from this hand
}

export interface HandVector {
  handId: string;
  summary: HandSummary;
  embedding: number[];             // feature vector (option B — offline)
}

/** Serializable form of HandVector (pnl as string since JSON can't handle bigint) */
export interface HandVectorSerialized {
  handId: string;
  summary: Omit<HandSummary, "pnl"> & { pnl: string };
  embedding: number[];
}
