// Contract ABIs for event parsing

export const pokerTableAbi = [
  {
    type: "event",
    name: "SeatUpdated",
    inputs: [
      { indexed: true, name: "seatIndex", type: "uint8" },
      { indexed: false, name: "owner", type: "address" },
      { indexed: false, name: "operator", type: "address" },
      { indexed: false, name: "stack", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "HandStarted",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: false, name: "smallBlind", type: "uint256" },
      { indexed: false, name: "bigBlind", type: "uint256" },
      { indexed: false, name: "buttonSeat", type: "uint8" },
    ],
  },
  {
    type: "event",
    name: "ActionTaken",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: true, name: "seatIndex", type: "uint8" },
      { indexed: false, name: "action", type: "uint8" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "potAfter", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "PotUpdated",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: false, name: "pot", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "BettingRoundComplete",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: false, name: "fromState", type: "uint8" },
      { indexed: false, name: "toState", type: "uint8" },
    ],
  },
  {
    type: "event",
    name: "VRFRequested",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: false, name: "street", type: "uint8" },
      { indexed: false, name: "requestId", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "CommunityCardsDealt",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: false, name: "street", type: "uint8" },
      { indexed: false, name: "cards", type: "uint8[]" },
    ],
  },
  {
    type: "event",
    name: "HandSettled",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: false, name: "winnerSeat", type: "uint8" },
      { indexed: false, name: "potAmount", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "ForceTimeout",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: true, name: "seatIndex", type: "uint8" },
      { indexed: false, name: "forcedAction", type: "uint8" },
    ],
  },
  {
    type: "event",
    name: "HoleCommitSubmitted",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: true, name: "seatIndex", type: "uint8" },
      { indexed: false, name: "commitment", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "HoleCardsRevealed",
    inputs: [
      { indexed: true, name: "handId", type: "uint256" },
      { indexed: true, name: "seatIndex", type: "uint8" },
      { indexed: false, name: "card1", type: "uint8" },
      { indexed: false, name: "card2", type: "uint8" },
    ],
  },
] as const;

export const playerRegistryAbi = [
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "vault", type: "address" },
      { indexed: false, name: "table", type: "address" },
      { indexed: false, name: "operator", type: "address" },
      { indexed: false, name: "metaURI", type: "string" },
    ],
  },
  {
    type: "event",
    name: "OperatorUpdated",
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "oldOperator", type: "address" },
      { indexed: true, name: "newOperator", type: "address" },
    ],
  },
  {
    type: "event",
    name: "OwnerUpdated",
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "oldOwner", type: "address" },
      { indexed: true, name: "newOwner", type: "address" },
    ],
  },
  {
    type: "event",
    name: "MetaURIUpdated",
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: false, name: "oldMetaURI", type: "string" },
      { indexed: false, name: "newMetaURI", type: "string" },
    ],
  },
  {
    type: "event",
    name: "VaultUpdated",
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "oldVault", type: "address" },
      { indexed: true, name: "newVault", type: "address" },
    ],
  },
  {
    type: "event",
    name: "TableUpdated",
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "oldTable", type: "address" },
      { indexed: true, name: "newTable", type: "address" },
    ],
  },
] as const;

export const playerVaultAbi = [
  {
    type: "event",
    name: "VaultSnapshot",
    inputs: [
      { indexed: false, name: "handId", type: "uint256" },
      { indexed: false, name: "A", type: "uint256" },
      { indexed: false, name: "B", type: "uint256" },
      { indexed: false, name: "N", type: "uint256" },
      { indexed: false, name: "P", type: "uint256" },
      { indexed: false, name: "cumulativePnl", type: "int256" },
    ],
  },
  {
    type: "event",
    name: "VaultInitialized",
    inputs: [
      { indexed: true, name: "agentToken", type: "address" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "initialAssets", type: "uint256" },
      { indexed: false, name: "initialNavPerShare", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "SettlementReceived",
    inputs: [
      { indexed: true, name: "table", type: "address" },
      { indexed: false, name: "handId", type: "uint256" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
] as const;

// Game state enum mapping
export const GAME_STATES = [
  "WAITING_FOR_SEATS",
  "HAND_INIT",
  "BETTING_PRE",
  "WAITING_VRF_FLOP",
  "BETTING_FLOP",
  "WAITING_VRF_TURN",
  "BETTING_TURN",
  "WAITING_VRF_RIVER",
  "BETTING_RIVER",
  "SHOWDOWN",
  "SETTLED",
] as const;

export function gameStateToString(state: number): string {
  return GAME_STATES[state] || `UNKNOWN_${state}`;
}

// Action type enum mapping
export const ACTION_TYPES = ["FOLD", "CHECK", "CALL", "RAISE"] as const;

export function actionTypeToString(action: number): string {
  return ACTION_TYPES[action] || `UNKNOWN_${action}`;
}
