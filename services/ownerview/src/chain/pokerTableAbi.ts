/**
 * Minimal ABI for PokerTable contract - only functions we need
 */
export const PokerTableABI = [
  {
    name: "getSeat",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "seatIndex", type: "uint8" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "operator", type: "address" },
          { name: "stack", type: "uint256" },
          { name: "isActive", type: "bool" },
          { name: "currentBet", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "currentHandId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "MAX_SEATS",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
