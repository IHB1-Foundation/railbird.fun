"use client";

/**
 * NadFunTradingWidget — in-app nad.fun buy/sell widget.
 *
 * Env vars required to enable:
 *   NEXT_PUBLIC_NADFUN_LENS_ADDRESS           — Lens contract (quotes + stage info)
 *   NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS — Bonding-curve router
 *   NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS     — Graduated DEX router (optional)
 *   NEXT_PUBLIC_RPC_URL                       — Chain RPC
 *
 * Note: ABI function names are placeholders matching the common nad.fun interface.
 * Update LENS_ABI / BONDING_ROUTER_ABI / DEX_ROUTER_ABI to match the deployed contracts.
 */

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, createWalletClient, custom, http, parseUnits, formatUnits, type Address } from "viem";
import { useAuth } from "@/lib/auth";

// ─── Contract ABIs ────────────────────────────────────────────────────────────
// These follow common nad.fun interface patterns. Adjust selectors to match deployed contracts.

const LENS_ABI = [
  {
    name: "getTokenStage",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    // Returns: 0 = bonding_curve, 1 = locked, 2 = graduated
    outputs: [{ name: "stage", type: "uint8" }],
  },
  {
    name: "getBuyAmountOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "monIn", type: "uint256" },
    ],
    outputs: [{ name: "tokenAmountOut", type: "uint256" }],
  },
  {
    name: "getSellAmountOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIn", type: "uint256" },
    ],
    outputs: [{ name: "monAmountOut", type: "uint256" }],
  },
] as const;

