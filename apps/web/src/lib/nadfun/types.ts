// nad.fun Types and ABIs for Monad integration

export type Address = `0x${string}`;

/**
 * Token stage on nad.fun
 * - bonding: Trading on bonding curve
 * - locked: Temporarily locked (e.g., during graduation)
 * - graduated: Trading on DEX (graduated from bonding curve)
 */
export type TokenStage = "bonding" | "locked" | "graduated" | "unknown";

/**
 * Token info from Lens contract
 */
export interface TokenInfo {
  tokenAddress: Address;
  stage: TokenStage;
  currentPrice: bigint; // in MON (wei)
  marketCap: bigint; // in MON (wei)
  totalSupply: bigint;
  bondingProgress: number; // 0-100 percentage
  // Router to use for trades
  routerAddress: Address;
  // Whether trading is currently available
  tradeable: boolean;
}

/**
 * Quote result from router
 */
export interface Quote {
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number; // percentage (0-100)
  minAmountOut: bigint; // with slippage applied
  fee: bigint;
}

/**
 * Trade transaction parameters
 */
export interface TradeParams {
  tokenAddress: Address;
  isBuy: boolean;
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: bigint;
  recipient: Address;
}

/**
 * Trade result
 */
export interface TradeResult {
  success: boolean;
  txHash: string;
  amountIn: bigint;
  amountOut: bigint;
  error?: string;
}

// ============================================
// Contract ABIs (minimal for our use case)
// ============================================

/**
 * nad.fun Lens ABI - for querying token info and quotes
 */
export const NADFUN_LENS_ABI = [
  // Get token info
  {
    name: "getTokenInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "stage", type: "uint8" }, // 0=bonding, 1=locked, 2=graduated
          { name: "currentPrice", type: "uint256" },
          { name: "marketCap", type: "uint256" },
          { name: "totalSupply", type: "uint256" },
          { name: "bondingProgress", type: "uint256" }, // basis points (0-10000)
          { name: "router", type: "address" },
          { name: "tradeable", type: "bool" },
        ],
      },
    ],
  },
  // Get buy quote
  {
    name: "getBuyQuote",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "monAmountIn", type: "uint256" },
    ],
    outputs: [
      { name: "tokenAmountOut", type: "uint256" },
      { name: "priceImpact", type: "uint256" }, // basis points
      { name: "fee", type: "uint256" },
    ],
  },
  // Get sell quote
  {
    name: "getSellQuote",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenAmountIn", type: "uint256" },
    ],
    outputs: [
      { name: "monAmountOut", type: "uint256" },
      { name: "priceImpact", type: "uint256" }, // basis points
      { name: "fee", type: "uint256" },
    ],
  },
] as const;

/**
 * nad.fun Bonding Router ABI - for trading on bonding curve
 */
export const NADFUN_BONDING_ROUTER_ABI = [
  // Buy tokens with MON
  {
    name: "buy",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "minTokenOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "tokenAmountOut", type: "uint256" }],
  },
  // Sell tokens for MON
  {
    name: "sell",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenAmountIn", type: "uint256" },
      { name: "minMonOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "monAmountOut", type: "uint256" }],
  },
] as const;

/**
 * nad.fun DEX Router ABI - for trading graduated tokens
 * (Similar interface, wraps underlying DEX)
 */
export const NADFUN_DEX_ROUTER_ABI = [
  // Buy tokens with MON (native)
  {
    name: "swapExactETHForTokens",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  // Sell tokens for MON (native)
  {
    name: "swapExactTokensForETH",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

/**
 * ERC20 ABI - for token approvals
 */
export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;
