// nad.fun Client - Chain interaction for token trading

import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  formatUnits,
  parseUnits,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { monadTestnet } from "viem/chains";
import type { Address, TokenInfo, TokenStage, Quote } from "./types";
import {
  NADFUN_LENS_ABI,
  NADFUN_BONDING_ROUTER_ABI,
  NADFUN_DEX_ROUTER_ABI,
  ERC20_ABI,
} from "./types";

// Chain configuration
const CHAIN: Chain = monadTestnet;

// Contract addresses from environment (injected at build time)
function getConfig() {
  return {
    lensAddress: (process.env.NEXT_PUBLIC_NADFUN_LENS_ADDRESS ||
      "0x0000000000000000000000000000000000000000") as Address,
    bondingRouterAddress: (process.env.NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS ||
      "0x0000000000000000000000000000000000000000") as Address,
    dexRouterAddress: (process.env.NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS ||
      "0x0000000000000000000000000000000000000000") as Address,
    wmonAddress: (process.env.NEXT_PUBLIC_WMON_ADDRESS ||
      "0x0000000000000000000000000000000000000000") as Address,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz",
  };
}

/**
 * Create a public client for read operations
 */
export function getPublicClient(): PublicClient {
  const config = getConfig();
  return createPublicClient({
    chain: CHAIN,
    transport: http(config.rpcUrl),
  });
}

/**
 * Create a wallet client for write operations
 */
export function getWalletClient(): WalletClient | null {
  if (typeof window === "undefined" || !window.ethereum) {
    return null;
  }

  return createWalletClient({
    chain: CHAIN,
    transport: custom(window.ethereum),
  });
}

/**
 * Parse stage from contract uint8 to TokenStage
 */
function parseStage(stageNum: number): TokenStage {
  switch (stageNum) {
    case 0:
      return "bonding";
    case 1:
      return "locked";
    case 2:
      return "graduated";
    default:
      return "unknown";
  }
}

/**
 * Get token info from Lens contract
 */
export async function getTokenInfo(tokenAddress: Address): Promise<TokenInfo> {
  const config = getConfig();
  const client = getPublicClient();

  try {
    const result = await client.readContract({
      address: config.lensAddress,
      abi: NADFUN_LENS_ABI,
      functionName: "getTokenInfo",
      args: [tokenAddress],
    });

    const info = result as {
      stage: number;
      currentPrice: bigint;
      marketCap: bigint;
      totalSupply: bigint;
      bondingProgress: bigint;
      router: Address;
      tradeable: boolean;
    };

    return {
      tokenAddress,
      stage: parseStage(info.stage),
      currentPrice: info.currentPrice,
      marketCap: info.marketCap,
      totalSupply: info.totalSupply,
      bondingProgress: Number(info.bondingProgress) / 100, // bps to percentage
      routerAddress: info.router,
      tradeable: info.tradeable,
    };
  } catch (error) {
    // If Lens call fails (e.g., token not registered), return default info
    console.warn("Failed to get token info from Lens:", error);
    return {
      tokenAddress,
      stage: "unknown",
      currentPrice: 0n,
      marketCap: 0n,
      totalSupply: 0n,
      bondingProgress: 0,
      routerAddress: config.bondingRouterAddress,
      tradeable: false,
    };
  }
}

/**
 * Get buy quote from Lens
 */
export async function getBuyQuote(
  tokenAddress: Address,
  monAmountIn: bigint,
  slippageBps: number = 100 // 1% default
): Promise<Quote> {
  const config = getConfig();
  const client = getPublicClient();

  try {
    const result = await client.readContract({
      address: config.lensAddress,
      abi: NADFUN_LENS_ABI,
      functionName: "getBuyQuote",
      args: [tokenAddress, monAmountIn],
    });

    const [tokenAmountOut, priceImpactBps, fee] = result as [
      bigint,
      bigint,
      bigint
    ];

    // Calculate min amount out with slippage
    const slippageMultiplier = BigInt(10000 - slippageBps);
    const minAmountOut = (tokenAmountOut * slippageMultiplier) / 10000n;

    return {
      amountIn: monAmountIn,
      amountOut: tokenAmountOut,
      priceImpact: Number(priceImpactBps) / 100, // bps to percentage
      minAmountOut,
      fee,
    };
  } catch (error) {
    console.warn("Failed to get buy quote:", error);
    return {
      amountIn: monAmountIn,
      amountOut: 0n,
      priceImpact: 0,
      minAmountOut: 0n,
      fee: 0n,
    };
  }
}

/**
 * Get sell quote from Lens
 */
export async function getSellQuote(
  tokenAddress: Address,
  tokenAmountIn: bigint,
  slippageBps: number = 100 // 1% default
): Promise<Quote> {
  const config = getConfig();
  const client = getPublicClient();

  try {
    const result = await client.readContract({
      address: config.lensAddress,
      abi: NADFUN_LENS_ABI,
      functionName: "getSellQuote",
      args: [tokenAddress, tokenAmountIn],
    });

    const [monAmountOut, priceImpactBps, fee] = result as [
      bigint,
      bigint,
      bigint
    ];

    // Calculate min amount out with slippage
    const slippageMultiplier = BigInt(10000 - slippageBps);
    const minAmountOut = (monAmountOut * slippageMultiplier) / 10000n;

    return {
      amountIn: tokenAmountIn,
      amountOut: monAmountOut,
      priceImpact: Number(priceImpactBps) / 100,
      minAmountOut,
      fee,
    };
  } catch (error) {
    console.warn("Failed to get sell quote:", error);
    return {
      amountIn: tokenAmountIn,
      amountOut: 0n,
      priceImpact: 0,
      minAmountOut: 0n,
      fee: 0n,
    };
  }
}

