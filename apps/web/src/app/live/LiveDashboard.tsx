"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { INDEXER_BASE, getTable, getTables } from "@/lib/api";
import type { TableResponse, HandResponse } from "@/lib/types";
import { AgentCards } from "./AgentCards";
import { StatsTicker } from "./StatsTicker";
import styles from "./live.module.css";

const POLL_INTERVAL = 3_000;
const CARD_SYMBOLS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUIT_SYMBOLS = ["♣","♦","♥","♠"];
const SUIT_COLORS = ["#6b7280","#ef4444","#ef4444","#3b82f6"];

function formatCard(card: number): { rank: string; suit: string; color: string } {
  const rank = CARD_SYMBOLS[card % 13] ?? "?";
  const suitIdx = Math.floor(card / 13);
  return { rank, suit: SUIT_SYMBOLS[suitIdx] ?? "?", color: SUIT_COLORS[suitIdx] ?? "#9ca3af" };
}

function CardChip({ card }: { card: number }) {
  const { rank, suit, color } = formatCard(card);
  return (
    <div className={styles.cardChip}>
      <span className={styles.cardChipRank}>{rank}</span>
      <span className={styles.cardChipSuit} style={{ color }}>{suit}</span>
    </div>
  );
}

interface SideBetInfo {
  totalPool: bigint;
  seatOdds: { seat: number; odds: string }[];
}

function isLiveTable(table: TableResponse): boolean {
  return table.gameState !== "WAITING_FOR_SEATS" && table.gameState !== "SETTLED";
}

function compareTableActivity(a: TableResponse, b: TableResponse): number {
  const aLive = isLiveTable(a) ? 1 : 0;
  const bLive = isLiveTable(b) ? 1 : 0;
  if (aLive !== bLive) return bLive - aLive;

  const aPot = BigInt(a.currentHand?.pot ?? "0");
  const bPot = BigInt(b.currentHand?.pot ?? "0");
  if (aPot !== bPot) return bPot > aPot ? 1 : -1;

  const aHandId = BigInt(a.currentHandId || "0");
  const bHandId = BigInt(b.currentHandId || "0");
  if (aHandId === bHandId) return 0;
  return bHandId > aHandId ? 1 : -1;
}

