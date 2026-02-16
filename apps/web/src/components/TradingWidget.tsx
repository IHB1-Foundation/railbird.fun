"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import type { Address, TokenInfo, Quote, TokenStage } from "@/lib/nadfun/types";
import {
  getTokenInfo,
  getBuyQuote,
  getSellQuote,
  getMonBalance,
  getTokenBalance,
  getTokenSymbol,
  checkAllowance,
  approveToken,
  executeBuyBonding,
  executeSellBonding,
  executeBuyDex,
  executeSellDex,
  formatMon,
  formatToken,
  parseMon,
  parseToken,
} from "@/lib/nadfun/client";

interface TradingWidgetProps {
  tokenAddress: string;
}

type TradeMode = "buy" | "sell";
type TxStatus = "idle" | "approving" | "trading" | "success" | "error";

const SLIPPAGE_OPTIONS = [0.5, 1, 2, 5];
const DEFAULT_DEADLINE_MINUTES = 20;

function getStageLabel(stage: TokenStage): string {
  switch (stage) {
    case "bonding":
      return "Bonding Curve";
    case "locked":
      return "Locked";
    case "graduated":
      return "Graduated (DEX)";
    default:
      return "Unknown";
  }
}

function getStageColor(stage: TokenStage): string {
  switch (stage) {
    case "bonding":
      return "var(--accent)";
    case "locked":
      return "var(--warning, #f59e0b)";
    case "graduated":
      return "var(--success, #22c55e)";
    default:
      return "var(--muted)";
  }
}

function getExecutionVenue(stage: TokenStage): string {
  switch (stage) {
    case "graduated":
      return "DEX Router";
    case "bonding":
    case "locked":
      return "Bonding Router";
    default:
      return "Router Unknown";
  }
}

