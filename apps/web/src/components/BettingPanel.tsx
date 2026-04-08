"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CHIP_SYMBOL, cn, formatChips, shortenAddress } from "@/lib/utils";
import type { TableResponse } from "@/lib/types";
import { buildSeatMarket, formatOdds, toImpliedPercent } from "@/lib/betting";
import { INDEXER_BASE } from "@/lib/api";
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

  const showSuccess = useCallback((text: string) => setNotice({ text, type: "success" }), []);
  const showError   = useCallback((text: string) => setNotice({ text, type: "error" }),   []);

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

  // Only poll while a hand is in progress — stops wasting RPC budget between hands.
  useEffect(() => {
    if (!marketOpen) return;

    const id = setInterval(async () => {
      try {
        const res = await fetch(`${INDEXER_BASE}/api/tables/${table.tableId}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as TableResponse;
        setTable(next);
      } catch {
        // ignore transient fetch errors
      }
    }, 5000);

    return () => clearInterval(id);
  }, [marketOpen, table.tableId]);

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

    if (realized > 0n) {
      showSuccess(`Hand #${handId} settled: +${formatChips(realized)} ${CHIP_SYMBOL}`);
    } else {
      showError(`Hand #${handId} settled: no winning tickets this round.`);
    }
  }, [bankrollWei, handId, settledHands, showError, showSuccess, table.tableId, wagers, winnerSeat]);

  const openWagers = wagers.filter((w) => w.status === "open").slice(-8).reverse();
  const settledWagers = wagers.filter((w) => w.status !== "open").slice(-8).reverse();
  const recentBets = [...wagers].reverse().slice(0, 10);

  const selectedMarket = market.find((m) => m.seatIndex === selectedSeat) ?? null;

  function persist(nextBankroll: bigint, nextWagers: Wager[]) {
    setBankrollWei(nextBankroll);
    setWagers(nextWagers);
    localStorage.setItem(BANKROLL_KEY, nextBankroll.toString());
    localStorage.setItem(WAGERS_KEY, JSON.stringify(nextWagers));
  }

  function placeBet() {
    setNotice(null);
    if (!marketOpen || !handId) {
      showError("Betting is closed right now. Wait for the next hand.");
      return;
    }
    if (!selectedMarket) {
      showError("Select an agent before placing a bet.");
      return;
    }

    const stakeWei = parseChipInputToWei(stakeInput);
    if (!stakeWei) {
      showError(`Invalid stake: enter a positive whole number between 1 and ${MAX_STAKE_CHIPS.toLocaleString()} chips.`);
      return;
    }
    if (stakeWei > bankrollWei) {
      showError("Insufficient bankroll.");
      return;
    }

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

    const nextWagers = [...wagers, wager];
    persist(nextBankroll, nextWagers);
    showSuccess(
      `Bet accepted: ${selectedMarket.profile.codename} / ${formatChips(stakeWei)} ${CHIP_SYMBOL} @ ${formatOdds(selectedMarket.oddsBps)}x`
    );
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

  return (
    <section className="page-section">
      <div className={styles.betHeader}>
        <div>
          <h2 className="section-title">Rail Bets</h2>
          <p className={styles.betSubtitle}>
            Agent-profile winner board. Settlements are processed automatically from the current hand winner.
          </p>
        </div>
        <div className={`card ${styles.betBankroll}`}>
          <div className="label">Virtual Bankroll</div>
          <div className={styles.betBankrollValue}>
            {formatChips(bankrollWei)} {CHIP_SYMBOL}
          </div>
          <button className="ghost-btn" onClick={resetBook} type="button" aria-label="Reset virtual bankroll to default">
            Reset
          </button>
        </div>
      </div>

      <div className={`${styles.betMarketState} ${marketOpen ? styles.open : styles.closed}`} aria-live="polite" aria-atomic="true">
        {marketOpen ? `Hand #${handId} market open` : "Market closed (waiting for next hand)"}
      </div>

      {notice && (
        <div
          className={cn(styles.betNotice, notice.type === "success" ? styles.betNoticeSuccess : styles.betNoticeError)}
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
              className={`card ${styles.betAgentCard} ${selectedSeat === entry.seatIndex ? styles.selected : ""}`}
            >
              <div className={styles.betAgentTop}>
                <div>
                  <div className={styles.betAgentSeat}>Seat {entry.seatIndex}</div>
                  <h3 className={styles.betAgentName}>{entry.profile.codename}</h3>
                  <div className={styles.betAgentStyle}>{entry.profile.style}</div>
                </div>
                <div className={styles.betAgentOdds}>{formatOdds(entry.oddsBps)}x</div>
              </div>

              <p className={styles.betAgentBlurb}>{entry.profile.blurb}</p>

              <div className={styles.betProbBar}>
                <div
                  className={styles.betProbFill}
                  style={{ width: `${Math.round(entry.winProb * 100)}%` }}
                />
                <span className={styles.betProbLabel}>{toImpliedPercent(entry.winProb)} win est.</span>
              </div>

              <div className={styles.betAgentStats}>
                <span>Aggro: {(entry.profile.aggression * 100).toFixed(0)}%</span>
                <span>Stack: {formatChips(entry.stack)} {CHIP_SYMBOL}</span>
              </div>

              <div className={styles.betAgentOwner}>{shortenAddress(entry.ownerAddress)}</div>

              <button
                type="button"
                className={styles.betSelectBtn}
                onClick={() => setSelectedSeat(entry.seatIndex)}
                aria-pressed={selectedSeat === entry.seatIndex}
                aria-label={`Bet on ${entry.profile.codename} at seat ${entry.seatIndex}`}
              >
                {selectedSeat === entry.seatIndex ? "Selected" : "Bet on this agent"}
              </button>
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

          <label className={styles.betInputLabel} htmlFor="stake-input">Stake ({CHIP_SYMBOL})</label>
          <input
            id="stake-input"
            className={styles.betInput}
            value={stakeInput}
            onChange={(e) => setStakeInput(e.target.value)}
            placeholder="e.g. 50"
            inputMode="decimal"
          />

          <div className={styles.betQuickRow}>
            {["10", "25", "50", "100"].map((preset) => (
              <button
                key={preset}
                type="button"
                className="ghost-btn"
                onClick={() => setStakeInput(preset)}
              >
                {preset}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles.betPlaceBtn}
            onClick={placeBet}
            disabled={!marketOpen}
            aria-disabled={!marketOpen}
            aria-label={marketOpen ? "Place bet on selected agent" : "Betting is closed — wait for next hand"}
          >
            Place Bet
          </button>
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
              {settledWagers.map((wager) => (
                <div key={wager.id} className={`${styles.betTicket} ${wager.status === "won" ? styles.won : styles.lost}`}>
                  <div>
                    Hand #{wager.handId} · Seat {wager.seatIndex}
                  </div>
                  <div>{wager.profileName}</div>
                  <div>
                    {wager.status === "won"
                      ? `✓ WIN +${formatChips(BigInt(wager.payoutWei || "0"))} ${CHIP_SYMBOL}`
                      : "✗ LOSE"}
                  </div>
                </div>
              ))}
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
                    <td>{formatChips(BigInt(w.stakeWei))} {CHIP_SYMBOL}</td>
                    <td>{formatOdds(w.oddsBps)}x</td>
                    <td className={w.status === "won" ? "value-positive" : w.status === "lost" ? "value-negative" : ""}>
                      {w.status === "open" ? "⏳ Pending" : w.status === "won" ? `✓ Won +${formatChips(BigInt(w.payoutWei || "0"))}` : "✗ Lost"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ marginTop: "0.75rem", fontSize: "0.72rem", color: "var(--muted)", textAlign: "center" }}>
        *Virtual bets only — no real funds at risk
      </p>
    </section>
  );
}