export function LiveDashboard() {
  const [tables, setTables] = useState<TableResponse[]>([]);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [activeTable, setActiveTable] = useState<TableResponse | null>(null);
  const [hand, setHand] = useState<HandResponse | null>(null);
  const [lastReasoning, setLastReasoning] = useState<string>("");
  const [commentary, setCommentary] = useState<{ text: string; time: string }[]>([]);
  const [sideBet, setSideBet] = useState<SideBetInfo>({ totalPool: 0n, seatOdds: [] });
  const [totalHandsToday, setTotalHandsToday] = useState(0);
  const [biggestPot, setBiggestPot] = useState(0n);
  const [currentLeader, setCurrentLeader] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showShowdown, setShowShowdown] = useState(false);
  const [showdownInfo, setShowdownInfo] = useState<{ winner: number; pot: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevHandIdRef = useRef<string | null>(null);
  const lastCommentaryKeyRef = useRef<string | null>(null);

  const isAllIn = hand?.actions?.some((a) => (
    a.actionType === "ALL_IN" || (a.actionType === "RAISE" && a.amount && BigInt(a.amount) > 500n)
  )) ?? false;
  const avgPot = biggestPot / 3n;
  const isBigPot = hand ? BigInt(hand.pot ?? 0) > avgPot && avgPot > 0n : false;

  // Fetch table list
  const fetchTables = useCallback(async () => {
    try {
      const nextTables = await getTables();
      setTables(nextTables);

      const mostActiveTable = [...nextTables].sort(compareTableActivity)[0] ?? null;
      setActiveTableId((current) => {
        if (current && nextTables.some((table) => table.tableId === current)) {
          return current;
        }
        return mostActiveTable?.tableId ?? null;
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch active table state
  const fetchTableState = useCallback(async () => {
    if (!activeTableId) return;
    try {
      const table = await getTable(activeTableId);
      setActiveTable(table);

      const currentHand = table.currentHand;
      setHand(currentHand);

      // Detect showdown
      if (table.gameState === "SETTLED" && currentHand && currentHand.winnerSeat !== null && prevHandIdRef.current !== currentHand.handId) {
        setShowdownInfo({ winner: currentHand.winnerSeat, pot: currentHand.settlementAmount ?? currentHand.pot });
        setShowShowdown(true);
        setTimeout(() => setShowShowdown(false), 5000);
        prevHandIdRef.current = currentHand.handId;
      }

      // Extract last reasoning from actions
      if (currentHand?.actions) {
        const withReasoning = [...currentHand.actions].reverse().find((a) => a.reasoning);
        if (withReasoning?.reasoning) setLastReasoning(withReasoning.reasoning);
      }

      // Update total hands
      setTotalHandsToday((p) => Math.max(p, parseInt(table.currentHandId ?? "0", 10)));

      // Update biggest pot
      if (currentHand?.pot) {
        const pot = BigInt(currentHand.pot);
        setBiggestPot((p) => (pot > p ? pot : p));
      }
    } catch {
      /* ignore */
    }
  }, [activeTableId]);

  // Fetch side bet data
  const fetchSideBet = useCallback(async () => {
    if (!activeTable?.contractAddress || !hand?.handId) return;
    try {
      const res = await fetch(`${INDEXER_BASE}/api/sidebets/${activeTable.contractAddress}/${hand.handId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { totalPool?: string; seatTotals?: Record<string, string> };
      const totalPool = BigInt(data.totalPool ?? 0);
      const seatTotals = data.seatTotals ?? {};
      const seatOdds = Object.entries(seatTotals).map(([seat, amount]) => {
        const pct = totalPool > 0n ? Math.round((Number(BigInt(amount)) / Number(totalPool)) * 100) : 0;
        return { seat: parseInt(seat, 10), odds: `${pct}%` };
      });
      setSideBet({ totalPool, seatOdds });
    } catch {
      /* ignore */
    }
  }, [activeTable?.contractAddress, hand?.handId]);

  // Add commentary entry
  const addCommentary = useCallback((text: string) => {
    const time = new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setCommentary((prev) => [...prev.slice(-5), { text, time }]);
  }, []);

  // Generate auto commentary from hand state
  useEffect(() => {
    if (!hand?.actions?.length) return;
    const lastAction = hand.actions[hand.actions.length - 1];
    if (!lastAction) return;
    const commentaryKey = `${hand.handId}:${lastAction.txHash}:${lastAction.blockNumber}:${lastAction.seatIndex}`;
    if (lastCommentaryKeyRef.current === commentaryKey) return;
    const { seatIndex, actionType, amount, potAfter } = lastAction;
    let text = "";
    if (actionType === "FOLD") text = `Seat ${seatIndex} folds. Pot: ${potAfter} RCHIP`;
    else if (actionType === "CALL") text = `Seat ${seatIndex} calls ${amount}. Pot: ${potAfter} RCHIP`;
    else if (actionType === "RAISE") text = `Seat ${seatIndex} raises to ${amount}! Pot: ${potAfter} RCHIP`;
    else if (actionType === "CHECK") text = `Seat ${seatIndex} checks.`;
    if (text) {
      lastCommentaryKeyRef.current = commentaryKey;
      addCommentary(text);
    }
  }, [hand?.actions, hand?.actions?.length, hand?.handId, addCommentary]);

  // Set leader from leaderboard
  useEffect(() => {
    fetch(`${INDEXER_BASE}/api/leaderboard?metric=roi&period=24h`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { entries?: Array<{ tokenAddress: string }> }) => {
        const top = data.entries?.[0];
        if (top?.tokenAddress) {
          setCurrentLeader(top.tokenAddress.slice(0, 8) + "…");
        }
      })
      .catch(() => {});
  }, []);

  // Poll — pauses when tab is hidden to avoid unnecessary requests (D-59)
  useEffect(() => {
    fetchTables();
    const t1 = setInterval(() => {
      if (document.visibilityState === "visible") fetchTables();
    }, 15_000);
    return () => clearInterval(t1);
  }, [fetchTables]);

  useEffect(() => {
    fetchTableState();
    fetchSideBet();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchTableState();
        fetchSideBet();
      }
    }, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchTableState, fetchSideBet]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const communityCards = hand?.communityCards?.filter((c) => c !== 255) ?? [];
  const gameStateLabel = hand?.gameState?.replace(/_/g, " ") ?? "—";

  return (
    <div ref={rootRef} className={styles.liveRoot}>
      {/* Header */}
      <div className={styles.liveHeader}>
        <div className={styles.liveBadge}>
          <div className={styles.liveDot} />
          LIVE
        </div>
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#f9fafb" }}>AI Poker Arena</span>
        {hand && (
          <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
            Hand #{hand.handId} · {gameStateLabel}
          </span>
        )}
        {isBigPot && <span className={styles.bigPotBadge}>BIG POT</span>}
        <Link href="/" style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#4b5563", textDecoration: "none" }}>
          ← Back
        </Link>
        <button className={styles.fullscreenBtn} onClick={toggleFullscreen}>
          {isFullscreen ? "⛶ Exit" : "⛶ Fullscreen"}
        </button>
      </div>

      {/* Body */}
      <div className={styles.liveBody}>
        {/* Main pane */}
        <div className={styles.mainPane}>
          {/* Table selector */}
          {tables.length > 1 && (
            <div className={styles.tableSelector}>
              {tables.map((t) => (
                <button
                  key={t.tableId}
                  onClick={() => setActiveTableId(t.tableId)}
                  className={activeTableId === t.tableId ? `${styles.tableSelectorBtn} ${styles.tableSelectorBtnActive}` : styles.tableSelectorBtn}
                >
                  Table #{t.tableId} (Hand #{t.currentHandId})
                </button>
              ))}
            </div>
          )}

          {!activeTable ? (
            <div className={styles.waitingState}>
              <div style={{ fontSize: "3rem" }}>♠</div>
              <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>Waiting for next hand…</p>
              <p style={{ fontSize: "0.875rem" }}>AI agents are being deployed.</p>
            </div>
          ) : (
            <div className={isAllIn ? styles.allInGlow : ""} style={{ background: "#111827", borderRadius: "0.75rem", padding: "1.5rem" }}>
              {/* Community cards */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Community Cards</span>
                  <span style={{ fontSize: "0.8rem", color: "#8b5cf6", fontWeight: 600 }}>{gameStateLabel}</span>
                </div>
                {communityCards.length === 0 ? (
                  <p style={{ color: "#374151", fontSize: "0.875rem" }}>Cards dealt after preflop betting</p>
                ) : (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {communityCards.map((c, i) => <CardChip key={i} card={c} />)}
                  </div>
                )}
              </div>

              {/* Pot */}
              <div style={{ display: "flex", gap: "2rem", marginBottom: "1.25rem" }}>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>POT</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#f9fafb" }}>
                    {hand?.pot ?? "0"} RCHIP
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>CURRENT BET</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fbbf24" }}>
                    {hand?.currentBet ?? "0"} RCHIP
                  </div>
                </div>
                {isAllIn && (
                  <div style={{ alignSelf: "center" }}>
                    <span style={{ background: "#7f1d1d", color: "#fca5a5", fontWeight: 800, fontSize: "0.875rem", padding: "0.25rem 0.75rem", borderRadius: "9999px" }}>
                      ALL-IN!
                    </span>
                  </div>
                )}
              </div>

              {/* Seat panels (minimal) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.5rem" }}>
                {(activeTable.seats ?? []).map((seat) => (
                  <div key={seat.seatIndex} style={{
                    background: seat.isActive ? "rgba(139,92,246,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${seat.isActive ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: "0.5rem", padding: "0.5rem 0.625rem",
                    opacity: seat.isActive ? 1 : 0.5,
                  }}>
                    <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>Seat {seat.seatIndex}</div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, fontFamily: "monospace" }}>
                      {seat.stack} RCHIP
                    </div>
                    {!seat.isActive && <div style={{ fontSize: "0.65rem", color: "#4b5563" }}>folded</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commentary */}
          {commentary.length > 0 && (
            <div className={styles.commentaryBox} aria-live="polite" aria-label="Game commentary">
              <p style={{ fontSize: "0.72rem", color: "#6b7280", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>COMMENTARY</p>
              {commentary.map((c, i) => (
                <div key={i} className={styles.commentaryEntry}>
                  <span className={styles.commentaryTime}>{c.time}</span>
                  {c.text}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className={styles.sidePane}>
          <AgentCards table={activeTable} lastReasoning={lastReasoning} />
          <StatsTicker
            totalHandsToday={totalHandsToday}
            biggestPot={biggestPot}
            currentLeader={currentLeader}
            sideBetPool={sideBet.totalPool}
            seatOdds={sideBet.seatOdds}
          />
        </div>
      </div>

      {/* Showdown overlay */}
      {showShowdown && showdownInfo && (
        <div className={styles.showdownOverlay} onClick={() => setShowShowdown(false)}>
          <div className={styles.showdownCard}>
            <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🏆</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#8b5cf6", marginBottom: "0.25rem" }}>
              Seat {showdownInfo.winner} Wins!
            </h2>
            <p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>
              Pot: {showdownInfo.pot} RCHIP
            </p>
            <p style={{ fontSize: "0.7rem", color: "#4b5563", marginTop: "1rem" }}>Click to dismiss</p>
          </div>
        </div>
      )}
    </div>
  );
}
