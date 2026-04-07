"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { isAddress, type Address } from "viem";
import { useAuth, type HoleCardsResponse } from "@/lib/auth";
import { getPokerTableMaxSeats, registerSeat } from "@/lib/pokerTableClient";
import {
  CHIP_SYMBOL,
  formatChips,
  shortenAddress,
  formatTime,
  formatTimeRemaining,
  cn,
  ZERO_ADDRESS,
} from "@/lib/utils";
import type { TableResponse } from "@/lib/types";
import { GAME_STATES, ACTION_TYPES } from "@/lib/types";
import { useWebSocket } from "@/lib/useWebSocket";
import { getRevealedHolecards, type RevealedHolecardResponse } from "@/lib/api";
import { PokerCard } from "@/components/poker/PokerCard";
import { VrfStatusWidget } from "@/components/poker/VrfStatusWidget";
import { SeatPanel } from "@/components/poker/SeatPanel";
import { ShowdownResultsPanel } from "@/components/poker/ShowdownResultsPanel";
import styles from "./TableViewer.module.css";

const TABLE_MAX_SEATS = Number(process.env.NEXT_PUBLIC_TABLE_MAX_SEATS || "9");

/** Lightweight structural guard against injected WebSocket payloads. */
function isValidTableResponse(data: unknown): data is TableResponse {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.id === "string" &&
    typeof d.contractAddress === "string" &&
    Array.isArray(d.seats)
  );
}
const INDEXER_BASE = process.env.NEXT_PUBLIC_INDEXER_URL || "https://indexer.railbird.fun";
const STREET_LABELS = ["Pre-flop", "Flop", "Turn", "River", "Showdown"] as const;

function getSeatOrbitPosition(seatIndex: number, totalSeats: number): { left: string; top: string } {
  if (totalSeats <= 1) {
    return { left: "50%", top: "14%" };
  }

  const angleDeg = -90 + (360 / totalSeats) * seatIndex;
  const angleRad = (angleDeg * Math.PI) / 180;
  const radiusX = 42;
  const radiusY = 35;
  const left = 50 + Math.cos(angleRad) * radiusX;
  const top = 50 + Math.sin(angleRad) * radiusY;
  return { left: `${left}%`, top: `${top}%` };
}

interface TableViewerProps {
  initialData: TableResponse;
  tableId: string;
}
type TableAction = NonNullable<TableResponse["currentHand"]>["actions"][number];

