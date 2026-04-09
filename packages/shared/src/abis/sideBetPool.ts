// SideBetPool contract ABI
export const SIDE_BET_POOL_ABI = [
  {
    type: "function",
    name: "placeBet",
    inputs: [
      { name: "table", type: "address" },
      { name: "handId", type: "uint256" },
      { name: "seatIndex", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "settleBets",
    inputs: [
      { name: "table", type: "address" },
      { name: "handId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimWinnings",
    inputs: [
      { name: "table", type: "address" },
      { name: "handId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getPoolInfo",
    inputs: [
      { name: "table", type: "address" },
      { name: "handId", type: "uint256" },
    ],
    outputs: [
      {
        name: "pool",
        type: "tuple",
        components: [
          { name: "table", type: "address" },
          { name: "handId", type: "uint256" },
          { name: "totalPool", type: "uint256" },
          { name: "winnerSeat", type: "uint8" },
          { name: "settled", type: "bool" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUserBets",
    inputs: [
      { name: "table", type: "address" },
      { name: "handId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "seatIndex", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSeatOdds",
    inputs: [
      { name: "table", type: "address" },
      { name: "handId", type: "uint256" },
    ],
    outputs: [{ name: "odds", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSeatTotals",
    inputs: [
      { name: "table", type: "address" },
      { name: "handId", type: "uint256" },
    ],
    outputs: [{ name: "totals", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pools",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [
      { name: "table", type: "address" },
      { name: "handId", type: "uint256" },
      { name: "totalPool", type: "uint256" },
      { name: "winnerSeat", type: "uint8" },
      { name: "settled", type: "bool" },
      { name: "createdAt", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "BetPlaced",
    inputs: [
      { name: "poolKey", type: "bytes32", indexed: true },
      { name: "bettor", type: "address", indexed: true },
      { name: "seatIndex", type: "uint8", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PoolSettled",
    inputs: [
      { name: "poolKey", type: "bytes32", indexed: true },
      { name: "winnerSeat", type: "uint8", indexed: false },
      { name: "totalPool", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WinningsClaimed",
    inputs: [
      { name: "poolKey", type: "bytes32", indexed: true },
      { name: "bettor", type: "address", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PoolCreated",
    inputs: [
      { name: "poolKey", type: "bytes32", indexed: true },
      { name: "table", type: "address", indexed: true },
      { name: "handId", type: "uint256", indexed: false },
    ],
  },
] as const;