export default function TradingWidget({ tokenAddress }: TradingWidgetProps) {
  const { isConnected, address } = useAuth();

  // Token state
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("TOKEN");
  const [loading, setLoading] = useState(true);

  // Balances
  const [monBalance, setMonBalance] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);

  // Trade form
  const [mode, setMode] = useState<TradeMode>("buy");
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(100); // 1%
  const [customSlippage, setCustomSlippage] = useState("");
  const [deadlineMinutes, setDeadlineMinutes] = useState(DEFAULT_DEADLINE_MINUTES);

  // Quote
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Transaction
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Load token info on mount
  useEffect(() => {
    async function loadTokenInfo() {
      setLoading(true);
      try {
        const [info, symbol] = await Promise.all([
          getTokenInfo(tokenAddress as Address),
          getTokenSymbol(tokenAddress as Address),
        ]);
        setTokenInfo(info);
        setTokenSymbol(symbol);
      } catch (err) {
        console.error("Failed to load token info:", err);
      }
      setLoading(false);
    }
    loadTokenInfo();
  }, [tokenAddress]);

  // Load balances when connected
  useEffect(() => {
    async function loadBalances() {
      if (!isConnected || !address) {
        setMonBalance(0n);
        setTokenBalance(0n);
        return;
      }

      try {
        const [mon, token] = await Promise.all([
          getMonBalance(address as Address),
          getTokenBalance(tokenAddress as Address, address as Address),
        ]);
        setMonBalance(mon);
        setTokenBalance(token);
      } catch (err) {
        console.error("Failed to load balances:", err);
      }
    }
    loadBalances();
  }, [isConnected, address, tokenAddress]);

  // Fetch quote when amount changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (!amountIn || parseFloat(amountIn) <= 0) {
        setQuote(null);
        return;
      }

      setQuoteLoading(true);
      try {
        if (mode === "buy") {
          const monAmount = parseMon(amountIn);
          const q = await getBuyQuote(
            tokenAddress as Address,
            monAmount,
            slippageBps
          );
          setQuote(q);
        } else {
          const tokenAmount = parseToken(amountIn);
          const q = await getSellQuote(
            tokenAddress as Address,
            tokenAmount,
            slippageBps
          );
          setQuote(q);
        }
      } catch (err) {
        console.error("Failed to get quote:", err);
        setQuote(null);
      }
      setQuoteLoading(false);
    };

    // Debounce
    const timer = setTimeout(fetchQuote, 300);
    return () => clearTimeout(timer);
  }, [amountIn, mode, tokenAddress, slippageBps]);

  // Handle slippage change
  const handleSlippageChange = useCallback((bps: number) => {
    setSlippageBps(bps);
    setCustomSlippage("");
  }, []);

  const handleCustomSlippageChange = useCallback((value: string) => {
    setCustomSlippage(value);
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0 && num <= 50) {
      setSlippageBps(Math.round(num * 100));
    }
  }, []);

  // Execute trade
  const executeTrade = useCallback(async () => {
    if (!isConnected || !address || !quote || !tokenInfo) return;

    const userAddress = address as Address;
    const token = tokenAddress as Address;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);

    setTxStatus("trading");
    setTxError(null);
    setTxHash(null);

    try {
      let hash: string;

      if (mode === "buy") {
        // Buy: use bonding or DEX based on stage
        if (tokenInfo.stage === "graduated") {
          hash = await executeBuyDex(
            token,
            quote.amountIn,
            quote.minAmountOut,
            deadline,
            userAddress
          );
        } else {
          hash = await executeBuyBonding(
            token,
            quote.amountIn,
            quote.minAmountOut,
            deadline,
            userAddress
          );
        }
      } else {
        // Sell: check allowance and approve if needed
        const routerAddress = tokenInfo.routerAddress;
        const allowance = await checkAllowance(token, userAddress, routerAddress);

        if (allowance < quote.amountIn) {
          setTxStatus("approving");
          const approveHash = await approveToken(
            token,
            routerAddress,
            quote.amountIn
          );
          // Wait a bit for approval to be mined (in production, wait for receipt)
          await new Promise((resolve) => setTimeout(resolve, 2000));
          setTxStatus("trading");
        }

        // Execute sell
        if (tokenInfo.stage === "graduated") {
          hash = await executeSellDex(
            token,
            quote.amountIn,
            quote.minAmountOut,
            deadline,
            userAddress
          );
        } else {
          hash = await executeSellBonding(
            token,
            quote.amountIn,
            quote.minAmountOut,
            deadline,
            userAddress
          );
        }
      }

      setTxHash(hash);
      setTxStatus("success");
      setAmountIn("");
      setQuote(null);

      // Refresh balances
      const [mon, tokenBal] = await Promise.all([
        getMonBalance(userAddress),
        getTokenBalance(token, userAddress),
      ]);
      setMonBalance(mon);
      setTokenBalance(tokenBal);
    } catch (err) {
      console.error("Trade failed:", err);
      setTxError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus("error");
    }
  }, [isConnected, address, quote, tokenInfo, tokenAddress, mode, deadlineMinutes]);

  // Set max amount
  const setMaxAmount = useCallback(() => {
    if (mode === "buy") {
      // Leave some MON for gas
      const maxMon = monBalance > 10000000000000000n ? monBalance - 10000000000000000n : 0n;
      setAmountIn(formatMon(maxMon, 6));
    } else {
      setAmountIn(formatToken(tokenBalance, 6));
    }
  }, [mode, monBalance, tokenBalance]);

  // Render loading state
  if (loading) {
    return (
      <div className="trading-widget">
        <div className="loading-spinner">Loading token info...</div>
      </div>
    );
  }

  // Render error state if token not found
  if (!tokenInfo) {
    return (
      <div className="trading-widget">
        <div className="trading-error">
          <p>Unable to load token information</p>
          <a
            href={`https://nad.fun/token/${tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="nadfun-fallback-btn"
          >
            Open on nad.fun
          </a>
        </div>
      </div>
    );
  }

  // Check if trading is available
  const canTrade = tokenInfo.tradeable && isConnected;
  const insufficientBalance =
    mode === "buy"
      ? quote && quote.amountIn > monBalance
      : quote && quote.amountIn > tokenBalance;
  const inputSymbol = mode === "buy" ? "MON" : tokenSymbol;
  const outputSymbol = mode === "buy" ? tokenSymbol : "MON";

  return (
    <div className="trading-widget nadfun-widget">
      <div className="nadfun-header">
        <div className="nadfun-title-wrap">
          <span className="nadfun-brand">nad.fun</span>
          <span className="nadfun-compatible">compatible</span>
        </div>
        <a
          href={`https://nad.fun/token/${tokenAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="nadfun-open-link"
        >
          Open
        </a>
      </div>

      <div className="nadfun-meta-row">
        <span className="nadfun-meta-pill" style={{ color: getStageColor(tokenInfo.stage) }}>
          {getStageLabel(tokenInfo.stage)}
        </span>
        <span className="nadfun-meta-pill">{getExecutionVenue(tokenInfo.stage)}</span>
        {tokenInfo.currentPrice > 0n && (
          <span className="nadfun-meta-pill">{formatMon(tokenInfo.currentPrice, 8)} MON</span>
        )}
      </div>

      <div className="mode-toggle nadfun-mode-toggle">
        <button
          className={`mode-btn ${mode === "buy" ? "active" : ""}`}
          onClick={() => {
            setMode("buy");
            setAmountIn("");
            setQuote(null);
          }}
        >
          Buy
        </button>
        <button
          className={`mode-btn ${mode === "sell" ? "active" : ""}`}
          onClick={() => {
            setMode("sell");
            setAmountIn("");
            setQuote(null);
          }}
        >
          Sell
        </button>
      </div>

      <div className="nadfun-swap-panel">
        <div className="nadfun-input-card">
          <div className="nadfun-input-top">
            <label className="amount-label">You pay</label>
            <button className="max-btn nadfun-max-btn" onClick={setMaxAmount} disabled={!isConnected}>
              MAX
            </button>
          </div>
          <div className="nadfun-input-row">
            <input
              type="text"
              className="amount-input"
              placeholder="0.0"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              disabled={!tokenInfo.tradeable}
            />
            <span className="nadfun-token-pill">{inputSymbol}</span>
          </div>
          {isConnected && (
            <div className="balance-display">
              Balance:{" "}
              {mode === "buy"
                ? `${formatMon(monBalance, 4)} MON`
                : `${formatToken(tokenBalance, 4)} ${tokenSymbol}`}
            </div>
          )}
        </div>

        <div className="nadfun-swap-arrow" aria-hidden="true">↓</div>

        <div className="nadfun-output-card">
          <div className="quote-row">
            <span>You receive</span>
            <span>
              {quote && quote.amountOut > 0n
                ? `${mode === "buy" ? formatToken(quote.amountOut, 4) : formatMon(quote.amountOut, 4)} ${outputSymbol}`
                : `0 ${outputSymbol}`}
            </span>
          </div>
          {quote && quote.amountOut > 0n && (
            <div className="quote-row">
              <span>Min. received</span>
              <span>
                {mode === "buy"
                  ? `${formatToken(quote.minAmountOut, 4)} ${tokenSymbol}`
                  : `${formatMon(quote.minAmountOut, 4)} MON`}
              </span>
            </div>
          )}
          {quote && quote.priceImpact > 0 && (
            <div className="quote-row">
              <span>Price Impact</span>
              <span className={quote.priceImpact > 5 ? "high-impact" : ""}>
                {quote.priceImpact.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {quoteLoading && <div className="quote-loading">Getting quote...</div>}

      <div className="nadfun-settings-grid">
        <div className="slippage-settings">
          <label className="slippage-label">Slippage</label>
          <div className="slippage-options">
            {SLIPPAGE_OPTIONS.map((opt) => (
              <button
                key={opt}
                className={`slippage-btn ${slippageBps === opt * 100 ? "active" : ""}`}
                onClick={() => handleSlippageChange(opt * 100)}
              >
                {opt}%
              </button>
            ))}
            <input
              type="text"
              className="slippage-custom"
              placeholder="Custom"
              value={customSlippage}
              onChange={(e) => handleCustomSlippageChange(e.target.value)}
            />
          </div>
        </div>

        <div className="deadline-settings">
          <label className="deadline-label">Deadline</label>
          <div className="deadline-input-row">
            <input
              type="number"
              className="deadline-input"
              value={deadlineMinutes}
              onChange={(e) => setDeadlineMinutes(parseInt(e.target.value) || DEFAULT_DEADLINE_MINUTES)}
              min={1}
              max={60}
            />
            <span className="deadline-unit">min</span>
          </div>
        </div>
      </div>

      <div className="action-container">
        {!isConnected ? (
          <button className="trade-btn disabled" disabled>
            Connect Wallet
          </button>
        ) : !tokenInfo.tradeable ? (
          <button className="trade-btn disabled" disabled>
            Trading Unavailable
          </button>
        ) : txStatus === "approving" ? (
          <button className="trade-btn loading" disabled>
            Approving...
          </button>
        ) : txStatus === "trading" ? (
          <button className="trade-btn loading" disabled>
            Confirming...
          </button>
        ) : insufficientBalance ? (
          <button className="trade-btn disabled" disabled>
            Insufficient Balance
          </button>
        ) : !quote || quote.amountOut === 0n ? (
          <button className="trade-btn disabled" disabled>
            Enter Amount
          </button>
        ) : (
          <button className="trade-btn" onClick={executeTrade}>
            {mode === "buy" ? `Buy ${tokenSymbol}` : `Sell ${tokenSymbol}`}
          </button>
        )}
      </div>

      {/* Transaction Status */}
      {txStatus === "success" && txHash && (
        <div className="tx-success">
          Transaction successful!{" "}
          <a
            href={`https://testnet.monadexplorer.com/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View
          </a>
        </div>
      )}

      {txStatus === "error" && txError && (
        <div className="tx-error">{txError}</div>
      )}

      <div className="fallback-container">
        <a
          href={`https://nad.fun/token/${tokenAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="nadfun-fallback-link"
        >
          Open on nad.fun
        </a>
      </div>
    </div>
  );
}
