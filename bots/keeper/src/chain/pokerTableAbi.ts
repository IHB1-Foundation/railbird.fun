// PokerTable contract ABI - minimal subset needed for keeper bot

export const POKER_TABLE_ABI = [
  // Constants
  {
    type: "function",
    name: "ACTION_TIMEOUT",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },

  // State variables
  {
    type: "function",
    name: "tableId",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "smallBlind",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "bigBlind",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_SEATS",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "gameState",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentHandId",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "actionDeadline",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lastActionBlock",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pendingVRFRequestId",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },

  // View functions
  {
    type: "function",
    name: "getSeat",
    inputs: [{ type: "uint8", name: "seatIndex" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { type: "address", name: "owner" },
          { type: "address", name: "operator" },
          { type: "uint256", name: "stack" },
          { type: "bool", name: "isActive" },
          { type: "uint256", name: "currentBet" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getHandInfo",
    inputs: [],
    outputs: [
      { type: "uint256", name: "handId" },
      { type: "uint256", name: "pot" },
      { type: "uint256", name: "currentBetAmount" },
      { type: "uint8", name: "actorSeat" },
      { type: "uint8", name: "state" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allSeatsFilled",
    inputs: [],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canStartHand",
    inputs: [],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },

  {
    type: "function",
    name: "vrfRequestTimestamp",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "VRF_TIMEOUT",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "holeCommits",
    inputs: [
      { type: "uint256", name: "handId" },
      { type: "uint8", name: "seatIndex" },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isHoleCardsRevealed",
    inputs: [
      { type: "uint256", name: "handId" },
      { type: "uint8", name: "seatIndex" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },

  // Keeper actions
  {
    type: "function",
    name: "forceTimeout",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "startHand",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settleShowdown",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "reRequestVRF",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitHoleCommit",
    inputs: [
      { type: "uint256", name: "handId" },
      { type: "uint8", name: "seatIndex" },
      { type: "bytes32", name: "commitment" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revealHoleCards",
    inputs: [
      { type: "uint256", name: "handId" },
      { type: "uint8", name: "seatIndex" },
      { type: "uint8", name: "card1" },
      { type: "uint8", name: "card2" },
      { type: "bytes32", name: "salt" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // Events
  {
    type: "event",
    name: "HandStarted",
    inputs: [
      { type: "uint256", name: "handId", indexed: true },
      { type: "uint256", name: "smallBlind" },
      { type: "uint256", name: "bigBlind" },
      { type: "uint8", name: "buttonSeat" },
    ],
  },
  {
    type: "event",
    name: "HandSettled",
    inputs: [
      { type: "uint256", name: "handId", indexed: true },
      { type: "uint8", name: "winnerSeat" },
      { type: "uint256", name: "potAmount" },
    ],
  },
  {
    type: "event",
    name: "ForceTimeout",
    inputs: [
      { type: "uint256", name: "handId", indexed: true },
      { type: "uint8", name: "seatIndex", indexed: true },
      { type: "uint8", name: "forcedAction" },
    ],
  },
] as const;
