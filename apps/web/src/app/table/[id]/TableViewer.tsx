"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useWebSocket } from "@/lib/useWebSocket";
import { useAuth, type HoleCardsResponse } from "@/lib/auth";
import {
  CHIP_SYMBOL,
  formatChips,
  shortenAddress,
  formatTime,
  formatTimeRemaining,
  cn,
} from "@/lib/utils";
import type { TableResponse, WsMessage } from "@/lib/types";
import { GAME_STATES, ACTION_TYPES } from "@/lib/types";

interface TableViewerProps {
  initialData: TableResponse;
  tableId: string;
}

export function TableViewer({ initialData, tableId }: TableViewerProps) {
  const [table, setTable] = useState(initialData);
  const [timeRemaining, setTimeRemaining] = useState<string>("--");
  const [holeCards, setHoleCards] = useState<HoleCardsResponse | null>(null);

  const { isAuthenticated, address, getHoleCards } = useAuth();

  // Handle WebSocket messages
  const handleMessage = useCallback((_message: WsMessage) => {
    // Refresh table data when we get updates
    // In a production app, we'd update state incrementally
    // For now, we trigger a refetch
    fetch(`${process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:3002"}/api/tables/${tableId}`)
      .then((res) => res.json())
      .then((data) => setTable(data))
      .catch(() => {});
  }, [tableId]);

  const { connected } = useWebSocket({
    tableId,
    onMessage: handleMessage,
  });

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
    (address && table.seats.find(
      (s) => s.isActive && s.ownerAddress.toLowerCase() === address.toLowerCase()
    )?.seatIndex) ?? null;

  const gameState = GAME_STATES[table.gameState] || table.gameState;
  const currentHand = table.currentHand;
  const isActive = gameState !== "Waiting for Seats" && gameState !== "Settled";

  return (
    <div>
      {/* Connection Status */}
      <div className={cn("connection-status", connected ? "connected" : "disconnected")}>
        {connected ? "Live" : "Disconnected"}
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
          {currentHand && (
            <div className="table-hand-id">
              Hand #{currentHand.handId}
            </div>
          )}
        </div>
      </div>

      {/* Table Layout */}
      <div className="table-layout">
        {/* Top Seat */}
        <div className="seats-row">
          <SeatPanel
            seat={table.seats[0]}
            isActor={currentHand?.actorSeat === 0}
            isButton={table.buttonSeat === 0}
            isOwner={ownedSeatIndex === 0}
            holeCards={ownedSeatIndex === 0 ? holeCards : null}
          />
        </div>

        {/* Community Cards */}
        <div className="community-cards">
          {currentHand && currentHand.communityCards.length > 0 ? (
            currentHand.communityCards
              .filter((c) => c !== 255)
              .map((card, i) => <PokerCard key={i} cardIndex={card} />)
          ) : (
            <span className="muted">No community cards</span>
          )}
        </div>

        {/* Pot and Timer */}
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

        {/* Bottom Seat */}
        <div className="seats-row">
          <SeatPanel
            seat={table.seats[1]}
            isActor={currentHand?.actorSeat === 1}
            isButton={table.buttonSeat === 1}
            isOwner={ownedSeatIndex === 1}
            holeCards={ownedSeatIndex === 1 ? holeCards : null}
          />
        </div>
      </div>

      {/* Action Log */}
      <div className="card section-card">
        <h3 className="section-title-sm">Action Log</h3>
        <div className="action-log">
          {currentHand && currentHand.actions.length > 0 ? (
            [...currentHand.actions].reverse().map((action, i) => (
              <div key={i} className="action-item">
                <span>
                  <strong>Seat {action.seatIndex}</strong>{" "}
                  {ACTION_TYPES[action.actionType] || action.actionType}
                  {action.amount !== "0" && ` ${formatChips(action.amount)} ${CHIP_SYMBOL}`}
                </span>
                <span className="action-time">
                  {formatTime(action.timestamp)}
                </span>
              </div>
            ))
          ) : (
            <div className="muted">No actions yet</div>
          )}
        </div>
      </div>

      {/* Seats with Agent Links */}
      <div className="card section-card">
        <h3 className="section-title-sm">Players</h3>
        <div className="players-grid">
          {table.seats.map((seat) => (
            <div key={seat.seatIndex} className="player-cell">
              <div className="player-seat-title">
                Seat {seat.seatIndex}
                {ownedSeatIndex === seat.seatIndex && (
                  <span className="you-tag">(You)</span>
                )}
              </div>
              {seat.isActive ? (
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
}: {
  seat: TableResponse["seats"][0];
  isActor: boolean;
  isButton: boolean;
  isOwner: boolean;
  holeCards: HoleCardsResponse | null;
}) {
  if (!seat.isActive) {
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
        Seat {seat.seatIndex}
        {isButton && " (D)"}
        {isOwner && " - You"}
      </div>
      <div className="seat-address">{shortenAddress(seat.ownerAddress)}</div>
      <div className="seat-stack">{formatChips(seat.stack)} {CHIP_SYMBOL}</div>
      {seat.currentBet !== "0" && (
        <div className="seat-bet">Bet: {formatChips(seat.currentBet)} {CHIP_SYMBOL}</div>
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
