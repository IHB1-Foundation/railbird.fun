"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHIP_SYMBOL, cn, formatChips } from "@/lib/utils";
import type { TableResponse } from "@/lib/types";
import { buildSeatMarket, formatOdds, toImpliedPercent } from "@/lib/betting";
import { INDEXER_BASE } from "@/lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { Tooltip } from "./Tooltip";
import { AddressDisplay } from "./AddressDisplay";
import styles from "./BettingPanel.module.css";
const BANKROLL_KEY = "railbird_bet_bankroll_v1";
const WAGERS_KEY = "railbird_wagers_v1";
const SETTLED_HANDS_KEY = "railbird_settled_hands_v1";
const DEFAULT_BANKROLL = 1000n * 10n ** 18n;

type WagerStatus = "open" | "won" | "lost";

interface Wager {
  id: string;
  tableId: string;
  handId: string;
  seatIndex: number;
  stakeWei: string;
  oddsBps: number;
  profileName: string;
  status: WagerStatus;
  payoutWei?: string;
  placedAt: string;
  settledAt?: string;
}

interface BettingPanelProps {
  initialTable: TableResponse;
}

/** Type guard: value is a Wager object */
function isWager(v: unknown): v is Wager {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Record<string, unknown>;
  return (
    typeof w.id === "string" &&
    typeof w.tableId === "string" &&
    typeof w.handId === "string" &&
    typeof w.seatIndex === "number" &&
    typeof w.stakeWei === "string" &&
    typeof w.oddsBps === "number" &&
    typeof w.profileName === "string" &&
    (w.status === "open" || w.status === "won" || w.status === "lost") &&
    typeof w.placedAt === "string"
  );
}

/** Type guard: value is Wager[] */
function isWagerArray(v: unknown): v is Wager[] {
  return Array.isArray(v) && v.every(isWager);
}

/** Type guard: value is string[] */
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Max stake: 10^9 chips (prevents overflow in BigInt * 10^18 calculation). */
const MAX_STAKE_CHIPS = 1_000_000_000n;

/**
 * Parses a positive integer chip amount (no decimals) to its wei representation.
 * Returns null if the input is not a valid positive integer within range.
 */