const BONDING_ROUTER_ABI = [
  {
    name: "buyTokens",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "minTokensOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "sellTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenAmount", type: "uint256" },
      { name: "minMonOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const DEX_ROUTER_ABI = [
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

// ─── Types ────────────────────────────────────────────────────────────────────

type TokenStage = "bonding_curve" | "locked" | "graduated" | "unknown";
type TradeDirection = "buy" | "sell";

const STAGE_LABELS: Record<TokenStage, string> = {
  bonding_curve: "Bonding Curve",
  locked: "Locked",
  graduated: "Graduated (DEX)",
  unknown: "Unknown",
};

const STAGE_COLORS: Record<TokenStage, string> = {
  bonding_curve: "stage-bonding",
  locked: "stage-locked",
  graduated: "stage-graduated",
  unknown: "stage-unknown",
};

// ─── Config helpers ───────────────────────────────────────────────────────────

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_RPC_URL || "https://testnet.hsk.xyz";
}

function getLensAddress(): Address | null {
  const addr = process.env.NEXT_PUBLIC_NADFUN_LENS_ADDRESS;
  return addr ? (addr as Address) : null;
}

function getBondingRouterAddress(): Address | null {
  const addr = process.env.NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS;
  return addr ? (addr as Address) : null;
}

function getDexRouterAddress(): Address | null {
  const addr = process.env.NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS;
  return addr ? (addr as Address) : null;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface NadFunTradingWidgetProps {
  tokenAddress: string;
}

export function NadFunTradingWidget({ tokenAddress }: NadFunTradingWidgetProps) {
  const { isConnected, address } = useAuth();

  const [stage, setStage] = useState<TokenStage>("unknown");
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [amountInput, setAmountInput] = useState("0.1");
  const [slippageBps, setSlippageBps] = useState(100); // 1% default
  const [deadlineMinutes, setDeadlineMinutes] = useState(30);
  const [quote, setQuote] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const lensAddress = getLensAddress();
  const bondingRouter = getBondingRouterAddress();
  const dexRouter = getDexRouterAddress();

  const isConfigured = !!lensAddress;
  const isTradeable = stage === "bonding_curve" || stage === "graduated";
  const routerAddress = stage === "graduated" ? dexRouter : bondingRouter;

  // ── Fetch token stage ────────────────────────────────────────────────────
  useEffect(() => {
    if (!lensAddress) return;
    const client = createPublicClient({ transport: http(getRpcUrl()) });
    client
      .readContract({
        address: lensAddress,
        abi: LENS_ABI,
        functionName: "getTokenStage",
        args: [tokenAddress as Address],
      })
      .then((raw) => {
        const stageMap: Record<number, TokenStage> = {
          0: "bonding_curve",
          1: "locked",
          2: "graduated",
        };
        setStage(stageMap[Number(raw)] ?? "unknown");
      })
      .catch(() => setStage("unknown"));
  }, [lensAddress, tokenAddress]);

  // ── Get quote ────────────────────────────────────────────────────────────
  const getQuote = useCallback(async () => {
    if (!lensAddress) return;
    setQuoteLoading(true);
    setError(null);
    setQuote(null);

    try {
      const amountWei = parseUnits(amountInput || "0", 18);
      if (amountWei === 0n) {
        setError("Enter an amount to quote.");
        return;
      }

      const client = createPublicClient({ transport: http(getRpcUrl()) });

      let result: bigint;
      if (direction === "buy") {
        result = await client.readContract({
          address: lensAddress,
          abi: LENS_ABI,
          functionName: "getBuyAmountOut",
          args: [tokenAddress as Address, amountWei],
        });
        setQuote(`~${formatUnits(result, 18)} tokens out`);
      } else {
        result = await client.readContract({
          address: lensAddress,
          abi: LENS_ABI,
          functionName: "getSellAmountOut",
          args: [tokenAddress as Address, amountWei],
        });
        setQuote(`~${formatUnits(result, 18)} MON out`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get quote");
    } finally {
      setQuoteLoading(false);
    }
  }, [lensAddress, tokenAddress, direction, amountInput]);

  // ── Execute trade ────────────────────────────────────────────────────────
  const executeTrade = useCallback(async () => {
    if (!isConnected || !address) {
      setError("Connect wallet to trade.");
      return;
    }
    if (!routerAddress) {
      setError("Router not configured for this stage.");
      return;
    }
    if (!isTradeable) {
      setError("Token is not currently tradeable.");
      return;
    }

    setTxLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const amountWei = parseUnits(amountInput || "0", 18);
      if (amountWei === 0n) {
        setError("Enter a valid amount.");
        return;
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);

      // Fetch a fresh quote to apply slippage
      const client = createPublicClient({ transport: http(getRpcUrl()) });
      let quoteWei: bigint;
      if (direction === "buy") {
        quoteWei = await client.readContract({
          address: lensAddress!,
          abi: LENS_ABI,
          functionName: "getBuyAmountOut",
          args: [tokenAddress as Address, amountWei],
        });
      } else {
        quoteWei = await client.readContract({
          address: lensAddress!,
          abi: LENS_ABI,
          functionName: "getSellAmountOut",
          args: [tokenAddress as Address, amountWei],
        });
      }

      const minOut = (quoteWei * BigInt(10000 - slippageBps)) / 10000n;

      // Get wallet client
      const walletClient = createWalletClient({
        account: address as Address,
        transport: custom((window as unknown as { ethereum: unknown }).ethereum),
      });

      let hash: `0x${string}`;
      if (stage === "bonding_curve") {
        if (direction === "buy") {
          hash = await walletClient.writeContract({
            address: routerAddress,
            abi: BONDING_ROUTER_ABI,
            functionName: "buyTokens",
            args: [tokenAddress as Address, minOut, deadline],
            value: amountWei,
          });
        } else {
          hash = await walletClient.writeContract({
            address: routerAddress,
            abi: BONDING_ROUTER_ABI,
            functionName: "sellTokens",
            args: [tokenAddress as Address, amountWei, minOut, deadline],
          });
        }
      } else {
        // graduated — Uniswap V2 style
        const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON_ADDRESS || "0x0000000000000000000000000000000000000000") as Address;
        if (direction === "buy") {
          hash = await walletClient.writeContract({
            address: routerAddress,
            abi: DEX_ROUTER_ABI,
            functionName: "swapExactETHForTokens",
            args: [minOut, [WMON_ADDRESS, tokenAddress as Address], address as Address, deadline],
            value: amountWei,
          });
        } else {
          hash = await walletClient.writeContract({
            address: routerAddress,
            abi: DEX_ROUTER_ABI,
            functionName: "swapExactTokensForETH",
            args: [amountWei, minOut, [tokenAddress as Address, WMON_ADDRESS], address as Address, deadline],
          });
        }
      }

      setTxHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setTxLoading(false);
    }
  }, [isConnected, address, routerAddress, isTradeable, amountInput, deadlineMinutes, direction, slippageBps, stage, tokenAddress, lensAddress]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isConfigured) {
    return (
      <a
        href={`https://nad.fun/token/${tokenAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-outline nadfun-fallback"
        aria-label="Open token on nad.fun"
      >
        Open on nad.fun ↗
      </a>
    );
  }

  return (
    <div className="nadfun-widget">
      {/* Stage badge */}
      <div className="nadfun-stage-row">
        <span className={`nadfun-stage-badge ${STAGE_COLORS[stage]}`}>
          {STAGE_LABELS[stage]}
        </span>
        <a
          href={`https://nad.fun/token/${tokenAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="nadfun-external-link"
          aria-label="Open on nad.fun"
        >
          Open on nad.fun ↗
        </a>
      </div>

      {stage === "locked" && (
        <div className="nadfun-locked-notice" role="status">
          Token is currently in locked stage — trading is temporarily unavailable.
        </div>
      )}

      {isTradeable && (
        <>
          {/* Direction tabs */}
          <div className="nadfun-direction-tabs" role="tablist" aria-label="Trade direction">
            <button
              type="button"
              role="tab"
              aria-selected={direction === "buy"}
              className={`nadfun-tab ${direction === "buy" ? "active" : ""}`}
              onClick={() => { setDirection("buy"); setQuote(null); }}
            >
              Buy
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={direction === "sell"}
              className={`nadfun-tab ${direction === "sell" ? "active" : ""}`}
              onClick={() => { setDirection("sell"); setQuote(null); }}
            >
              Sell
            </button>
          </div>

          {/* Amount input */}
          <div className="nadfun-field">
            <label className="nadfun-label" htmlFor="nadfun-amount">
              {direction === "buy" ? "MON to spend" : "Tokens to sell"}
            </label>
            <input
              id="nadfun-amount"
              className="nadfun-input"
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => { setAmountInput(e.target.value); setQuote(null); }}
              aria-label={direction === "buy" ? "Amount of MON to spend" : "Amount of tokens to sell"}
            />
          </div>

          {/* Slippage */}
          <div className="nadfun-controls-row">
            <div className="nadfun-field nadfun-field-sm">
              <label className="nadfun-label" htmlFor="nadfun-slippage">Slippage (%)</label>
              <input
                id="nadfun-slippage"
                className="nadfun-input"
                type="number"
                min="0.1"
                max="50"
                step="0.1"
                value={(slippageBps / 100).toFixed(1)}
                onChange={(e) => setSlippageBps(Math.round(parseFloat(e.target.value) * 100))}
                aria-label="Slippage tolerance in percent"
              />
            </div>
            <div className="nadfun-field nadfun-field-sm">
              <label className="nadfun-label" htmlFor="nadfun-deadline">Deadline (min)</label>
              <input
                id="nadfun-deadline"
                className="nadfun-input"
                type="number"
                min="1"
                max="120"
                value={deadlineMinutes}
                onChange={(e) => setDeadlineMinutes(parseInt(e.target.value, 10) || 30)}
                aria-label="Transaction deadline in minutes"
              />
            </div>
          </div>

          {/* Quick slippage presets */}
          <div className="nadfun-presets" aria-label="Slippage presets">
            {[50, 100, 200, 500].map((bps) => (
              <button
                key={bps}
                type="button"
                className={`ghost-btn ${slippageBps === bps ? "active" : ""}`}
                onClick={() => setSlippageBps(bps)}
                aria-pressed={slippageBps === bps}
              >
                {bps / 100}%
              </button>
            ))}
          </div>

          {/* Quote */}
          <button
            type="button"
            className="btn-outline nadfun-quote-btn"
            onClick={getQuote}
            disabled={quoteLoading}
            aria-busy={quoteLoading}
            aria-label="Get price quote"
          >
            {quoteLoading ? "Getting quote…" : "Get Quote"}
          </button>

          {quote && (
            <div className="nadfun-quote-result" role="status" aria-live="polite">
              {quote}
              {` (slippage ${(slippageBps / 100).toFixed(1)}%)`}
            </div>
          )}

          {/* Execute */}
          {isConnected ? (
            <button
              type="button"
              className="btn-primary nadfun-execute-btn"
              onClick={executeTrade}
              disabled={txLoading || !routerAddress}
              aria-busy={txLoading}
              aria-label={`Execute ${direction} trade`}
            >
              {txLoading ? "Confirming…" : `${direction === "buy" ? "Buy" : "Sell"} now`}
            </button>
          ) : (
            <div className="nadfun-connect-notice" role="note">
              Connect wallet to trade
            </div>
          )}
        </>
      )}

      {/* Feedback */}
      {error && (
        <div className="nadfun-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {txHash && (
        <div className="nadfun-success" role="status" aria-live="polite">
          Transaction submitted:{" "}
          <span className="text-mono">{txHash.slice(0, 10)}…{txHash.slice(-8)}</span>
        </div>
      )}
    </div>
  );
}
