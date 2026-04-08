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

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPublicClient, createWalletClient, custom, http, isAddress, parseUnits, formatUnits, type Address } from "viem";
import { useAuth } from "@/lib/auth";
import styles from "./NadFunTradingWidget.module.css";

// ─── Error mapping ──────────────────────────────────────────────────────────
const ERROR_MAP: Array<[RegExp, string]> = [
  [/slippage|INSUFFICIENT_OUTPUT/i, "Slippage exceeded — try increasing slippage tolerance or reducing amount."],
  [/locked|LOCKED/i, "This token is currently locked and cannot be traded."],
  [/deadline|EXPIRED/i, "Transaction deadline passed — try again."],
  [/insufficient.*balance|INSUFFICIENT_BALANCE/i, "Insufficient token balance for this trade."],
  [/user rejected|denied/i, "Transaction was rejected in your wallet."],
];

function mapContractError(raw: string): string {
  for (const [pattern, friendly] of ERROR_MAP) {
    if (pattern.test(raw)) return friendly;
  }
  return raw;
}

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
  bonding_curve: "📈 Bonding Curve",
  locked: "🔒 Locked",
  graduated: "✅ Graduated (DEX)",
  unknown: "Unknown",
};

const STAGE_CSS_CLASSES: Record<TokenStage, string> = {
  bonding_curve: styles.stageBonding,
  locked: styles.stageLocked,
  graduated: styles.stageGraduated,
  unknown: styles.stageUnknown,
};

// ─── Config helpers ───────────────────────────────────────────────────────────

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_RPC_URL || "https://testnet.hsk.xyz";
}

/**
 * Reads an address env var and returns it if it is a well-formed EIP-55 address.
 * Returns null when the var is unset.
 * Returns the string "INVALID:<var>" when the var is set but malformed — this
 * triggers a user-visible config error rather than a silent failure.
 */
function readAddressEnv(varName: string): Address | "INVALID" | null {
  const raw = process.env[varName];
  if (!raw) return null;
  if (!isAddress(raw)) return "INVALID";
  return raw as Address;
}

function getLensAddress(): Address | "INVALID" | null {
  return readAddressEnv("NEXT_PUBLIC_NADFUN_LENS_ADDRESS");
}

function getBondingRouterAddress(): Address | "INVALID" | null {
  return readAddressEnv("NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS");
}

function getDexRouterAddress(): Address | "INVALID" | null {
  return readAddressEnv("NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS");
}