function parseChipInputToWei(raw: string): bigint | null {
  const value = raw.trim();
  // Only allow positive integer strings (no decimals, no leading zeros except "0" itself)
  if (!/^[1-9]\d*$/.test(value)) return null;
  let chips: bigint;
  try {
    chips = BigInt(value);
  } catch {
    return null;
  }
  if (chips <= 0n || chips > MAX_STAKE_CHIPS) return null;
  return chips * 10n ** 18n;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function BettingPanel({ initialTable }: BettingPanelProps) {
  const [table, setTable] = useState<TableResponse>(initialTable);
  const [bankrollWei, setBankrollWei] = useState<bigint>(DEFAULT_BANKROLL);
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [settledHands, setSettledHands] = useState<Set<string>>(new Set());
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [stakeInput, setStakeInput] = useState("50");
  const [notice, setNotice] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBetConfirm, setShowBetConfirm] = useState(false);
  const [skipSmallBetConfirm, setSkipSmallBetConfirm] = useState(false);
  const [pendingBetWei, setPendingBetWei] = useState<bigint | null>(null);
  const [flashIds, setFlashIds] = useState<Map<string, "won" | "lost">>(new Map());
  const [mobileBankrollOpen, setMobileBankrollOpen] = useState(false);
  const [marketJustOpened, setMarketJustOpened] = useState(false);
  const prevMarketOpenRef = useRef<boolean | null>(null);
  const [jargonExpanded, setJargonExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("railbird_railing_intro_seen");
  });

  const showSuccess = useCallback((text: string) => setNotice({ text, type: "success" }), []);
  const showError = useCallback((text: string) => setNotice({ text, type: "error" }), []);

  // Auto-clear: success after 5 s, error after 10 s
  useEffect(() => {
    if (!notice) return;
    const ms = notice.type === "success" ? 5000 : 10000;
    const timer = setTimeout(() => setNotice(null), ms);
    return () => clearTimeout(timer);
  }, [notice]);

  const market = useMemo(() => buildSeatMarket(table), [table]);
  const handId = table.currentHand?.handId ?? null;
  const winnerSeat = table.currentHand?.winnerSeat ?? null;
  const marketOpen = handId !== null && winnerSeat === null;

  useEffect(() => {
    try {
      const rawBankroll = localStorage.getItem(BANKROLL_KEY);
      const rawWagers = localStorage.getItem(WAGERS_KEY);
      const rawSettled = localStorage.getItem(SETTLED_HANDS_KEY);

      if (rawBankroll) {
        // Validate: must be a numeric string parseable by BigInt
        if (/^\d+$/.test(rawBankroll.trim())) {
          setBankrollWei(BigInt(rawBankroll));
        } else {
          localStorage.removeItem(BANKROLL_KEY);
        }
      }

      if (rawWagers) {
        const parsed: unknown = JSON.parse(rawWagers);
        if (isWagerArray(parsed)) {
          setWagers(parsed);
        } else {
          localStorage.removeItem(WAGERS_KEY);
        }
      }

      if (rawSettled) {
        const parsed: unknown = JSON.parse(rawSettled);
        if (isStringArray(parsed)) {
          setSettledHands(new Set(parsed));
        } else {
          localStorage.removeItem(SETTLED_HANDS_KEY);
        }
      }
    } catch {
      // Corrupted localStorage — clear all betting keys and start from defaults
      localStorage.removeItem(BANKROLL_KEY);
      localStorage.removeItem(WAGERS_KEY);
      localStorage.removeItem(SETTLED_HANDS_KEY);
      showError("Saved betting data was corrupted. Starting from defaults.");
    }
  }, [showError]);

  // Poll while market is open (5s) — stop wasting RPC budget when settled
  useEffect(() => {
    if (!marketOpen) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${INDEXER_BASE}/api/tables/${table.tableId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as TableResponse;
        setTable(next);
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [marketOpen, table.tableId]);

  // Poll while market is closed (3s) to detect when next hand opens
  useEffect(() => {
    if (marketOpen) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${INDEXER_BASE}/api/tables/${table.tableId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as TableResponse;
        setTable(next);
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [marketOpen, table.tableId]);

  // Detect market-open transition → toast + pulse
  useEffect(() => {
    if (prevMarketOpenRef.current === false && marketOpen) {
      showSuccess("Betting is open! Place your bets.");
      setMarketJustOpened(true);
      const t = setTimeout(() => setMarketJustOpened(false), 3000);
      return () => clearTimeout(t);
    }
    prevMarketOpenRef.current = marketOpen;
  }, [marketOpen, showSuccess]);

  useEffect(() => {
    if (!handId || winnerSeat === null) return;
    const settleKey = `${table.tableId}:${handId}`;
    if (settledHands.has(settleKey)) return;

    let realized = 0n;
    const nextWagers: Wager[] = wagers.map((wager) => {
      if (wager.status !== "open") return wager;
      if (wager.tableId !== table.tableId || wager.handId !== handId) return wager;

      const won = wager.seatIndex === winnerSeat;
      if (!won) {
        return {
          ...wager,
          status: "lost" as const,
          payoutWei: "0",
          settledAt: nowIso(),
        };
      }

      const stake = BigInt(wager.stakeWei);
      const payout = (stake * BigInt(wager.oddsBps)) / 10_000n;
      realized += payout;
      return {
        ...wager,
        status: "won" as const,
        payoutWei: payout.toString(),
        settledAt: nowIso(),
      };
    });

    const nextBankroll = bankrollWei + realized;
    const nextSettled = new Set(settledHands);
    nextSettled.add(settleKey);

    setWagers(nextWagers);
    setBankrollWei(nextBankroll);
    setSettledHands(nextSettled);

    localStorage.setItem(WAGERS_KEY, JSON.stringify(nextWagers));
    localStorage.setItem(BANKROLL_KEY, nextBankroll.toString());
    localStorage.setItem(SETTLED_HANDS_KEY, JSON.stringify(Array.from(nextSettled)));

    // Build flash map for newly settled wagers
    const newFlash = new Map<string, "won" | "lost">();
    for (const w of nextWagers) {
      if (w.status !== "open" && !wagers.find((ow) => ow.id === w.id && ow.status !== "open")) {
        newFlash.set(w.id, w.status as "won" | "lost");
      }
    }
    if (newFlash.size > 0) {
      setFlashIds(newFlash);
      setTimeout(() => setFlashIds(new Map()), 2500);
    }

    if (realized > 0n) {
      showSuccess(`Hand #${handId} settled: +${formatChips(realized)} ${CHIP_SYMBOL}`);
    } else {
      showError(`Hand #${handId} settled: no winning tickets this round.`);
    }
  }, [
    bankrollWei,
    handId,
    settledHands,
    showError,
    showSuccess,
    table.tableId,
    wagers,
    winnerSeat,
  ]);

  const openWagers = wagers
    .filter((w) => w.status === "open")
    .slice(-8)
    .reverse();
  const settledWagers = wagers
    .filter((w) => w.status !== "open")
    .slice(-8)
    .reverse();
  const recentBets = [...wagers].reverse().slice(0, 10);

  const selectedMarket = market.find((m) => m.seatIndex === selectedSeat) ?? null;

  function persist(nextBankroll: bigint, nextWagers: Wager[]) {
    setBankrollWei(nextBankroll);
    setWagers(nextWagers);
    localStorage.setItem(BANKROLL_KEY, nextBankroll.toString());
    localStorage.setItem(WAGERS_KEY, JSON.stringify(nextWagers));
  }

  function validateBet(): bigint | null {
    setNotice(null);
    if (!marketOpen || !handId) {
      showError("Betting is closed right now. Wait for the next hand.");
      return null;
    }
    if (!selectedMarket) {
      showError("Select an agent before placing a bet.");
      return null;
    }
    const stakeWei = parseChipInputToWei(stakeInput);
    if (!stakeWei) {
      showError(
        `Invalid stake: enter a positive whole number between 1 and ${MAX_STAKE_CHIPS.toLocaleString()} chips.`,
      );
      return null;
    }
    if (stakeWei > bankrollWei) {
      showError("Insufficient bankroll.");
      return null;
    }
    return stakeWei;
  }

  function commitBet(stakeWei: bigint) {
    if (!selectedMarket || !handId) return;
    const nextBankroll = bankrollWei - stakeWei;
    const wager: Wager = {
      id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      tableId: table.tableId,
      handId,
      seatIndex: selectedMarket.seatIndex,
      stakeWei: stakeWei.toString(),
      oddsBps: selectedMarket.oddsBps,
      profileName: selectedMarket.profile.codename,
      status: "open",
      placedAt: nowIso(),
    };
    persist(nextBankroll, [...wagers, wager]);
    showSuccess(
      `Bet accepted: ${selectedMarket.profile.codename} / ${formatChips(stakeWei)} ${CHIP_SYMBOL} @ ${formatOdds(selectedMarket.oddsBps)}x`,
    );
  }

  function placeBet() {
    const stakeWei = validateBet();
    if (!stakeWei) return;
    // Skip confirmation for small bets when toggle enabled, or stake < 50 chips
    const SMALL_BET = 50n * 10n ** 18n;
    if (skipSmallBetConfirm && stakeWei < SMALL_BET) {
      commitBet(stakeWei);
      return;
    }
    setPendingBetWei(stakeWei);
    setShowBetConfirm(true);
  }

  function resetBook() {
    const empty: Wager[] = [];
    const settled = new Set<string>();
    showSuccess("Bet history has been reset.");
    setWagers(empty);
    setSettledHands(settled);
    setBankrollWei(DEFAULT_BANKROLL);
    localStorage.setItem(BANKROLL_KEY, DEFAULT_BANKROLL.toString());
    localStorage.setItem(WAGERS_KEY, JSON.stringify(empty));
    localStorage.setItem(SETTLED_HANDS_KEY, JSON.stringify([]));
  }

  const pnlForSummary = bankrollWei - DEFAULT_BANKROLL;
  const pnlPositive = pnlForSummary >= 0n;

  return (
    <section className="page-section">
      {/* Mobile sticky bankroll summary */}
      <div
        className={styles.mobileBankrollSummary}
        onClick={() => setMobileBankrollOpen((v) => !v)}
        role="button"
        aria-expanded={mobileBankrollOpen}
        aria-label="Toggle bankroll details"
      >
        <span>
          🎫{" "}
          <span className={styles.mobileBankrollChips}>
            {formatChips(bankrollWei)} {CHIP_SYMBOL}
          </span>
          {" | "}
          <span className={cn(styles.mobileBankrollPnl, pnlPositive ? "positive" : "negative")}>
            {pnlPositive ? "+" : ""}
            {formatChips(pnlForSummary)} P&L
          </span>
        </span>
        <span className={styles.mobileBankrollToggle}>{mobileBankrollOpen ? "▲" : "▼"}</span>
      </div>
      {mobileBankrollOpen && (
        <div className={styles.mobileBankrollExpanded}>
          <div className={`card ${styles.betBankroll}`} style={{ display: "block" }}>
            <div className="label">Virtual Bankroll</div>
            <div className={styles.betBankrollValue}>
              {formatChips(bankrollWei)} {CHIP_SYMBOL}
            </div>
            {(() => {
              const pnl = bankrollWei - DEFAULT_BANKROLL;
              const positive = pnl >= 0n;
              const settledCount = wagers.filter((w) => w.status !== "open").length;
              const wins = wagers.filter((w) => w.status === "won").length;
              return (
                <div style={{ fontSize: "0.75rem", display: "grid", gap: "0.1rem" }}>
                  <span style={{ color: positive ? "var(--success)" : "var(--danger)" }}>
                    Session P&L: {positive ? "+" : ""}
                    {formatChips(pnl)} {CHIP_SYMBOL}
                  </span>
                  {settledCount > 0 && (
                    <span className="muted">
                      Win rate: {wins}/{settledCount} ({Math.round((wins / settledCount) * 100)}%)
                    </span>
                  )}
                </div>
              );
            })()}
            <button
              className="ghost-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowResetConfirm(true);
              }}
              type="button"
              aria-label="Reset virtual bankroll to default"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      <div className={styles.betHeader}>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
              marginBottom: "0.25rem",
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Predict the Winner
            </h2>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#86efac",
                background: "rgba(134, 239, 172, 0.12)",
                border: "1px solid rgba(134, 239, 172, 0.35)",
                borderRadius: "999px",
                padding: "0.15rem 0.5rem",
              }}
              title="No real funds — this is a practice betting board using virtual chips"
            >
              Practice Mode
            </span>
          </div>
          <p className={styles.betSubtitle}>
            Place virtual bets on which AI agent wins the current hand. No real funds at risk.
          </p>
          {jargonExpanded && (
            <div className={styles.jargonExplainer}>
              <p>
                In poker, &ldquo;railing&rdquo; means watching from the sidelines while others play.
                Rail bets let you predict the winner and earn virtual chips.
              </p>
              <button
                className={styles.jargonDismiss}
                onClick={() => {
                  setJargonExpanded(false);
                  localStorage.setItem("railbird_railing_intro_seen", "1");
                }}
              >
                Got it ✕
              </button>
            </div>
          )}
        </div>
        <div className={`card ${styles.betBankroll}`}>
          <div className="label">Virtual Bankroll</div>
          <div className={styles.betBankrollValue}>
            {formatChips(bankrollWei)} {CHIP_SYMBOL}
          </div>
          {(() => {
            const pnl = bankrollWei - DEFAULT_BANKROLL;
            const positive = pnl >= 0n;
            const settledCount = wagers.filter((w) => w.status !== "open").length;
            const wins = wagers.filter((w) => w.status === "won").length;
            return (
              <div style={{ fontSize: "0.75rem", display: "grid", gap: "0.1rem" }}>
                <span style={{ color: positive ? "var(--success)" : "var(--danger)" }}>
                  Session P&L: {positive ? "+" : ""}
                  {formatChips(pnl)} {CHIP_SYMBOL}
                </span>
                {settledCount > 0 && (
                  <span className="muted">
                    Win rate: {wins}/{settledCount} ({Math.round((wins / settledCount) * 100)}%)
                  </span>
                )}
              </div>
            );
          })()}
          <button
            className="ghost-btn"
            onClick={() => setShowResetConfirm(true)}
            type="button"
            aria-label="Reset virtual bankroll to default"
          >
            Reset
          </button>
        </div>
      </div>

      <div
        className={`${styles.betMarketState} ${marketOpen ? styles.open : styles.closed}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {marketOpen ? `Hand #${handId} market open` : "Market closed — Refreshing status..."}
      </div>

      {notice && (
        <div
          className={cn(
            styles.betNotice,
            notice.type === "success" ? styles.betNoticeSuccess : styles.betNoticeError,
          )}
          role="alert"
          aria-live="polite"
        >
          <span>{notice.text}</span>
          <button
            type="button"
            className={styles.betNoticeDismiss}
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.betLayout}>
        <div className={styles.betAgentGrid}>
          {market.map((entry) => (
            <article
              key={entry.seatIndex}
              className={`card ${styles.betAgentCard} ${selectedSeat === entry.seatIndex ? styles.selected : ""} ${marketJustOpened ? styles.pulsing : ""}`}
              onClick={() => setSelectedSeat(entry.seatIndex)}
              role="radio"
              aria-checked={selectedSeat === entry.seatIndex}
              aria-label={`Bet on ${entry.profile.codename} at seat ${entry.seatIndex}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") setSelectedSeat(entry.seatIndex);
              }}
            >
              <div className={styles.betAgentTop}>
                <div>
                  <div className={styles.betAgentSeat}>Seat {entry.seatIndex}</div>
                  <h3 className={styles.betAgentName}>{entry.profile.codename}</h3>
                  <div className={styles.betAgentStyle}>{entry.profile.style}</div>
                </div>
                <div className={styles.betAgentOddsRow}>
                  <div className={styles.betAgentOdds}>
                    <Tooltip
                      text={`Odds based on chip pool distribution. ${entry.profile.codename} holds ${toImpliedPercent(entry.winProb)} of total chips → payout multiplier ${formatOdds(entry.oddsBps)}x`}
                    >
                      {formatOdds(entry.oddsBps)}x
                    </Tooltip>
                  </div>
                  {selectedSeat === entry.seatIndex && (
                    <span className={styles.selectedBadge}>Selected ✓</span>
                  )}
                </div>
              </div>

              <p className={styles.betAgentBlurb}>{entry.profile.blurb}</p>

              <div className={styles.betProbBar}>
                <div
                  className={styles.betProbFill}
                  style={{ width: `${Math.round(entry.winProb * 100)}%` }}
                />
                <span className={styles.betProbLabel}>
                  {toImpliedPercent(entry.winProb)} win est.
                </span>
              </div>

              <div className={styles.betAgentStats}>
                <span>Aggro: {(entry.profile.aggression * 100).toFixed(0)}%</span>
                <span>
                  Stack: {formatChips(entry.stack)} {CHIP_SYMBOL}
                </span>
              </div>

              <div className={styles.betAgentOwner}>
                <AddressDisplay address={entry.ownerAddress} />
              </div>
            </article>
          ))}
        </div>

        <aside className={`card ${styles.betSlip}`}>
          <h3 className="section-title-sm">Bet Slip</h3>
          <div className={styles.betSlipRow}>
            <span className="label">Table / Hand</span>
            <span>
              #{table.tableId} / {handId ?? "-"}
            </span>
          </div>
          <div className={styles.betSlipRow}>
            <span className="label">Selection</span>
            <span>{selectedMarket ? selectedMarket.profile.codename : "None"}</span>
          </div>
          <div className={styles.betSlipRow}>
            <span className="label">Odds</span>
            <span>{selectedMarket ? `${formatOdds(selectedMarket.oddsBps)}x` : "-"}</span>
          </div>

          <label className={styles.betInputLabel} htmlFor="stake-input">
            Stake ({CHIP_SYMBOL})
          </label>
          {(() => {
            const stakeWeiCheck = parseChipInputToWei(stakeInput);
            const exceedsBankroll = stakeWeiCheck !== null && stakeWeiCheck > bankrollWei;
            const invalid = stakeInput !== "" && (!stakeWeiCheck || exceedsBankroll);
            return (
              <>
                <input
                  id="stake-input"
                  className={styles.betInput}
                  style={invalid ? { borderColor: "var(--danger)" } : undefined}
                  value={stakeInput}
                  onChange={(e) => setStakeInput(e.target.value)}
                  placeholder="e.g. 50"
                  inputMode="decimal"
                  aria-invalid={invalid}
                  aria-describedby={invalid ? "stake-error" : undefined}
                />
                {exceedsBankroll && (
                  <span id="stake-error" style={{ color: "var(--danger)", fontSize: "0.72rem" }}>
                    Exceeds bankroll ({formatChips(bankrollWei)} available)
                  </span>
                )}
                {!exceedsBankroll && stakeInput !== "" && !stakeWeiCheck && (
                  <span id="stake-error" style={{ color: "var(--danger)", fontSize: "0.72rem" }}>
                    Enter a valid amount
                  </span>
                )}
              </>
            );
          })()}

          <div className={styles.betQuickRow}>
            {["10", "25", "50", "100"].map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.betPresetBtn} ${stakeInput === preset ? styles.betPresetActive : ""}`}
                onClick={() => setStakeInput(preset)}
                aria-label={`Set stake to ${preset} chips`}
                aria-pressed={stakeInput === preset}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Potential payout */}
          {selectedMarket &&
            (() => {
              const stakeWei = parseChipInputToWei(stakeInput);
              if (!stakeWei || stakeWei <= 0n) return null;
              const payout = (stakeWei * BigInt(selectedMarket.oddsBps)) / 10_000n;
              const profit = payout - stakeWei;
              return (
                <div
                  style={{
                    display: "grid",
                    gap: "0.25rem",
                    fontSize: "0.8rem",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "8px",
                    padding: "0.45rem 0.6rem",
                    border: "1px solid rgba(149,158,204,0.2)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label">Potential Win</span>
                    <span className="value-positive">
                      {formatChips(payout)} {CHIP_SYMBOL}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label">Profit</span>
                    <span className="value-positive">
                      +{formatChips(profit)} {CHIP_SYMBOL}
                    </span>
                  </div>
                </div>
              );
            })()}

          <button
            type="button"
            className={styles.betPlaceBtn}
            onClick={placeBet}
            disabled={!marketOpen}
            aria-disabled={!marketOpen}
            aria-label={
              marketOpen ? "Place bet on selected agent" : "Betting is closed — wait for next hand"
            }
          >
            Place Bet
          </button>

          <label className={styles.skipConfirmToggle}>
            <input
              type="checkbox"
              checked={skipSmallBetConfirm}
              onChange={(e) => setSkipSmallBetConfirm(e.target.checked)}
            />
            Skip confirmation for bets under 50 chips
          </label>
        </aside>
      </div>

      <div className={styles.betHistoryGrid}>
        <div className="card">
          <h3 className="section-title-sm">Open Bets</h3>
          {openWagers.length === 0 ? (
            <div className="muted">No open bets.</div>
          ) : (
            <div className={styles.betTicketList}>
              {openWagers.map((wager) => (
                <div key={wager.id} className={styles.betTicket}>
                  <div>{wager.profileName}</div>
                  <div>
                    Hand #{wager.handId} · {formatChips(BigInt(wager.stakeWei))} {CHIP_SYMBOL}
                  </div>
                  <div>@ {formatOdds(wager.oddsBps)}x</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="section-title-sm">Recent Settlements</h3>
          {settledWagers.length === 0 ? (
            <div className="muted">No settled bets yet.</div>
          ) : (
            <div className={styles.betTicketList}>
              {settledWagers.map((wager) => {
                const isFlashing = flashIds.has(wager.id);
                const flashType = flashIds.get(wager.id);
                return (
                  <div
                    key={wager.id}
                    className={`${styles.betTicket} ${wager.status === "won" ? styles.won : styles.lost} ${isFlashing ? (flashType === "won" ? styles.flashWon : styles.flashLost) : ""}`}
                  >
                    <div>
                      Hand #{wager.handId} · Seat {wager.seatIndex}
                    </div>
                    <div>{wager.profileName}</div>
                    <div>
                      {wager.status === "won"
                        ? `🎉 +${formatChips(BigInt(wager.payoutWei || "0"))} ${CHIP_SYMBOL}`
                        : `-${formatChips(BigInt(wager.stakeWei))} ${CHIP_SYMBOL}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* My Bets — last 10 */}
      <div className="card" style={{ marginTop: "1rem" }}>
        <h3 className="section-title-sm">My Bets</h3>
        {recentBets.length === 0 ? (
          <div className="muted">No bets placed yet.</div>
        ) : (
          <div className="table-scroll">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Hand</th>
                  <th>Agent</th>
                  <th>Stake</th>
                  <th>Odds</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBets.map((w) => (
                  <tr key={w.id}>
                    <td>#{w.handId}</td>
                    <td>{w.profileName}</td>
                    <td>
                      {formatChips(BigInt(w.stakeWei))} {CHIP_SYMBOL}
                    </td>
                    <td>{formatOdds(w.oddsBps)}x</td>
                    <td
                      className={
                        w.status === "won"
                          ? "value-positive"
                          : w.status === "lost"
                            ? "value-negative"
                            : ""
                      }
                    >
                      {w.status === "open"
                        ? "⏳ Pending"
                        : w.status === "won"
                          ? `✓ Won +${formatChips(BigInt(w.payoutWei || "0"))}`
                          : "✗ Lost"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p
        style={{
          marginTop: "0.75rem",
          fontSize: "0.72rem",
          color: "var(--muted)",
          textAlign: "center",
        }}
      >
        *Virtual bets only — no real funds at risk
      </p>

      <ConfirmDialog
        open={showResetConfirm}
        title="Reset Bankroll"
        message="Reset your virtual bankroll to 1000 chips? All bet history will be cleared."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          resetBook();
          setShowResetConfirm(false);
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      {showBetConfirm &&
        selectedMarket &&
        pendingBetWei &&
        (() => {
          const payout = (pendingBetWei * BigInt(selectedMarket.oddsBps)) / 10_000n;
          return (
            <ConfirmDialog
              open
              title={`Bet on ${selectedMarket.profile.codename}`}
              message={`Stake ${formatChips(pendingBetWei)} ${CHIP_SYMBOL} at ${formatOdds(selectedMarket.oddsBps)}x odds — potential win: ${formatChips(payout)} ${CHIP_SYMBOL}`}
              confirmLabel="Confirm Bet"
              cancelLabel="Cancel"
              onConfirm={() => {
                commitBet(pendingBetWei);
                setShowBetConfirm(false);
                setPendingBetWei(null);
              }}
              onCancel={() => {
                setShowBetConfirm(false);
                setPendingBetWei(null);
              }}
            />
          );
        })()}
    </section>
  );
}
