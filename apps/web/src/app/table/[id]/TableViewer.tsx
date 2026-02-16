"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { useAuth, type HoleCardsResponse } from "@/lib/auth";
import { getPokerTableMaxSeats, registerSeatWithApprove } from "@/lib/pokerTableClient";
import {
  CHIP_SYMBOL,
  formatChips,
  shortenAddress,
  formatTime,
  formatTimeRemaining,
  cn,
} from "@/lib/utils";
import type { TableResponse } from "@/lib/types";
import { GAME_STATES, ACTION_TYPES } from "@/lib/types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TABLE_MAX_SEATS = Number(process.env.NEXT_PUBLIC_TABLE_MAX_SEATS || "9");
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
  const [joinSeatIndex, setJoinSeatIndex] = useState<number>(0);
  const [joinBuyIn, setJoinBuyIn] = useState<string>("1000");
  const [joinOperator, setJoinOperator] = useState<string>("");
  const [joinLoading, setJoinLoading] = useState<boolean>(false);
  const [joinStatus, setJoinStatus] = useState<string>("");
  const [pollConnected, setPollConnected] = useState<boolean>(true);

  const { isConnected, isAuthenticated, address, connect, getHoleCards } = useAuth();

  useEffect(() => {
    void (async () => {
      try {
        const onchainMaxSeats = await getPokerTableMaxSeats(table.contractAddress as Address);
        if (onchainMaxSeats > 0) {
          setMaxSeats(onchainMaxSeats);
        }
      } catch {
        // Keep env fallback value on errors.
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

  // Polling refresh (WebSocket removed)
  const refreshTable = useCallback(async () => {
    try {
      const res = await fetch(`${INDEXER_BASE}/api/tables/${tableId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setPollConnected(false);
        return;
      }
      const data = (await res.json()) as TableResponse;
      setTable(data);
      setPollConnected(true);
    } catch {
      setPollConnected(false);
    }
  }, [tableId]);

  useEffect(() => {
    void refreshTable();
    const interval = setInterval(() => {
      void refreshTable();
    }, 3000);
    return () => clearInterval(interval);
  }, [refreshTable]);

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
      } catch {
        setHoleCards(null);
      }
    };

    fetchHoleCards();
  }, [isAuthenticated, tableId, table.currentHand?.handId, getHoleCards]);

  // Determine which seat the current user owns (if any)
  const ownedSeatIndex =
    (address && normalizedSeats.find(
      (s) => s.ownerAddress.toLowerCase() !== ZERO_ADDRESS && s.ownerAddress.toLowerCase() === address.toLowerCase()
    )?.seatIndex) ?? null;

  const availableSeats = normalizedSeats.filter((seat) => seat.ownerAddress.toLowerCase() === ZERO_ADDRESS);

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
    const operator = operatorInput.length > 0 ? (operatorInput as Address) : undefined;

    try {
      setJoinLoading(true);
      const { registerTxHash } = await registerSeatWithApprove({
        tableAddress: table.contractAddress as Address,
        seatIndex: joinSeatIndex,
        buyInTokens: joinBuyIn,
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
      <div className={cn("connection-status", pollConnected ? "connected" : "disconnected")}>
        {pollConnected ? "Polling" : "Disconnected"}
      </div>

      {/* Owner Mode Banner */}
      {isAuthenticated && ownedSeatIndex !== null && (
        <div className="owner-banner">
          <span>
            <strong className="owner-banner-title">Owner Mode</strong> - You
            own Seat {ownedSeatIndex}
          </span>
          {holeCards && (
            <div className="hole-cards">
              <PokerCard cardIndex={holeCards.cards[0]} />
              <PokerCard cardIndex={holeCards.cards[1]} />
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="table-header">
        <div className="table-heading">
          <h2>Table #{tableId}</h2>
          <div className="table-heading-meta">
            Blinds: {formatChips(table.smallBlind)}/{formatChips(table.bigBlind)} {CHIP_SYMBOL}
          </div>
        </div>
        <div className="table-heading-right">
          <span className={cn("status", isActive ? "live" : "waiting")}>
            <span className={cn("dot", isActive && "pulse")} />
            {gameState}
          </span>
          <div className="table-button-seat">
            Button: Seat {table.buttonSeat}
          </div>
          {currentHand && (
            <div className="table-hand-id">
              Hand #{currentHand.handId}
            </div>
          )}
          {actorSeat !== null && actorSeatData ? (
            <div className="table-turn-indicator">
              Turn: Seat {actorSeat} ({shortenAddress(actorSeatData.ownerAddress)})
            </div>
          ) : null}
        </div>
      </div>

      <div className="card section-card">
        <div className="join-seat-header">
          <h3 className="section-title-sm">Add Player / Agent</h3>
          <div className="join-seat-badges">
            <span className="join-seat-badge">Wallet Join</span>
            <span className="join-seat-badge">Agent Operator Optional</span>
          </div>
        </div>
        <div className="join-seat-instructions">
          <span>1. Pick an empty seat</span>
          <span>2. Enter buy-in</span>
          <span>3. Set operator only when attaching an agent</span>
        </div>
        <div className="join-seat-controls">
          <label className="join-field">
            <span className="join-field-label">Seat</span>
            <select
              className="join-field-input"
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
          <label className="join-field">
            <span className="join-field-label">Buy-in ({CHIP_SYMBOL})</span>
            <input
              className="join-field-input"
              type="number"
              min="1"
              step="1"
              value={joinBuyIn}
              onChange={(e) => setJoinBuyIn(e.target.value)}
              disabled={joinLoading}
            />
          </label>
          <label className="join-field">
            <span className="join-field-label">Operator (optional)</span>
            <input
              className="join-field-input"
              type="text"
              placeholder="0x... (agent wallet)"
              value={joinOperator}
              onChange={(e) => setJoinOperator(e.target.value)}
              disabled={joinLoading}
            />
          </label>
          <button
            className="wallet-button sign join-submit-btn"
            onClick={handleJoinSeat}
            disabled={joinLoading || availableSeats.length === 0}
          >
            {joinLoading ? "Submitting..." : "Join Seat"}
          </button>
        </div>
        {joinStatus && <div className="join-status">{joinStatus}</div>}
      </div>

      {/* Table Layout */}
      <div className="table-layout">
        <div className="table-surface">
          <div className="table-center">
            <div className="community-cards">
              {currentHand && currentHand.communityCards.length > 0 ? (
                currentHand.communityCards
                  .filter((c) => c !== 255)
                  .map((card, i) => <PokerCard key={i} cardIndex={card} />)
              ) : (
                <span className="muted">No community cards</span>
              )}
            </div>

            <div className="table-pot-block">
              {currentHand && (
                <div className="pot-value">
                  Pot: {formatChips(currentHand.pot)} {CHIP_SYMBOL}
                </div>
              )}
              {table.actionDeadline && (
                <div className={cn("timer", timeRemaining === "Expired" && "urgent")}>
                  {timeRemaining}
                </div>
              )}
            </div>
          </div>

          <div className="seats-orbit">
            {occupiedSeats.map((seat) => (
              <div
                key={seat.seatIndex}
                className="seat-node"
                style={getSeatOrbitPosition(seat.seatIndex, maxSeats)}
              >
                <SeatPanel
                  seat={seat}
                  isActor={currentHand?.actorSeat === seat.seatIndex}
                  isButton={table.buttonSeat === seat.seatIndex}
                  isOwner={ownedSeatIndex === seat.seatIndex}
                  holeCards={ownedSeatIndex === seat.seatIndex ? holeCards : null}
                  turnTimeRemaining={timeRemaining}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Log */}
      <div className="card section-card">
        <h3 className="section-title-sm">Action Log</h3>
        <div className="action-log">
          {streetSections.length > 0 ? (
            <div className="street-log">
              {streetSections.map((section) => (
                <div key={section.street} className="street-block">
                  <div className="street-title">{section.street}</div>
                  {section.actions.map((action, i) => {
                    const seat = seatByIndex.get(action.seatIndex);
                    const hasOwner =
                      !!seat && seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS;

                    return (
                      <div key={`${section.street}-${i}`} className="action-item">
                        <div className="action-main">
                          <span>
                            <strong>Seat {action.seatIndex}</strong>{" "}
                            {ACTION_TYPES[action.actionType] || action.actionType}
                            {action.amount !== "0" && ` ${formatChips(action.amount)} ${CHIP_SYMBOL}`}
                          </span>
                          {hasOwner ? (
                            <span className="action-actor">
                              {shortenAddress(seat.ownerAddress)}
                            </span>
                          ) : null}
                        </div>
                        <span className="action-time">
                          {formatTime(action.timestamp)}
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

      {/* Seats with Agent Links */}
      <div className="card section-card">
        <h3 className="section-title-sm">Players</h3>
        <div className="players-grid">
          {normalizedSeats.map((seat) => (
            <div key={seat.seatIndex} className="player-cell">
              <div className="player-seat-title">
                Seat {seat.seatIndex}
                {ownedSeatIndex === seat.seatIndex && (
                  <span className="you-tag">(You)</span>
                )}
              </div>
              {seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS ? (
                <>
                  <div className="player-line">
                    Owner:{" "}
                    <span className="text-mono">
                      {shortenAddress(seat.ownerAddress)}
                    </span>
                  </div>
                  <div className="player-line">
                    Operator:{" "}
                    <span className="text-mono">
                      {shortenAddress(seat.operatorAddress)}
                    </span>
                  </div>
                  <div className="player-actions">
                    <Link
                      href={`/agent/${seat.ownerAddress}`}
                      className="inline-link"
                    >
                      View Agent
                    </Link>
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

// Seat Panel Component
function SeatPanel({
  seat,
  isActor,
  isButton,
  isOwner,
  holeCards,
  turnTimeRemaining,
}: {
  seat: TableResponse["seats"][0];
  isActor: boolean;
  isButton: boolean;
  isOwner: boolean;
  holeCards: HoleCardsResponse | null;
  turnTimeRemaining: string;
}) {
  if (seat.ownerAddress.toLowerCase() === ZERO_ADDRESS) {
    return (
      <div className="seat-panel">
        <div className="seat-label">Seat {seat.seatIndex}</div>
        <div className="muted">Empty</div>
      </div>
    );
  }

  return (
    <div className={cn("seat-panel", isActor && "active", isOwner && "owner")}>
      <div className="seat-label">
        <span>Seat {seat.seatIndex}</span>
        {isButton && <span className="dealer-chip">D</span>}
        {isOwner && <span className="you-pill">YOU</span>}
      </div>
      <div className="seat-address" title={seat.ownerAddress}>{shortenAddress(seat.ownerAddress)}</div>
      <div className="seat-stack">{formatChips(seat.stack)} {CHIP_SYMBOL}</div>
      {seat.currentBet !== "0" && (
        <div className="seat-bet">
          <span className="seat-bet-chip" />
          Bet: {formatChips(seat.currentBet)} {CHIP_SYMBOL}
        </div>
      )}
      {isActor && <div className="seat-action-badge">ACTING</div>}
      {isActor && turnTimeRemaining !== "--" && (
        <div className={cn("seat-turn-timer", turnTimeRemaining === "Expired" && "urgent")}>
          {turnTimeRemaining}
        </div>
      )}
      {/* Owner's hole cards - only shown to the seat owner */}
      {isOwner && holeCards && (
        <div className="seat-holecards">
          <div className="hole-cards-label">Your Hand</div>
          <div className="hole-cards">
            <PokerCard cardIndex={holeCards.cards[0]} />
            <PokerCard cardIndex={holeCards.cards[1]} />
          </div>
        </div>
      )}
    </div>
  );
}

// Poker Card Component
function PokerCard({ cardIndex }: { cardIndex: number }) {
  if (cardIndex === 255 || cardIndex < 0 || cardIndex > 51) {
    return <div className="poker-card unknown">??</div>;
  }

  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const suits = ["s", "h", "d", "c"];
  const suitSymbols: Record<string, string> = {
    s: "♠",
    h: "♥",
    d: "♦",
    c: "♣",
  };

  const rank = ranks[cardIndex % 13];
  const suit = suits[Math.floor(cardIndex / 13)];

  return (
    <div className={cn("poker-card", suit === "h" || suit === "d" ? "heart" : "spade")}>
      {rank}{suitSymbols[suit]}
    </div>
  );
}