function getWmonAddress(): Address | "INVALID" | null {
  return readAddressEnv("NEXT_PUBLIC_WMON_ADDRESS");
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
  const [quoteExpiresAt, setQuoteExpiresAt] = useState<number | null>(null);
  const [quoteSecondsLeft, setQuoteSecondsLeft] = useState<number>(0);
  const [quoteDebouncing, setQuoteDebouncing] = useState(false);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [tabSwitchNotice, setTabSwitchNotice] = useState<"buy" | "sell" | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"submitted" | "confirming" | null>(null);

  const lensAddressRaw = getLensAddress();
  const bondingRouterRaw = getBondingRouterAddress();
  const dexRouterRaw = getDexRouterAddress();
  const wmonAddressRaw = getWmonAddress();

  // Detect any malformed (set but invalid) address env vars.
  const configErrors: string[] = [];
  if (lensAddressRaw === "INVALID") configErrors.push("NEXT_PUBLIC_NADFUN_LENS_ADDRESS is malformed");
  if (bondingRouterRaw === "INVALID") configErrors.push("NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS is malformed");
  if (dexRouterRaw === "INVALID") configErrors.push("NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS is malformed");
  if (wmonAddressRaw === "INVALID") configErrors.push("NEXT_PUBLIC_WMON_ADDRESS is malformed");

  // After validation, treat "INVALID" as null so the rest of the component is typed correctly.
  const lensAddress = lensAddressRaw === "INVALID" ? null : lensAddressRaw;
  const bondingRouter = bondingRouterRaw === "INVALID" ? null : bondingRouterRaw;
  const dexRouter = dexRouterRaw === "INVALID" ? null : dexRouterRaw;
  const wmonAddress = wmonAddressRaw === "INVALID" ? null : wmonAddressRaw;

  const slippageWarning = useMemo(() => {
    const pct = slippageBps / 100;
    if (pct > 49) return { level: "error" as const, msg: "Maximum slippage is 49%" };
    if (pct > 10) return { level: "warn" as const, msg: "High slippage increases risk of unfavorable execution" };
    if (pct < 0.5) return { level: "warn" as const, msg: "Low slippage may cause transaction to fail" };
    return null;
  }, [slippageBps]);

  const isConfigured = !!lensAddress && configErrors.length === 0;
  // Graduated stage also requires WMON_ADDRESS for the swap path
  const isTradeable =
    stage === "bonding_curve" ||
    (stage === "graduated" && !!wmonAddress);
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

  // ── Tab switch notice auto-dismiss ───────────────────────────────────────
  useEffect(() => {
    if (!tabSwitchNotice) return;
    const t = setTimeout(() => setTabSwitchNotice(null), 4000);
    return () => clearTimeout(t);
  }, [tabSwitchNotice]);

  // ── Quote countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!quoteExpiresAt) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((quoteExpiresAt - Date.now()) / 1000));
      setQuoteSecondsLeft(left);
      if (left === 0) { setQuote(null); setQuoteExpiresAt(null); setQuoteExpired(true); }
    }, 500);
    return () => clearInterval(id);
  }, [quoteExpiresAt]);

  // ── Get quote ────────────────────────────────────────────────────────────
  const getQuote = useCallback(async () => {
    if (!lensAddress) return;
    // Debounce: disable for 500ms after click
    setQuoteDebouncing(true);
    setTimeout(() => setQuoteDebouncing(false), 500);
    setQuoteLoading(true);
    setError(null);
    setQuote(null);
    setQuoteExpiresAt(null);
    setQuoteExpired(false);

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
        setQuoteExpiresAt(Date.now() + 10_000);
      } else {
        result = await client.readContract({
          address: lensAddress,
          abi: LENS_ABI,
          functionName: "getSellAmountOut",
          args: [tokenAddress as Address, amountWei],
        });
        setQuote(`~${formatUnits(result, 18)} MON out`);
        setQuoteExpiresAt(Date.now() + 10_000);
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
    if (slippageBps > 4900) {
      setError("Maximum slippage is 49%. Please reduce slippage to proceed.");
      return;
    }

    setTxLoading(true);
    setError(null);
    setTxHash(null);
    setTxStatus(null);

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

      // Get wallet client — requires browser wallet extension
      if (!window.ethereum) {
        setError("No wallet extension detected. Please install MetaMask or a compatible wallet.");
        return;
      }
      const walletClient = createWalletClient({
        account: address as Address,
        chain: undefined,
        transport: custom(window.ethereum),
      });

      let hash: `0x${string}`;
      if (stage === "bonding_curve") {
        if (direction === "buy") {
          hash = await walletClient.writeContract({
            chain: null,
            address: routerAddress,
            abi: BONDING_ROUTER_ABI,
            functionName: "buyTokens",
            args: [tokenAddress as Address, minOut, deadline],
            value: amountWei,
          });
        } else {
          hash = await walletClient.writeContract({
            chain: null,
            address: routerAddress,
            abi: BONDING_ROUTER_ABI,
            functionName: "sellTokens",
            args: [tokenAddress as Address, amountWei, minOut, deadline],
          });
        }
      } else {
        // graduated — Uniswap V2 style; WMON address required for swap path
        if (!wmonAddress) {
          setError("WMON_ADDRESS is not configured. Cannot execute DEX swap.");
          return;
        }
        if (direction === "buy") {
          hash = await walletClient.writeContract({
            chain: null,
            address: routerAddress,
            abi: DEX_ROUTER_ABI,
            functionName: "swapExactETHForTokens",
            args: [minOut, [wmonAddress, tokenAddress as Address], address as Address, deadline],
            value: amountWei,
          });
        } else {
          hash = await walletClient.writeContract({
            chain: null,
            address: routerAddress,
            abi: DEX_ROUTER_ABI,
            functionName: "swapExactTokensForETH",
            args: [amountWei, minOut, [tokenAddress as Address, wmonAddress], address as Address, deadline],
          });
        }
      }

      setTxHash(hash);
      setTxStatus("submitted");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Transaction failed";
      console.error("[NadFunTradingWidget] trade error:", err);
      const mapped = mapContractError(raw);
      // If not specifically mapped, use a generic catch-all
      setError(mapped !== raw ? mapped : "Transaction failed. Please try again or adjust your slippage.");
    } finally {
      setTxLoading(false);
    }
  }, [isConnected, address, routerAddress, isTradeable, amountInput, deadlineMinutes, direction, slippageBps, stage, tokenAddress, lensAddress, wmonAddress]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (configErrors.length > 0) {
    // Log technical details for operators; show friendly message to users
    console.error("[NadFunTradingWidget] config errors:", configErrors);
    return (
      <div role="alert" className={styles.nadfunConfigError}>
        <p>Trading is not available for this token. You can trade on nad.fun directly.</p>
        <a
          href={`https://nad.fun/token/${tokenAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.nadfunFallback}
          aria-label="Open token on nad.fun"
        >
          Open on nad.fun ↗
        </a>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <a
        href={`https://nad.fun/token/${tokenAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.nadfunFallback}
        aria-label="Open token on nad.fun"
      >
        Open on nad.fun ↗
      </a>
    );
  }

  return (
    <div className={styles.nadfunWidget}>
      {/* Stage badge */}
      <div className={styles.nadfunStageRow}>
        <span className={`${styles.nadfunStageBadge} ${STAGE_CSS_CLASSES[stage]}`}>
          {STAGE_LABELS[stage]}
        </span>
        <a
          href={`https://nad.fun/token/${tokenAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.nadfunExternalLink}
          aria-label="Open on nad.fun"
        >
          Open on nad.fun ↗
        </a>
      </div>

      {stage === "locked" && (
        <div className={styles.nadfunLockedNotice} role="status">
          Token is currently in locked stage — trading is temporarily unavailable.
        </div>
      )}

      {stage === "graduated" && !wmonAddress && (
        <div className={styles.nadfunLockedNotice} role="status">
          DEX trading requires WMON_ADDRESS configuration. Use the external link above.
        </div>
      )}

      {isTradeable && (
        <>
          {/* Direction tabs */}
          <div className={styles.nadfunDirectionTabs} role="tablist" aria-label="Trade direction">
            <button
              type="button"
              role="tab"
              aria-selected={direction === "buy"}
              className={`${styles.nadfunTab} ${direction === "buy" ? styles.active : ""}`}
              onClick={() => {
                if (direction !== "buy") {
                  setDirection("buy");
                  setQuote(null);
                  setQuoteExpired(false);
                  setTabSwitchNotice("buy");
                }
              }}
            >
              Buy
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={direction === "sell"}
              className={`${styles.nadfunTab} ${direction === "sell" ? styles.active : ""}`}
              onClick={() => {
                if (direction !== "sell") {
                  setDirection("sell");
                  setQuote(null);
                  setQuoteExpired(false);
                  setTabSwitchNotice("sell");
                }
              }}
            >
              Sell
            </button>
          </div>

          {/* Amount input */}
          <div className={styles.nadfunField}>
            <label className={styles.nadfunLabel} htmlFor="nadfun-amount">
              {direction === "buy" ? "MON to spend" : "Tokens to sell"}
            </label>
            <input
              id="nadfun-amount"
              className={styles.nadfunInput}
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => { setAmountInput(e.target.value); setQuote(null); }}
              aria-label={direction === "buy" ? "Amount of MON to spend" : "Amount of tokens to sell"}
            />
          </div>

          {/* Slippage + Deadline */}
          <div className={styles.nadfunControlsRow}>
            <div className={`${styles.nadfunField} ${styles.nadfunFieldSm}`}>
              <label className={styles.nadfunLabel} htmlFor="nadfun-slippage">
                Slippage (%)
                <span className={styles.nadfunSlippageTip} title="Maximum price difference allowed. 1% is standard."> ⓘ</span>
              </label>
              <input
                id="nadfun-slippage"
                className={`${styles.nadfunInput} ${slippageWarning?.level === "error" ? styles.nadfunInputError : ""}`}
                type="number"
                min="0.1"
                max="49"
                step="0.1"
                value={(slippageBps / 100).toFixed(1)}
                onChange={(e) => setSlippageBps(Math.round(parseFloat(e.target.value) * 100))}
                aria-label="Slippage tolerance in percent"
                aria-describedby={slippageWarning ? "slippage-warning" : undefined}
                aria-invalid={slippageWarning?.level === "error"}
              />
              {slippageWarning && (
                <span
                  id="slippage-warning"
                  className={slippageWarning.level === "error" ? styles.nadfunSlippageError : styles.nadfunSlippageWarn}
                  role={slippageWarning.level === "error" ? "alert" : "status"}
                >
                  {slippageWarning.msg}
                </span>
              )}
            </div>
            <div className={`${styles.nadfunField} ${styles.nadfunFieldSm}`}>
              <label className={styles.nadfunLabel} htmlFor="nadfun-deadline">Deadline (min)</label>
              <input
                id="nadfun-deadline"
                className={styles.nadfunInput}
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
          <div className={styles.nadfunPresets} aria-label="Slippage presets">
            {[50, 100, 200, 500].map((bps) => (
              <button
                key={bps}
                type="button"
                className="ghost-btn"
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
            className={styles.nadfunQuoteBtn}
            onClick={getQuote}
            disabled={quoteLoading || quoteDebouncing}
            aria-busy={quoteLoading}
            aria-label="Get price quote"
          >
            {quoteLoading ? "Fetching…" : "Get Quote"}
          </button>

          {quote && (
            <div className={styles.nadfunQuoteResult} role="status" aria-live="polite">
              <span>{quote}{` (slippage ${(slippageBps / 100).toFixed(1)}%)`}</span>
              {quoteSecondsLeft > 0 && (
                <span className={`${styles.nadfunCountdownBadge} ${quoteSecondsLeft <= 5 ? styles.nadfunCountdownUrgent : ""}`}
                  aria-label={`Quote valid for ${quoteSecondsLeft} seconds`}
                >
                  ⏱ {quoteSecondsLeft}s
                </span>
              )}
            </div>
          )}

          {quoteExpired && !quote && !quoteLoading && (
            <div className={styles.nadfunQuoteExpired} role="status" aria-live="polite">
              Quote expired — get a new quote
            </div>
          )}
          {tabSwitchNotice && !quote && (
            <div className={styles.nadfunTabSwitchNotice} role="status" aria-live="polite">
              Switched to {tabSwitchNotice} — click Get Quote for a new price
            </div>
          )}

          {/* Execute */}
          {isConnected ? (
            <button
              type="button"
              className={styles.nadfunExecuteBtn}
              onClick={executeTrade}
              disabled={txLoading || !routerAddress}
              aria-busy={txLoading}
              aria-label={`Execute ${direction} trade`}
            >
              {txLoading ? "Confirming…" : `${direction === "buy" ? "Buy" : "Sell"} now`}
            </button>
          ) : (
            <div className={styles.nadfunConnectNotice} role="note">
              Connect wallet to trade
            </div>
          )}
        </>
      )}

      {/* Feedback */}
      {error && (
        <div className={styles.nadfunError} role="alert" aria-live="assertive">
          <span>{error}</span>
          <a
            href={`https://nad.fun/token/${tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.nadfunErrorFallback}
          >
            Open on nad.fun ↗
          </a>
        </div>
      )}
      {txHash && (
        <div className={styles.nadfunSuccess} role="status" aria-live="polite">
          <span>Transaction submitted — confirming…</span>
          <a
            href={`${process.env.NEXT_PUBLIC_BLOCK_EXPLORER || "https://testnet-explorer.hsk.xyz"}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.nadfunTxLink}
            aria-label="View transaction on block explorer"
          >
            View on Explorer ↗
          </a>
        </div>
      )}
    </div>
  );
}
