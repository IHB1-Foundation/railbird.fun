// PlayerVault contract ABI - minimal subset needed for keeper rebalancing

export const PLAYER_VAULT_ABI = [
  // Rebalance status
  {
    type: "function",
    name: "getRebalanceStatus",
    inputs: [],
    outputs: [
      { type: "bool", name: "canRebalance" },
      { type: "uint256", name: "currentHandId" },
      { type: "uint256", name: "lastRebalancedHandId" },
      { type: "uint256", name: "rebalanceEligibleBlock" },
      { type: "uint256", name: "blocksRemaining" },
    ],
    stateMutability: "view",
  },

  // Accounting
  {
    type: "function",
    name: "getNavPerShare",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getExternalAssets",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTreasuryShares",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },

  // Rebalancing config
  {
    type: "function",
    name: "rebalanceMaxMonBps",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rebalanceMaxTokenBps",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },

  // Rebalance actions
  {
    type: "function",
    name: "rebalanceBuy",
    inputs: [
      { type: "uint256", name: "monAmount" },
      { type: "uint256", name: "minTokenOut" },
    ],
    outputs: [{ type: "uint256", name: "tokensReceived" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rebalanceSell",
    inputs: [
      { type: "uint256", name: "tokenAmount" },
      { type: "uint256", name: "minMonOut" },
    ],
    outputs: [{ type: "uint256", name: "monReceived" }],
    stateMutability: "nonpayable",
  },

  // Events
  {
    type: "event",
    name: "RebalanceBuy",
    inputs: [
      { type: "uint256", name: "handId", indexed: true },
      { type: "uint256", name: "monSpent" },
      { type: "uint256", name: "tokensReceived" },
      { type: "uint256", name: "executionPrice" },
      { type: "uint256", name: "navBefore" },
      { type: "uint256", name: "navAfter" },
    ],
  },
  {
    type: "event",
    name: "RebalanceSell",
    inputs: [
      { type: "uint256", name: "handId", indexed: true },
      { type: "uint256", name: "tokensSold" },
      { type: "uint256", name: "monReceived" },
      { type: "uint256", name: "executionPrice" },
      { type: "uint256", name: "navBefore" },
      { type: "uint256", name: "navAfter" },
    ],
  },
] as const;