/**
 * Get user's MON balance
 */
export async function getMonBalance(userAddress: Address): Promise<bigint> {
  const client = getPublicClient();
  return client.getBalance({ address: userAddress });
}

/**
 * Get user's token balance
 */
export async function getTokenBalance(
  tokenAddress: Address,
  userAddress: Address
): Promise<bigint> {
  const client = getPublicClient();

  try {
    const balance = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    });
    return balance as bigint;
  } catch {
    return 0n;
  }
}

/**
 * Get token symbol
 */
export async function getTokenSymbol(tokenAddress: Address): Promise<string> {
  const client = getPublicClient();

  try {
    const symbol = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "symbol",
      args: [],
    });
    return symbol as string;
  } catch {
    return "TOKEN";
  }
}

/**
 * Check if token is approved for spending
 */
export async function checkAllowance(
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address
): Promise<bigint> {
  const client = getPublicClient();

  try {
    const allowance = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [ownerAddress, spenderAddress],
    });
    return allowance as bigint;
  } catch {
    return 0n;
  }
}

/**
 * Approve token for spending
 */
export async function approveToken(
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint
): Promise<string> {
  const walletClient = getWalletClient();
  if (!walletClient) {
    throw new Error("No wallet connected");
  }

  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error("No account available");
  }

  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spenderAddress, amount],
    account,
    chain: CHAIN,
  });

  return hash;
}

/**
 * Execute buy on bonding curve
 */
export async function executeBuyBonding(
  tokenAddress: Address,
  monAmountIn: bigint,
  minTokenOut: bigint,
  deadline: bigint,
  recipient: Address
): Promise<string> {
  const config = getConfig();
  const walletClient = getWalletClient();
  if (!walletClient) {
    throw new Error("No wallet connected");
  }

  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error("No account available");
  }

  const hash = await walletClient.writeContract({
    address: config.bondingRouterAddress,
    abi: NADFUN_BONDING_ROUTER_ABI,
    functionName: "buy",
    args: [tokenAddress, minTokenOut, deadline, recipient],
    account,
    chain: CHAIN,
    value: monAmountIn,
  });

  return hash;
}

/**
 * Execute sell on bonding curve
 */
export async function executeSellBonding(
  tokenAddress: Address,
  tokenAmountIn: bigint,
  minMonOut: bigint,
  deadline: bigint,
  recipient: Address
): Promise<string> {
  const config = getConfig();
  const walletClient = getWalletClient();
  if (!walletClient) {
    throw new Error("No wallet connected");
  }

  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error("No account available");
  }

  const hash = await walletClient.writeContract({
    address: config.bondingRouterAddress,
    abi: NADFUN_BONDING_ROUTER_ABI,
    functionName: "sell",
    args: [tokenAddress, tokenAmountIn, minMonOut, deadline, recipient],
    account,
    chain: CHAIN,
  });

  return hash;
}

/**
 * Execute buy on DEX (graduated token)
 */
export async function executeBuyDex(
  tokenAddress: Address,
  monAmountIn: bigint,
  minTokenOut: bigint,
  deadline: bigint,
  recipient: Address
): Promise<string> {
  const config = getConfig();
  const walletClient = getWalletClient();
  if (!walletClient) {
    throw new Error("No wallet connected");
  }

  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error("No account available");
  }

  // DEX path: WMON -> Token
  const path = [config.wmonAddress, tokenAddress];

  const hash = await walletClient.writeContract({
    address: config.dexRouterAddress,
    abi: NADFUN_DEX_ROUTER_ABI,
    functionName: "swapExactETHForTokens",
    args: [minTokenOut, path, recipient, deadline],
    account,
    chain: CHAIN,
    value: monAmountIn,
  });

  return hash;
}

/**
 * Execute sell on DEX (graduated token)
 */
export async function executeSellDex(
  tokenAddress: Address,
  tokenAmountIn: bigint,
  minMonOut: bigint,
  deadline: bigint,
  recipient: Address
): Promise<string> {
  const config = getConfig();
  const walletClient = getWalletClient();
  if (!walletClient) {
    throw new Error("No wallet connected");
  }

  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error("No account available");
  }

  // DEX path: Token -> WMON
  const path = [tokenAddress, config.wmonAddress];

  const hash = await walletClient.writeContract({
    address: config.dexRouterAddress,
    abi: NADFUN_DEX_ROUTER_ABI,
    functionName: "swapExactTokensForETH",
    args: [tokenAmountIn, minMonOut, path, recipient, deadline],
    account,
    chain: CHAIN,
  });

  return hash;
}

/**
 * Format MON amount for display (18 decimals)
 */
export function formatMon(amount: bigint, decimals: number = 4): string {
  return formatUnits(amount, 18).slice(0, decimals + formatUnits(amount, 18).indexOf(".") + 1);
}

/**
 * Parse MON amount from string (18 decimals)
 */
export function parseMon(amount: string): bigint {
  try {
    return parseUnits(amount, 18);
  } catch {
    return 0n;
  }
}

/**
 * Format token amount for display (assumes 18 decimals)
 */
export function formatToken(amount: bigint, decimals: number = 4): string {
  return formatUnits(amount, 18).slice(0, decimals + formatUnits(amount, 18).indexOf(".") + 1);
}

/**
 * Parse token amount from string (assumes 18 decimals)
 */
export function parseToken(amount: string): bigint {
  try {
    return parseUnits(amount, 18);
  } catch {
    return 0n;
  }
}
