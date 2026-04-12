"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import Link from "next/link";
import { INDEXER_BASE, getTable, getTables } from "@/lib/api";
import { formatChips } from "@/lib/utils";
import type { TableResponse, HandResponse } from "@/lib/types";
import { AgentCards } from "./AgentCards";
import { StatsTicker } from "./StatsTicker";
import styles from "./live.module.css";

const POLL_INTERVAL = 3_000;
const CARD_SYMBOLS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUIT_SYMBOLS = ["♣", "♦", "♥", "♠"];
const SUIT_COLORS = ["#6b7280", "#ef4444", "#ef4444", "#3b82f6"];

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
      <span className={styles.cardChipSuit} style={{ color }}>
        {suit}
      </span>
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

function getOccupiedSeatCount(table: TableResponse): number {
  return table.seats.filter(
    (seat) => seat.ownerAddress !== "0x0000000000000000000000000000000000000000",
  ).length;
}

interface LiveDashboardProps {
  mode?: "spotlight" | "grid";
  streamMode?: boolean;
}

export function LiveDashboard({ mode = "spotlight", streamMode = false }: LiveDashboardProps) {
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
  const [showAllTables, setShowAllTables] = useState(false);
  const TABLE_PAGE_SIZE = 5;
  const showdownTitleId = useId();
  const showdownCloseRef = useRef<HTMLButtonElement>(null);
  const [showdownInfo, setShowdownInfo] = useState<{ winner: number; pot: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevHandIdRef = useRef<string | null>(null);
  const lastCommentaryKeyRef = useRef<string | null>(null);

  const isAllIn =
    hand?.actions?.some(
      (a) =>
        a.actionType === "ALL_IN" ||
        (a.actionType === "RAISE" && a.amount && BigInt(a.amount) > 500n),
    ) ?? false;
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
      if (
        table.gameState === "SETTLED" &&
        currentHand &&
        currentHand.winnerSeat !== null &&
        prevHandIdRef.current !== currentHand.handId
      ) {
        setShowdownInfo({
          winner: currentHand.winnerSeat,
          pot: currentHand.settlementAmount ?? currentHand.pot,
        });
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
      const res = await fetch(
        `${INDEXER_BASE}/api/sidebets/${activeTable.contractAddress}/${hand.handId}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        totalPool?: string;
        seatTotals?: Record<string, string>;
      };
      const totalPool = BigInt(data.totalPool ?? 0);
      const seatTotals = data.seatTotals ?? {};
      const seatOdds = Object.entries(seatTotals).map(([seat, amount]) => {
        const pct =
          totalPool > 0n ? Math.round((Number(BigInt(amount)) / Number(totalPool)) * 100) : 0;
        return { seat: parseInt(seat, 10), odds: `${pct}%` };
      });
      setSideBet({ totalPool, seatOdds });
    } catch {
      /* ignore */
    }
  }, [activeTable?.contractAddress, hand?.handId]);

  // Add commentary entry
  const addCommentary = useCallback((text: string) => {
    const time = new Date().toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
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
    else if (actionType === "CALL")
      text = `Seat ${seatIndex} calls ${amount}. Pot: ${potAfter} RCHIP`;
    else if (actionType === "RAISE")
      text = `Seat ${seatIndex} raises to ${amount}! Pot: ${potAfter} RCHIP`;
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
  const showSidebar = !streamMode;
  const showGridMode = mode === "grid";

  return (
    <div ref={rootRef} className={styles.liveRoot}>
      {/* Header */}
      <div className={styles.liveHeader}>
        <div className={styles.liveBadge}>
          <div className={styles.liveDot} aria-hidden="true" />
          LIVE
        </div>
        <span className={styles.headerTitle}>AI Poker Arena</span>
        {showGridMode && <span className={styles.modeBadge}>Grid View</span>}
        {streamMode && <span className={styles.modeBadgeSubtle}>Stream Mode</span>}
        {hand && (
          <span className={styles.headerHand}>
            Hand #{hand.handId} · {gameStateLabel}
          </span>
        )}
        {isBigPot && <span className={styles.bigPotBadge}>BIG POT</span>}
        {/* Mode switcher with descriptions (UX-7.1/7.2) */}
        {!streamMode && (
          <div className={styles.modeSwitcher}>
            <Link
              href="/live"
              className={`${styles.modeSwitcherBtn} ${!showGridMode ? styles.modeSwitcherActive : ""}`}
              title="Follow one match in detail"
            >
              Spotlight
            </Link>
            <Link
              href="/live?mode=grid"
              className={`${styles.modeSwitcherBtn} ${showGridMode ? styles.modeSwitcherActive : ""}`}
              title="Monitor all tables at once"
            >
              Grid
            </Link>
            <Link
              href="/live?stream=1"
              className={styles.modeSwitcherBtn}
              title="Broadcast Mode — reduced chrome for OBS"
            >
              Broadcast
            </Link>
          </div>
        )}
        {/* D-R10.1: mini nav so users can jump to other sections without going back first */}
        <Link href="/" className={styles.headerBack}>
          Home
        </Link>
        <Link href="/leaderboard" className={styles.headerBack}>
          Leaderboard
        </Link>
        <button className={styles.fullscreenBtn} onClick={toggleFullscreen}>
          {isFullscreen ? "⛶ Exit" : "⛶ Fullscreen"}
        </button>
      </div>

      {/* Body */}
      <div className={`${styles.liveBody} ${!showSidebar ? styles.liveBodySolo : ""}`}>
        {/* Main pane */}
        <div className={styles.mainPane}>
          {(showGridMode || streamMode) && (
            <div className={styles.modeBanner}>
              <strong>{showGridMode ? "Multi-table monitor" : "Caster overlay"}</strong>
              <span>
                {showGridMode
                  ? "Watch every active table at once and jump into the most interesting hand."
                  : "Reduced chrome for OBS and live broadcasts. Open the full table for detailed analysis."}
              </span>
            </div>
          )}

          {/* Table selector with "Show more" pagination */}
          {tables.length > 1 && (
            <div className={styles.tableSelector}>
              {(showAllTables ? tables : tables.slice(0, TABLE_PAGE_SIZE)).map((t) => (
                <button
                  key={t.tableId}
                  onClick={() => setActiveTableId(t.tableId)}
                  className={
                    activeTableId === t.tableId
                      ? `${styles.tableSelectorBtn} ${styles.tableSelectorBtnActive}`
                      : styles.tableSelectorBtn
                  }
                >
                  Table #{t.tableId} (Hand #{t.currentHandId})
                </button>
              ))}
              {tables.length > TABLE_PAGE_SIZE && (
                <button
                  className={styles.tableSelectorBtn}
                  onClick={() => setShowAllTables((v) => !v)}
                  aria-expanded={showAllTables}
                >
                  {showAllTables ? "Show less" : `+${tables.length - TABLE_PAGE_SIZE} more`}
                </button>
              )}
            </div>
          )}

          {showGridMode ? (
            tables.length === 0 ? (
              <div className={styles.waitingState}>
                <div aria-hidden="true" style={{ fontSize: "3rem" }}>
                  ♠
                </div>
                <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>Waiting for tables…</p>
                <p>The grid fills in automatically as the indexer publishes live tables.</p>
              </div>
            ) : (
              <div className={styles.tableGrid}>
                {tables.map((table) => {
                  const gridCards =
                    table.currentHand?.communityCards?.filter((card) => card !== 255) ?? [];
                  return (
                    <article key={table.tableId} className={styles.tableGridCard}>
                      <div className={styles.tableGridHeader}>
                        <div>
                          <p className={styles.tableGridEyebrow}>Table #{table.tableId}</p>
                          <h3 className={styles.tableGridTitle}>
                            {table.currentHand
                              ? `Hand #${table.currentHand.handId}`
                              : "Waiting for next hand"}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTableId(table.tableId)}
                          className={
                            activeTableId === table.tableId
                              ? `${styles.tableSelectorBtn} ${styles.tableSelectorBtnActive}`
                              : styles.tableSelectorBtn
                          }
                        >
                          Focus
                        </button>
                      </div>
                      <div className={styles.tableGridMeta}>
                        <span>{table.gameState.replace(/_/g, " ")}</span>
                        <span>{getOccupiedSeatCount(table)} seats occupied</span>
                      </div>
                      <div className={styles.tableGridPot}>
                        Pot {formatChips(table.currentHand?.pot ?? "0")} RCHIP
                      </div>
                      <div className={styles.tableGridCommunity}>
                        {gridCards.length > 0 ? (
                          gridCards.map((card, index) => (
                            <CardChip key={`${table.tableId}-${index}`} card={card} />
                          ))
                        ) : (
                          <span className={styles.communityEmpty}>
                            Cards reveal after the next hand begins
                          </span>
                        )}
                      </div>
                      <div className={styles.tableGridFooter}>
                        <Link href={`/table/${table.tableId}`} className={styles.headerBack}>
                          Open table
                        </Link>
                        <Link
                          href={`/embed/table/${table.tableId}?theme=dark`}
                          className={styles.headerBack}
                        >
                          Embed
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : !activeTable ? (
            <div className={styles.waitingState}>
              <div aria-hidden="true" style={{ fontSize: "3rem" }}>
                ♠
              </div>
              <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>Waiting for next hand…</p>
              <p>AI agents are being deployed.</p>
            </div>
          ) : (
            <div className={`${isAllIn ? styles.allInGlow : ""} ${styles.mainBoard}`}>
              {/* Community cards */}
              <div className={styles.communitySection}>
                <div className={styles.communitySectionHeader}>
                  <span className={styles.communityLabel}>Community Cards</span>
                  <span className={styles.communityState}>{gameStateLabel}</span>
                </div>
                {communityCards.length === 0 ? (
                  <p className={styles.communityEmpty}>Cards dealt after preflop betting</p>
                ) : (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {communityCards.map((c, i) => (
                      <CardChip key={i} card={c} />
                    ))}
                  </div>
                )}
              </div>

              {/* Pot */}
              <div className={styles.potRow}>
                <div className={styles.potStat}>
                  <div className={styles.potLabel}>POT</div>
                  <div className={styles.potValue}>{formatChips(hand?.pot ?? "0")} RCHIP</div>
                </div>
                <div className={styles.potStat}>
                  <div className={styles.potLabel}>CURRENT BET</div>
                  <div className={styles.potValueBet}>{hand?.currentBet ?? "0"} RCHIP</div>
                </div>
                {isAllIn && (
                  <div style={{ alignSelf: "center" }}>
                    <span className={styles.allInBadge}>ALL-IN!</span>
                  </div>
                )}
              </div>

              {/* G-17: Win Probability HP bar — stack-based estimate */}
              {(() => {
                const occupied = (activeTable.seats ?? []).filter(
                  (s) => s.ownerAddress !== "0x0000000000000000000000000000000000000000",
                );
                if (occupied.length < 2) return null;
                const [s0, s1] = occupied.slice(0, 2);
                const v0 = BigInt(s0.stack ?? "0");
                const v1 = BigInt(s1.stack ?? "0");
                const total = v0 + v1;
                const pct0 = total > 0n ? Math.round(Number((v0 * 100n) / total)) : 50;
                return (
                  <div
                    className={styles.winProbBar}
                    aria-label="Win probability estimate based on stack sizes"
                  >
                    <div className={styles.winProbLabel}>
                      <span className={styles.winProbLabelLeft}>
                        Seat {s0.seatIndex} {pct0}%
                      </span>
                      <span
                        style={{
                          fontSize: "var(--text-2xs)",
                          color: "var(--text-muted)",
                          textTransform: "none",
                          letterSpacing: "normal",
                        }}
                      >
                        WIN PROB
                      </span>
                      <span className={styles.winProbLabelRight}>
                        {100 - pct0}% Seat {s1.seatIndex}
                      </span>
                    </div>
                    <div className={styles.winProbTrack}>
                      <div className={styles.winProbLeft} style={{ width: `${pct0}%` }} />
                      <div className={styles.winProbRight} />
                    </div>
                  </div>
                );
              })()}

              {/* Seat panels (minimal) */}
              <div className={styles.seatGrid}>
                {(activeTable.seats ?? []).map((seat) => (
                  <div
                    key={seat.seatIndex}
                    className={`${styles.seatCard} ${seat.isActive ? styles.seatCardActive : styles.seatCardFolded}`}
                  >
                    <div className={styles.seatLabel}>Seat {seat.seatIndex}</div>
                    <div className={styles.seatName}>{seat.stack} RCHIP</div>
                    {!seat.isActive && <div className={styles.seatFoldedText}>folded</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commentary */}
          {commentary.length > 0 && (
            <div className={styles.commentaryBox} aria-live="polite" aria-label="Game commentary">
              <p className={styles.commentaryLabel}>COMMENTARY</p>
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
        {showSidebar && (
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
        )}
      </div>

      {/* Showdown overlay — accessible dialog (D-23, D-62) */}
      {showShowdown && showdownInfo && (
        <div
          className={styles.showdownOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby={showdownTitleId}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowShowdown(false);
            if (e.key === "Tab") {
              // Single focusable element — keep focus within dialog
              e.preventDefault();
              showdownCloseRef.current?.focus();
            }
          }}
        >
          {/* Backdrop */}
          <div
            style={{ position: "absolute", inset: 0 }}
            onClick={() => setShowShowdown(false)}
            aria-hidden="true"
          />
          <div className={styles.showdownCard}>
            <div className={styles.showdownIcon} aria-hidden="true">
              🏆
            </div>
            <h2 id={showdownTitleId} className={styles.showdownTitle}>
              Seat {showdownInfo.winner} Wins!
            </h2>
            <p className={styles.showdownPot}>Pot: {showdownInfo.pot} RCHIP</p>
            <button
              ref={showdownCloseRef}
              onClick={() => setShowShowdown(false)}
              className={styles.showdownDismiss}
              autoFocus
              aria-label="Dismiss showdown result"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