export function TableViewer({ initialData, tableId }: TableViewerProps) {
  const [table, setTable] = useState(initialData);
  const [maxSeats, setMaxSeats] = useState<number>(TABLE_MAX_SEATS);
  const [timeRemaining, setTimeRemaining] = useState<string>("--");
  const [holeCards, setHoleCards] = useState<HoleCardsResponse | null>(null);
  const [revealedHolecards, setRevealedHolecards] = useState<RevealedHolecardResponse[]>([]);
  const [joinSeatIndex, setJoinSeatIndex] = useState<number>(0);
  const [joinBuyIn, setJoinBuyIn] = useState<string>("1000");
  const [joinOperator, setJoinOperator] = useState<string>("");
  const [joinLoading, setJoinLoading] = useState<boolean>(false);
  const [joinStatus, setJoinStatus] = useState<string>("");

  const { isConnected, isAuthenticated, address, connect, getHoleCards } = useAuth();

  useEffect(() => {
    void (async () => {
      try {
        const onchainMaxSeats = await getPokerTableMaxSeats(table.contractAddress as Address);
        if (onchainMaxSeats > 0) {
          setMaxSeats(onchainMaxSeats);
        }
      } catch (err) {
        // Keep env fallback value on errors — log for debugging.
        console.error("[TableViewer] Failed to fetch max seats from contract:", err);
      }
    })();
  }, [table.contractAddress]);

  const normalizedSeats = useMemo(() => {
    const byIndex = new Map(table.seats.map((seat) => [seat.seatIndex, seat]));
    return Array.from({ length: maxSeats }, (_, seatIndex) => {
      return byIndex.get(seatIndex) ?? {
        seatIndex,
        ownerAddress: ZERO_ADDRESS,
        operatorAddress: ZERO_ADDRESS,
        stack: "0",
        isActive: false,
        currentBet: "0",
        tokenAddress: null,
      };
    });
  }, [maxSeats, table.seats]);

  const seatByIndex = useMemo(
    () => new Map(normalizedSeats.map((seat) => [seat.seatIndex, seat])),
    [normalizedSeats]
  );
  const occupiedSeats = useMemo(
    () => normalizedSeats.filter((seat) => seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS),
    [normalizedSeats]
  );

  const refreshTable = useCallback(async () => {
    try {
      const res = await fetch(`${INDEXER_BASE}/api/tables/${tableId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as TableResponse;
      setTable(data);
    } catch (err) {
      console.error("[TableViewer] Table fetch failed:", err);
    }
  }, [tableId]);

  const handleWsMessage = useCallback(
    (msg: { type: string; tableId: string; timestamp: string; data: unknown }) => {
      if (msg.type === "poll_update" || msg.type === "table_update") {
        // Validate the shape of the incoming data before applying it to state.
        // A compromised WS server should not be able to inject arbitrary objects.
        const data = msg.data;
        if (!isValidTableResponse(data)) {
          console.warn("[TableViewer] Received malformed table data over WebSocket, ignoring");
          return;
        }
        setTable(data);
      }
    },
    []
  );

  const wsStatus = useWebSocket({ tableId, onMessage: handleWsMessage });

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(table.actionDeadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [table.actionDeadline]);

  // Fetch hole cards when authenticated and hand is active
  useEffect(() => {
    const fetchHoleCards = async () => {
      if (!isAuthenticated || !table.currentHand) {
        setHoleCards(null);
        return;
      }

      try {
        const cards = await getHoleCards(tableId, table.currentHand.handId);
        setHoleCards(cards);
      } catch (err) {
        console.error("[TableViewer] Failed to fetch hole cards:", err);
        setHoleCards(null);
      }
    };

    fetchHoleCards();
  }, [isAuthenticated, tableId, table.currentHand?.handId, getHoleCards]);

  // Fetch revealed holecards when hand is at showdown/settled
  useEffect(() => {
    const fetchRevealed = async () => {
      if (!table.currentHand) {
        setRevealedHolecards([]);
        return;
      }
      const state = table.gameState;
      if (state !== "SHOWDOWN" && state !== "SETTLED" && state !== "10" && state !== "11") {
        setRevealedHolecards([]);
        return;
      }
      try {
        const cards = await getRevealedHolecards(tableId, table.currentHand.handId);
        setRevealedHolecards(cards);
      } catch {
        setRevealedHolecards([]);
      }
    };
    fetchRevealed();
  }, [tableId, table.currentHand?.handId, table.gameState]);

  // Determine which seat the current user owns (if any)
  const ownedSeatIndex =
    (address && normalizedSeats.find(
      (s) => s.ownerAddress.toLowerCase() !== ZERO_ADDRESS && s.ownerAddress.toLowerCase() === address.toLowerCase()
    )?.seatIndex) ?? null;

  const availableSeats = useMemo(
    () => normalizedSeats.filter((seat) => seat.ownerAddress.toLowerCase() === ZERO_ADDRESS),
    [normalizedSeats]
  );

  useEffect(() => {
    if (availableSeats.length > 0) {
      setJoinSeatIndex((prev) => (
        availableSeats.some((seat) => seat.seatIndex === prev)
          ? prev
          : availableSeats[0].seatIndex
      ));
    }
  }, [availableSeats]);

  const gameState = GAME_STATES[table.gameState] || table.gameState;
  const currentHand = table.currentHand;
  const isActive = gameState !== "Waiting for Seats" && gameState !== "Settled";
  const vrfStreet: string | null =
    table.gameState === "WAITING_VRF_FLOP" || table.gameState === "4" ? "Flop"
    : table.gameState === "WAITING_VRF_TURN" || table.gameState === "6" ? "Turn"
    : table.gameState === "WAITING_VRF_RIVER" || table.gameState === "8" ? "River"
    : null;
  const actorSeat = currentHand?.actorSeat ?? null;
  const actorSeatData = actorSeat !== null ? seatByIndex.get(actorSeat) : null;
  const streetSections = useMemo(() => {
    if (!currentHand || currentHand.actions.length === 0) {
      return [] as Array<{ street: string; actions: TableAction[] }>;
    }

    const sections: Array<{ street: string; actions: TableAction[] }> = [
      { street: STREET_LABELS[0], actions: [] },
    ];
    let streetIndex = 0;

    for (const action of currentHand.actions) {
      sections[streetIndex].actions.push(action);

      if (action.endsStreet && streetIndex < STREET_LABELS.length - 1) {
        streetIndex += 1;
        if (!sections[streetIndex]) {
          sections[streetIndex] = { street: STREET_LABELS[streetIndex], actions: [] };
        }
      }
    }

    return sections.filter((section) => section.actions.length > 0);
  }, [currentHand]);

  const handleJoinSeat = useCallback(async () => {
    setJoinStatus("");
    if (availableSeats.length === 0) {
      setJoinStatus("No empty seats available.");
      return;
    }

    if (!isConnected) {
      await connect();
      setJoinStatus("Wallet connected. Click again to submit join transaction.");
      return;
    }

    const selectedSeat = normalizedSeats.find((seat) => seat.seatIndex === joinSeatIndex);
    if (!selectedSeat || selectedSeat.ownerAddress.toLowerCase() !== ZERO_ADDRESS) {
      setJoinStatus("Selected seat is no longer empty.");
      return;
    }

    const operatorInput = joinOperator.trim();

    // Validate operator address if provided
    if (operatorInput.length > 0 && !isAddress(operatorInput)) {
      setJoinStatus("Invalid address: operator must be a valid 0x Ethereum address.");
      return;
    }

    // Validate buy-in amount: positive integer, no decimals, max 1 trillion chips
    const buyInNum = Number(joinBuyIn);
    if (!joinBuyIn || isNaN(buyInNum) || buyInNum <= 0 || !Number.isInteger(buyInNum) || buyInNum > 1e12) {
      setJoinStatus("Invalid buy-in: enter a positive whole number (max 1,000,000,000,000).");
      return;
    }

    const operator = operatorInput.length > 0 ? (operatorInput as Address) : undefined;

    try {
      setJoinLoading(true);
      const { registerTxHash } = await registerSeat({
        tableAddress: table.contractAddress as Address,
        seatIndex: joinSeatIndex,
        buyInKaia: joinBuyIn,
        operator,
      });
      setJoinStatus(`Seat joined. tx=${registerTxHash}`);
      await refreshTable();
    } catch (error) {
      setJoinStatus(error instanceof Error ? error.message : "Failed to join seat");
    } finally {
      setJoinLoading(false);
    }
  }, [
    availableSeats,
    connect,
    isConnected,
    joinBuyIn,
    joinOperator,
    joinSeatIndex,
    normalizedSeats,
    refreshTable,
    table.contractAddress,
  ]);

  return (
    <div>
      {/* Connection Status */}
      <div className={cn(
        styles.connectionStatus,
        wsStatus === "connected" ? styles.connected : wsStatus === "polling" ? styles.polling : styles.disconnected
      )}>
        {wsStatus === "connected" && "Live"}
        {wsStatus === "connecting" && "Connecting…"}
        {wsStatus === "reconnecting" && "Reconnecting…"}
        {wsStatus === "polling" && "Polling (fallback)"}
      </div>

      {/* Owner Mode Banner */}
      {isAuthenticated && ownedSeatIndex !== null && (
        <div className={styles.ownerBanner}>
          <span>
            <strong className={styles.ownerBannerTitle}>Owner Mode</strong> - You
            own Seat {ownedSeatIndex}
          </span>
          {holeCards && (
            <span className={styles.ownerBannerCards}>
              Cards visible on your seat below
            </span>
          )}
        </div>
      )}

      {/* Header */}
      <div className={styles.tableHeader}>
        <div className={styles.tableHeading}>
          <h2>Table #{tableId}</h2>
          <div className={styles.tableHeadingMeta}>
            Blinds: {formatChips(table.smallBlind)}/{formatChips(table.bigBlind)} {CHIP_SYMBOL}
          </div>
          <div
            className={`${styles.tableHeadingMeta} ${styles.tableHeadingMetaMono}`}
            title={table.contractAddress}
          >
            Contract: {table.contractAddress}
          </div>
        </div>
        <div className={styles.tableHeadingRight}>
          <span className={cn("status", isActive ? "live" : "waiting")}>
            <span className={cn("dot", isActive && "pulse")} />
            {gameState}
          </span>
          <div className={styles.tableButtonSeat}>
            Button: Seat {table.buttonSeat}
          </div>
          {currentHand && (
            <div className={styles.tableHandId}>
              Hand #{currentHand.handId}
            </div>
          )}
          {actorSeat !== null && actorSeatData ? (
            <div className={styles.tableTurnIndicator}>
              NOW ACTING: Seat {actorSeat} ({shortenAddress(actorSeatData.ownerAddress)})
            </div>
          ) : null}
        </div>
      </div>

      <div className={`card ${styles.sectionCard}`}>
        <div className={styles.joinSeatHeader}>
          <h3 className="section-title-sm">Add Player / Agent</h3>
          <div className={styles.joinSeatBadges}>
            <span className={styles.joinSeatBadge}>Wallet Join</span>
            <span className={styles.joinSeatBadge}>Agent Operator Optional</span>
          </div>
        </div>
        <div className={styles.joinSeatInstructions}>
          <span>1. Pick an empty seat</span>
          <span>2. Enter buy-in</span>
          <span>3. Set operator only when attaching an agent</span>
        </div>
        <div className={styles.joinSeatControls}>
          <label className={styles.joinField}>
            <span className={styles.joinFieldLabel}>Seat</span>
            <select
              className={styles.joinFieldInput}
              value={joinSeatIndex}
              onChange={(e) => setJoinSeatIndex(Number(e.target.value))}
              disabled={joinLoading || availableSeats.length === 0}
            >
              {availableSeats.map((seat) => (
                <option key={seat.seatIndex} value={seat.seatIndex}>
                  Seat {seat.seatIndex}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.joinField}>
            <span className={styles.joinFieldLabel}>Buy-in ({CHIP_SYMBOL})</span>
            <input
              className={styles.joinFieldInput}
              type="number"
              min="1"
              step="1"
              value={joinBuyIn}
              onChange={(e) => setJoinBuyIn(e.target.value)}
              disabled={joinLoading}
            />
          </label>
          <label className={styles.joinField}>
            <span className={styles.joinFieldLabel}>Operator (optional)</span>
            <input
              className={styles.joinFieldInput}
              type="text"
              placeholder="0x... (agent wallet)"
              value={joinOperator}
              onChange={(e) => setJoinOperator(e.target.value)}
              disabled={joinLoading}
            />
          </label>
          <button
            className={`wallet-button sign ${styles.joinSubmitBtn}`}
            onClick={handleJoinSeat}
            disabled={joinLoading || availableSeats.length === 0}
          >
            {joinLoading ? "Submitting..." : "Join Seat"}
          </button>
        </div>
        {joinStatus && <div className="join-status">{joinStatus}</div>}
      </div>

      {/* Table Layout */}
      <div className={styles.tableLayout}>
        <div className={styles.tableSurface}>
          <div className={styles.tableCenter}>
            <div className={styles.communityCards}>
              {currentHand && currentHand.communityCards.length > 0 ? (
                currentHand.communityCards
                  .filter((c) => c !== 255)
                  .map((card, i) => <PokerCard key={i} cardIndex={card} />)
              ) : (
                <span className="muted">No community cards</span>
              )}
            </div>

            <div className={styles.tablePotBlock}>
              {currentHand && (
                <div className={styles.potValue}>
                  Pot: {formatChips(currentHand.pot)} {CHIP_SYMBOL}
                </div>
              )}
              {table.actionDeadline && (
                <div className={cn("timer", timeRemaining === "Expired" && "urgent")}>
                  {timeRemaining}
                </div>
              )}
              {vrfStreet && <VrfStatusWidget street={vrfStreet} />}
            </div>
          </div>

          <div className={styles.seatsOrbit}>
            {occupiedSeats.map((seat) => (
              <div
                key={seat.seatIndex}
                className={styles.seatNode}
                style={getSeatOrbitPosition(seat.seatIndex, maxSeats)}
              >
                <SeatPanel
                  seat={seat}
                  isActor={currentHand?.actorSeat === seat.seatIndex}
                  isButton={table.buttonSeat === seat.seatIndex}
                  isOwner={ownedSeatIndex === seat.seatIndex}
                  isHandActive={isActive && !!currentHand}
                  holeCards={ownedSeatIndex === seat.seatIndex ? holeCards : null}
                  turnTimeRemaining={timeRemaining}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Log */}
      <div className={`card ${styles.sectionCard}`}>
        <h3 className="section-title-sm">Action Log</h3>
        <div className={styles.actionLog}>
          {streetSections.length > 0 ? (
            <div className={styles.streetLog}>
              {streetSections.map((section) => (
                <div key={section.street} className={styles.streetBlock}>
                  <div className={styles.streetTitle}>{section.street}</div>
                  {section.actions.map((action, i) => {
                    const seat = seatByIndex.get(action.seatIndex);
                    const hasOwner =
                      !!seat && seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS;

                    return (
                      <div key={`${section.street}-${i}`} className={styles.actionItem}>
                        <div className={styles.actionMain}>
                          <span>
                            <strong>Seat {action.seatIndex}</strong>{" "}
                            {ACTION_TYPES[action.actionType] || action.actionType}
                            {action.amount !== "0" && ` ${formatChips(action.amount)} ${CHIP_SYMBOL}`}
                          </span>
                          {hasOwner ? (
                            <span className={styles.actionActor}>
                              {shortenAddress(seat.ownerAddress)}
                            </span>
                          ) : null}
                        </div>
                        <span className={styles.actionTime} title={`Block #${action.blockNumber}`}>
                          {formatTime(action.timestamp)}{" "}
                          <span className={styles.actionBlock}>#{action.blockNumber}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No actions yet</div>
          )}
        </div>
      </div>

      {/* Showdown Results */}
      {revealedHolecards.length > 0 && currentHand && (
        <ShowdownResultsPanel
          revealedHolecards={revealedHolecards}
          communityCards={currentHand.communityCards}
          winnerSeat={currentHand.winnerSeat}
          pot={currentHand.pot}
          seats={normalizedSeats}
        />
      )}

      {/* Seats with Agent Links */}
      <div className={`card ${styles.sectionCard}`}>
        <h3 className="section-title-sm">Players</h3>
        <div className={styles.playersGrid}>
          {normalizedSeats.map((seat) => (
            <div
              key={seat.seatIndex}
              className={cn(styles.playerCell, currentHand?.actorSeat === seat.seatIndex && styles.activeTurn)}
            >
              <div className={styles.playerSeatTitle}>
                Seat {seat.seatIndex}
                {ownedSeatIndex === seat.seatIndex && (
                  <span className={styles.youTag}>(You)</span>
                )}
              </div>
              {seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS ? (
                <>
                  <div className={styles.playerLine}>
                    Owner:{" "}
                    <span className="text-mono">
                      {shortenAddress(seat.ownerAddress)}
                    </span>
                  </div>
                  <div className={styles.playerLine}>
                    Operator:{" "}
                    <span className="text-mono">
                      {shortenAddress(seat.operatorAddress)}
                    </span>
                  </div>
                  <div className={styles.playerLine}>
                    This Round: {formatChips(seat.currentBet)} {CHIP_SYMBOL}
                  </div>
                  <div className={styles.playerActions}>
                    {seat.tokenAddress ? (
                      <Link
                        href={`/agent/${seat.tokenAddress}`}
                        className={styles.inlineLink}
                      >
                        View Agent
                      </Link>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="muted">Empty</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Components extracted to separate files:
// - PokerCard       → @/components/poker/PokerCard
// - VrfStatusWidget → @/components/poker/VrfStatusWidget
// - SeatPanel       → @/components/poker/SeatPanel
// - ShowdownResultsPanel + evaluateHandRank → @/components/poker/ShowdownResultsPanel
