export const PRODUCTION_VRF_ADAPTER_ABI = [
  {
    type: "function",
    name: "nextRequestId",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "operator",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRequest",
    inputs: [{ type: "uint256", name: "requestId" }],
    outputs: [
      { type: "address", name: "table" },
      { type: "uint256", name: "tableId" },
      { type: "uint256", name: "handId" },
      { type: "uint8", name: "purpose" },
      { type: "uint256", name: "requestedAt" },
      { type: "uint256", name: "requestedBlock" },
      { type: "bool", name: "fulfilled" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fulfillRandomness",
    inputs: [
      { type: "uint256", name: "requestId" },
      { type: "uint256", name: "randomness" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
