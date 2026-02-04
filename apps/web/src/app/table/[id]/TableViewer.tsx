"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useWebSocket } from "@/lib/useWebSocket";
import { useAuth, type HoleCardsResponse } from "@/lib/auth";
import {
  formatMon,
  shortenAddress,
  formatCard,
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
  const [holeCardsError, setHoleCardsError] = useState<string | null>(null);

  const { isAuthenticated, address, getHoleCards } = useAuth();

  // Handle WebSocket messages
  const handleMessage = useCallback((message: WsMessage) => {
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
        setHoleCardsError(null);
        return;
      }

      try {
        const cards = await getHoleCards(tableId, table.currentHand.handId);
        setHoleCards(cards);
        setHoleCardsError(null);
      } catch (err) {
        setHoleCards(null);
        setHoleCardsError(
          err instanceof Error ? err.message : "Failed to fetch hole cards"
        );
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
        <div
          style={{
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid var(--accent)",
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            <strong style={{ color: "var(--accent)" }}>Owner Mode</strong> - You
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h2>Table #{tableId}</h2>
          <div style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
            Blinds: {formatMon(table.smallBlind)}/{formatMon(table.bigBlind)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className={cn("status", isActive ? "live" : "waiting")}>
            <span className={cn("dot", isActive && "pulse")} />
            {gameState}
          </span>
          {currentHand && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
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
            <span style={{ color: "var(--muted)" }}>No community cards</span>
          )}
        </div>

        {/* Pot and Timer */}
        <div style={{ textAlign: "center" }}>
          {currentHand && (
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
              Pot: {formatMon(currentHand.pot)}
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
      <div className="card" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Action Log</h3>
        <div className="action-log">
          {currentHand && currentHand.actions.length > 0 ? (
            [...currentHand.actions].reverse().map((action, i) => (
              <div key={i} className="action-item">
                <span>
                  <strong>Seat {action.seatIndex}</strong>{" "}
                  {ACTION_TYPES[action.actionType] || action.actionType}
                  {action.amount !== "0" && ` ${formatMon(action.amount)}`}
                </span>
                <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                  {formatTime(action.timestamp)}
                </span>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--muted)", padding: "0.5rem" }}>
              No actions yet
            </div>
          )}
        </div>
      </div>

      {/* Seats with Agent Links */}
      <div className="card" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Players</h3>
        <div style={{ display: "flex", gap: "1rem" }}>
          {table.seats.map((seat) => (
            <div key={seat.seatIndex} style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
                Seat {seat.seatIndex}
                {ownedSeatIndex === seat.seatIndex && (
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.75rem",
                      color: "var(--accent)",
                    }}
                  >
                    (You)
                  </span>
                )}
              </div>
              {seat.isActive ? (
                <>
                  <div style={{ fontSize: "0.875rem" }}>
                    Owner:{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {shortenAddress(seat.ownerAddress)}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.875rem" }}>
                    Operator:{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {shortenAddress(seat.operatorAddress)}
                    </span>
                  </div>
                  <div style={{ marginTop: "0.5rem" }}>
                    <Link
                      href={`/agent/${seat.ownerAddress}`}
                      style={{ fontSize: "0.875rem" }}
                    >
                      View Agent
                    </Link>
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--muted)" }}>Empty</div>
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
        <div style={{ color: "var(--muted)" }}>Empty</div>
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
      <div className="seat-stack">{formatMon(seat.stack)}</div>
      {seat.currentBet !== "0" && (
        <div className="seat-bet">Bet: {formatMon(seat.currentBet)}</div>
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
