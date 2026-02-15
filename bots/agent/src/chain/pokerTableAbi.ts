// PokerTable contract ABI - minimal subset needed for agent bot

export const POKER_TABLE_ABI = [
  // Enums encoded as uint8
  // GameState: WAITING_FOR_SEATS=0, HAND_INIT=1, BETTING_PRE=2, WAITING_VRF_FLOP=3,
  //            BETTING_FLOP=4, WAITING_VRF_TURN=5, BETTING_TURN=6, WAITING_VRF_RIVER=7,
  //            BETTING_RIVER=8, SHOWDOWN=9, SETTLED=10
  // ActionType: FOLD=0, CHECK=1, CALL=2, RAISE=3

  // Constants
  {
    type: "function",
    name: "MAX_SEATS",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
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
    name: "buttonSeat",
    inputs: [],
    outputs: [{ type: "uint8" }],
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

  // Struct getters
  {
    type: "function",
    name: "seats",
    inputs: [{ type: "uint8", name: "seatIndex" }],
    outputs: [
      { type: "address", name: "owner" },
      { type: "address", name: "operator" },
      { type: "uint256", name: "stack" },
      { type: "bool", name: "isActive" },
      { type: "uint256", name: "currentBet" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentHand",
    inputs: [],
    outputs: [
      { type: "uint256", name: "handId" },
      { type: "uint256", name: "pot" },
      { type: "uint256", name: "currentBet" },
      { type: "uint8", name: "actorSeat" },
      { type: "uint8", name: "lastAggressor" },
      { type: "uint8", name: "actionsInRound" },
      { type: "bool[9]", name: "hasActed" },
    ],
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
    name: "getActionDeadline",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canCheck",
    inputs: [{ type: "uint8", name: "seatIndex" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAmountToCall",
    inputs: [{ type: "uint8", name: "seatIndex" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCommunityCards",
    inputs: [],
    outputs: [{ type: "uint8[5]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allSeatsFilled",
    inputs: [],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },

  // Actions
  {
    type: "function",
    name: "fold",
    inputs: [{ type: "uint8", name: "seatIndex" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "check",
    inputs: [{ type: "uint8", name: "seatIndex" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "call",
    inputs: [{ type: "uint8", name: "seatIndex" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "raise",
    inputs: [
      { type: "uint8", name: "seatIndex" },
      { type: "uint256", name: "raiseToAmount" },
    ],
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
    name: "forceTimeout",
    inputs: [],
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
    name: "ActionTaken",
    inputs: [
      { type: "uint256", name: "handId", indexed: true },
      { type: "uint8", name: "seatIndex", indexed: true },
      { type: "uint8", name: "action" },
      { type: "uint256", name: "amount" },
      { type: "uint256", name: "potAfter" },
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
    name: "BettingRoundComplete",
    inputs: [
      { type: "uint256", name: "handId", indexed: true },
      { type: "uint8", name: "fromState" },
      { type: "uint8", name: "toState" },
    ],
  },
  {
    type: "event",
    name: "CommunityCardsDealt",
    inputs: [
      { type: "uint256", name: "handId", indexed: true },
      { type: "uint8", name: "street" },
      { type: "uint8[]", name: "cards" },
    ],
  },
] as const;
