"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { isAddress, type Address } from "viem";
import { useAuth } from "@/lib/auth";
import { registerSeat } from "@/lib/pokerTableClient";
import {
  CHIP_SYMBOL,
  formatChips,
  shortenAddress,
  explorerAddressUrl,
  cn,
  ZERO_ADDRESS,
} from "@/lib/utils";
import { getAgentProfile } from "@/lib/agentProfiles";
import type { TableResponse } from "@/lib/types";
import { GAME_STATES } from "@/lib/types";
import { GameState } from "@playerco/shared";
import { getRevealedHolecards, type RevealedHolecardResponse } from "@/lib/api";
import { PokerCard } from "@/components/poker/PokerCard";
import { VrfStatusWidget } from "@/components/poker/VrfStatusWidget";
import { TimerRing } from "@/components/poker/TimerRing";
import { SeatPanel } from "@/components/poker/SeatPanel";
import { ShowdownResultsPanel } from "@/components/poker/ShowdownResultsPanel";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useTableState } from "./useTableState";
import { useHoleCards } from "./useHoleCards";
import { ActionLog } from "./ActionLog";
import { PlayersPanel } from "./PlayersPanel";
import { MatchupPoster } from "./MatchupPoster";
import { TableCoachmarks } from "./TableCoachmarks";
import Link from "next/link";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ShareButton } from "@/components/ShareButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import styles from "./TableViewer.module.css";

const TABLE_MAX_SEATS = Number(process.env.NEXT_PUBLIC_TABLE_MAX_SEATS || "9");

const STREET_LABELS = ["Pre-flop", "Flop", "Turn", "River", "Showdown"] as const;

function getSeatOrbitPosition(
  seatIndex: number,
  totalSeats: number,
): { left: string; top: string } {
  if (totalSeats <= 1) return { left: "50%", top: "14%" };
  const angleDeg = -90 + (360 / totalSeats) * seatIndex;
  const angleRad = (angleDeg * Math.PI) / 180;
  const radiusX = 42;
  const radiusY = 35;
  return {
    left: `${50 + Math.cos(angleRad) * radiusX}%`,
    top: `${50 + Math.sin(angleRad) * radiusY}%`,
  };
}

interface TableViewerProps {
  initialData: TableResponse;
  tableId: string;
}
type TableAction = NonNullable<TableResponse["currentHand"]>["actions"][number];

export function TableViewer({ initialData, tableId }: TableViewerProps) {
  const {
    table,
    maxSeats,
    timeRemaining,
    wsStatus,
    refreshError,
    refreshRetryCount,
    refreshTable,
    commentaries,
  } = useTableState(tableId, initialData);
  // Auto-expand commentary on first visit so users discover the AI transparency feature
  const [commentaryOpen, setCommentaryOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem("railbird:commentary-seen");
  });
  const [hasNewCommentary, setHasNewCommentary] = useState(false);

  const [revealedHolecards, setRevealedHolecards] = useState<RevealedHolecardResponse[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(() => Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Track when table data changes
  useEffect(() => {
    setLastUpdatedAt(Date.now());
  }, [table]);

  // Show "New" badge on commentary panel when new messages arrive while collapsed
  const prevCommentaryLen = useRef(0);
  useEffect(() => {
    if (commentaries.length > prevCommentaryLen.current) {
      if (!commentaryOpen) setHasNewCommentary(true);
      prevCommentaryLen.current = commentaries.length;
    }
  }, [commentaries, commentaryOpen]);

  // Update "X seconds ago" counter
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdatedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdatedAt]);
  const [pollingToastShown, setPollingToastShown] = useState(false);

  // Show one-time toast when falling back to polling
  useEffect(() => {
    if (wsStatus === "polling" && !pollingToastShown) {
      setPollingToastShown(true);
    }
  }, [wsStatus, pollingToastShown]);

  const [joinSeatIndex, setJoinSeatIndex] = useState<number>(0);
  const [joinBuyIn, setJoinBuyIn] = useState<string>("1000");
  const [joinOperator, setJoinOperator] = useState<string>("");
  const [joinLoading, setJoinLoading] = useState<boolean>(false);
  const [joinStatus, setJoinStatus] = useState<string>("");
  const [showJoinConfirm, setShowJoinConfirm] = useState<boolean>(false);

  const { isConnected, isAuthenticated, address, connect, getHoleCards } = useAuth();
  const { holeCards } = useHoleCards(
    isAuthenticated,
    tableId,
    table.currentHand?.handId,
    getHoleCards,
  );

  // Stable memo key for seats — stringify once, use as dep
  const seatsJson = JSON.stringify(table.seats);
  const normalizedSeats = useMemo(() => {
    const parsed = JSON.parse(seatsJson) as typeof table.seats;
    const byIndex = new Map(parsed.map((seat) => [seat.seatIndex, seat]));
    return Array.from({ length: maxSeats }, (_, seatIndex) => {
      return (
        byIndex.get(seatIndex) ?? {
          seatIndex,
          ownerAddress: ZERO_ADDRESS,
          operatorAddress: ZERO_ADDRESS,
          stack: "0",
          isActive: false,
          currentBet: "0",
          tokenAddress: null,
        }
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSeats, seatsJson]);

  const seatByIndex = useMemo(
    () => new Map(normalizedSeats.map((seat) => [seat.seatIndex, seat])),
    [normalizedSeats],
  );
  const occupiedSeats = useMemo(
    () => normalizedSeats.filter((seat) => seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS),
    [normalizedSeats],
  );

  // Fetch revealed holecards at showdown/settled
  useEffect(() => {
    let cancelled = false;
    const fetchRevealed = async () => {
      if (!table.currentHand) {
        setRevealedHolecards([]);
        return;
      }
      const state = table.gameState;
      const isRevealState =
        state === GameState[GameState.SHOWDOWN] ||
        state === GameState[GameState.SETTLED] ||
        state === GameState[GameState.TOURNAMENT_OVER];
      if (!isRevealState) {
        setRevealedHolecards([]);
        return;
      }
      try {
        const cards = await getRevealedHolecards(tableId, table.currentHand.handId);
        if (!cancelled) setRevealedHolecards(cards);
      } catch {
        if (!cancelled) setRevealedHolecards([]);
      }
    };
    fetchRevealed();
    return () => {
      cancelled = true;
    };
  }, [tableId, table.currentHand, table.currentHand?.handId, table.gameState]);

  const ownedSeatIndex = address
    ? (normalizedSeats.find(
        (s) =>
          s.ownerAddress.toLowerCase() !== ZERO_ADDRESS &&
          s.ownerAddress.toLowerCase() === address.toLowerCase(),
      )?.seatIndex ?? null)
    : null;

  const availableSeats = useMemo(
    () => normalizedSeats.filter((seat) => seat.ownerAddress.toLowerCase() === ZERO_ADDRESS),
    [normalizedSeats],
  );

  useEffect(() => {
    if (availableSeats.length > 0) {
      setJoinSeatIndex((prev) =>
        availableSeats.some((seat) => seat.seatIndex === prev) ? prev : availableSeats[0].seatIndex,
      );
    }
  }, [availableSeats]);

  const gameState = GAME_STATES[table.gameState] ?? "Unknown State";
  const currentHand = table.currentHand;
  const isActive = gameState !== "Waiting for Players" && gameState !== "Settled";
  const vrfStreet: string | null =
    table.gameState === GameState[GameState.WAITING_VRF_FLOP]
      ? "Flop"
      : table.gameState === GameState[GameState.WAITING_VRF_TURN]
        ? "Turn"
        : table.gameState === GameState[GameState.WAITING_VRF_RIVER]
          ? "River"
          : null;
  const actorSeat = currentHand?.actorSeat ?? null;
  const actorSeatData = actorSeat !== null ? seatByIndex.get(actorSeat) : null;

  // G-11: derive SB/BB seat indices from button position + occupied seats
  const { sbSeat, bbSeat } = useMemo(() => {
    const buttonSeat = table.buttonSeat;
    const occupied = occupiedSeats.map((s) => s.seatIndex).sort((a, b) => a - b);
    if (occupied.length < 2) return { sbSeat: null, bbSeat: null };
    const btnPos = occupied.indexOf(buttonSeat);
    const sbPos = btnPos === -1 ? 0 : (btnPos + 1) % occupied.length;
    const bbPos = (sbPos + 1) % occupied.length;
    return { sbSeat: occupied[sbPos], bbSeat: occupied[bbPos] };
  }, [table.buttonSeat, occupiedSeats]);

  const actionsKey = currentHand ? JSON.stringify(currentHand.actions) : null;
  const streetSections = useMemo(() => {
    if (!currentHand || !actionsKey || currentHand.actions.length === 0) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionsKey]);

  // G-9: last action per seat (for check pulse, fold flash, etc.)
  const lastActionBySeat = useMemo<Map<number, string>>(() => {
    if (!currentHand || !actionsKey) return new Map();
    const map = new Map<number, string>();
    for (const action of currentHand.actions) {
      map.set(action.seatIndex, action.actionType);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionsKey]);

  const handleJoinValidate = useCallback(async () => {
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
    if (operatorInput.length > 0 && !isAddress(operatorInput)) {
      setJoinStatus("Invalid address: operator must be a valid 0x Ethereum address.");
      return;
    }

    const BUY_IN_MAX = 1_000_000_000_000_000n;
    if (!/^\d+$/.test(joinBuyIn.trim()) || joinBuyIn.trim() === "0") {
      setJoinStatus("Invalid buy-in: enter a positive whole number (e.g. 1000).");
      return;
    }
    let buyInBigInt: bigint;
    try {
      buyInBigInt = BigInt(joinBuyIn.trim());
    } catch {
      setJoinStatus("Invalid buy-in amount. Please enter a whole number.");
      return;
    }
    if (buyInBigInt <= 0n || buyInBigInt > BUY_IN_MAX) {
      setJoinStatus(`Invalid buy-in: must be between 1 and ${BUY_IN_MAX.toLocaleString()} chips.`);
      return;
    }

    // Validation passed — show confirm dialog (D-42)
    setShowJoinConfirm(true);
  }, [
    availableSeats,
    connect,
    isConnected,
    joinBuyIn,
    joinOperator,
    joinSeatIndex,
    normalizedSeats,
  ]);

  const handleJoinSeat = useCallback(async () => {
    setShowJoinConfirm(false);
    const operator = joinOperator.trim().length > 0 ? (joinOperator.trim() as Address) : undefined;
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
  }, [joinBuyIn, joinOperator, joinSeatIndex, refreshTable, table.contractAddress]);

  return (
    <div>
      {/* Refresh error banner — sticky below topbar */}
      {refreshError && (
        <div role="alert" className={styles.refreshErrorBanner}>
          {refreshError}
          {refreshRetryCount > 0 && ` (attempt ${refreshRetryCount})`}
        </div>
      )}

      {/* Connection Status */}
      <div
        className={cn(
          styles.connectionStatus,
          wsStatus === "connected"
            ? styles.connected
            : wsStatus === "polling"
              ? styles.polling
              : styles.disconnected,
        )}
      >
        {wsStatus === "connected" && "Live"}
        {wsStatus === "connecting" && "Connecting\u2026"}
        {wsStatus === "reconnecting" && "Reconnecting\u2026"}
        {wsStatus === "polling" && (
          <>
            Polling
            {" · "}
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontSize: "inherit",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              Reconnect
            </button>
          </>
        )}
        {wsStatus !== "polling" && (
          <span className={styles.connectionStatusUpdatedAt}>
            {" · "}
            <span style={secondsAgo > 60 ? { color: "var(--warning)" } : undefined}>
              Updated {secondsAgo}s ago
            </span>
          </span>
        )}
        {wsStatus === "polling" && (
          <span className={styles.connectionStatusUpdatedAt}>
            {" · "}
            <span style={secondsAgo > 60 ? { color: "var(--warning)" } : undefined}>
              Updated {secondsAgo}s ago
            </span>
          </span>
        )}
      </div>
      {wsStatus === "polling" && pollingToastShown && (
        <div role="alert" className={styles.pollingToast}>
          Live connection unavailable — refreshing every 3 seconds
        </div>
      )}

      {/* Owner Mode Banner */}
      {isAuthenticated && ownedSeatIndex !== null && (
        <div className={styles.ownerBanner}>
          <span>
            <strong className={styles.ownerBannerTitle}>Owner Mode</strong> - You own Seat{" "}
            {ownedSeatIndex}
          </span>
          {holeCards && (
            <span className={styles.ownerBannerCards}>Cards visible on your seat below</span>
          )}
        </div>
      )}

      {/* Breadcrumb */}
      <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: `Table #${tableId}` }]} />

      {/* G-32: Coachmarks — "Show me how" guided tour */}
      <TableCoachmarks />

      {/* G-19: Matchup poster — shows when 2+ seats occupied */}
      <MatchupPoster table={table} handId={currentHand?.handId ?? null} />

      {/* Header */}
      <div className={styles.tableHeader}>
        <div className={styles.tableHeading}>
          <h2>Table #{tableId}</h2>
          <div className={styles.tableHeadingMeta}>
            Blinds: {formatChips(table.smallBlind)}/{formatChips(table.bigBlind)} {CHIP_SYMBOL}
          </div>
          <div className={`${styles.tableHeadingMeta} ${styles.tableHeadingMetaMono}`}>
            Contract:{" "}
            <a
              href={explorerAddressUrl(table.contractAddress)}
              target="_blank"
              rel="noopener noreferrer"
              title="View this poker table's smart contract on the blockchain explorer"
              aria-label={`View smart contract ${table.contractAddress} on blockchain explorer`}
            >
              {shortenAddress(table.contractAddress)} <span aria-hidden="true">↗</span>
            </a>{" "}
            <span
              style={{ fontSize: "0.7rem", color: "var(--muted)", cursor: "help" }}
              title="This is the on-chain smart contract that runs this poker table. All game rules are enforced by code, not by Railbird."
            >
              (What&apos;s this?)
            </span>
          </div>
        </div>
        <div className={styles.tableHeadingRight}>
          <span className={cn("status", isActive ? "live" : "waiting")}>
            <span className={cn("dot", isActive && "pulse")} />
            {gameState}
          </span>
          <div className={styles.tableButtonSeat}>Button: Seat {table.buttonSeat}</div>
          {currentHand && Number(currentHand.handId) > 0 && (
            <div className={styles.tableHandId}>Hand #{currentHand.handId}</div>
          )}
          <Link
            href={`/betting?table=${tableId}`}
            className="btn btn-ghost"
            style={{ fontSize: "0.78rem", padding: "0.3rem 0.75rem", minHeight: 0 }}
          >
            🎲 Bet on This Table
          </Link>
          <ShareButton />
        </div>
      </div>

      {/* G-20: ACTION REQUIRED neon banner — shown when a seat is acting */}
      {actorSeat !== null && actorSeatData && (
        <div
          className={styles.actionRequiredBanner}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className={styles.actionRequiredDot} aria-hidden="true" />
          <span className={styles.actionRequiredText}>Action Required</span>
          <span className={styles.actionRequiredDot} aria-hidden="true" />
        </div>
      )}

      {/* Now Acting bar — outside orbital area for readability */}
      {actorSeat !== null && actorSeatData && (
        <div className={styles.nowActingBar}>
          Now Acting:{" "}
          {(() => {
            const actorProfile =
              getAgentProfile(actorSeatData.operatorAddress) ||
              getAgentProfile(actorSeatData.ownerAddress);
            return actorProfile
              ? actorProfile.name
              : `Seat ${actorSeat} (${shortenAddress(actorSeatData.ownerAddress)})`;
          })()}
          {timeRemaining !== "--" && (
            <span className={styles.nowActingTimer}> — {timeRemaining}</span>
          )}
        </div>
      )}

      {/* Join Seat Form — collapsed when hand active, hidden when full */}
      {availableSeats.length > 0 && (
        <JoinSeatForm
          isActive={isActive}
          availableSeats={availableSeats}
          joinSeatIndex={joinSeatIndex}
          setJoinSeatIndex={setJoinSeatIndex}
          joinBuyIn={joinBuyIn}
          setJoinBuyIn={setJoinBuyIn}
          joinOperator={joinOperator}
          setJoinOperator={setJoinOperator}
          joinLoading={joinLoading}
          joinStatus={joinStatus}
          chipSymbol={CHIP_SYMBOL}
          onJoin={handleJoinValidate}
          isConnected={isConnected}
          onConnect={connect}
        />
      )}

      {/* Table Layout */}
      <div className={styles.tableLayout}>
        <div className={styles.tableSurface}>
          <div className={styles.tableCenter}>
            <div className={styles.communityCards}>
              {currentHand && currentHand.communityCards.filter((c) => c !== 255).length > 0 ? (
                currentHand.communityCards
                  .filter((c) => c !== 255)
                  .map((card, i) => <PokerCard key={i} cardIndex={card} />)
              ) : isActive && currentHand ? (
                <span className="muted">Waiting for deal\u2026</span>
              ) : null}
            </div>
            <div className={styles.tablePotBlock}>
              {currentHand && (
                <div
                  className={cn(
                    styles.potValue,
                    currentHand.winnerSeat !== null &&
                      currentHand.winnerSeat !== undefined &&
                      styles.potCollect,
                  )}
                >
                  Pot: {/* G-10: AnimatedNumber counts up/down with flash */}
                  <AnimatedNumber
                    value={Number(BigInt(currentHand.pot) / 10n ** 18n)}
                    suffix={` ${CHIP_SYMBOL}`}
                    duration={800}
                  />
                </div>
              )}
              <TimerRing deadline={table.actionDeadline} />
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
                  isSB={sbSeat === seat.seatIndex}
                  isBB={bbSeat === seat.seatIndex}
                  isOwner={ownedSeatIndex === seat.seatIndex}
                  isHandActive={isActive && !!currentHand}
                  isWinner={currentHand?.winnerSeat === seat.seatIndex}
                  holeCards={ownedSeatIndex === seat.seatIndex ? holeCards : null}
                  turnTimeRemaining={timeRemaining}
                  lastAction={lastActionBySeat.get(seat.seatIndex)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Commentary Panel */}
      <div className={`card ${styles.commentaryPanel}`}>
        <div className={styles.commentaryHeader}>
          <h3 className="section-title-sm">
            🎙 AI Commentary
            {!commentaryOpen && hasNewCommentary && (
              <span
                style={{
                  marginLeft: "0.45rem",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  color: "#fff",
                  background: "var(--accent)",
                  borderRadius: "999px",
                  padding: "0.1rem 0.45rem",
                  verticalAlign: "middle",
                }}
                aria-label="New commentary available"
              >
                New
              </span>
            )}
          </h3>
          <button
            onClick={() => {
              setCommentaryOpen((v) => {
                const next = !v;
                if (next) {
                  setHasNewCommentary(false);
                  localStorage.setItem("railbird:commentary-seen", "1");
                }
                return next;
              });
            }}
            className={styles.commentaryToggleBtn}
            aria-label={commentaryOpen ? "Collapse AI commentary" : "Expand AI commentary"}
          >
            {commentaryOpen ? "▲ Collapse" : "▼ Expand"}
          </button>
        </div>
        {commentaryOpen && (
          <div className={styles.commentaryBody}>
            {commentaries.length === 0 ? (
              <p className="text-muted">Waiting for commentary...</p>
            ) : (
              [...commentaries].reverse().map((c, i) => (
                <div key={i} className={styles.commentaryItem}>
                  <span className={styles.commentaryStreet}>
                    {c.street.charAt(0).toUpperCase() + c.street.slice(1)}
                  </span>
                  <span className={styles.commentaryText}>{c.commentary}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Action Log */}
      <ActionLog
        streetSections={streetSections}
        seatByIndex={seatByIndex}
        maxSeats={TABLE_MAX_SEATS}
        chipSymbol={CHIP_SYMBOL}
        fetchError={refreshError ?? undefined}
        onRetry={refreshTable}
        tableId={tableId}
        handId={currentHand?.handId ?? null}
      />

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

      <PlayersPanel
        seats={normalizedSeats}
        ownedSeatIndex={ownedSeatIndex}
        actorSeat={currentHand?.actorSeat ?? null}
        chipSymbol={CHIP_SYMBOL}
      />

      {/* Seat join confirmation dialog (D-42) */}
      <ConfirmDialog
        open={showJoinConfirm}
        title={`Join Seat ${joinSeatIndex}?`}
        message={`You will buy in for ${joinBuyIn} ${CHIP_SYMBOL}. This transaction requires on-chain approval.`}
        confirmLabel="Join Seat"
        cancelLabel="Cancel"
        onConfirm={handleJoinSeat}
        onCancel={() => setShowJoinConfirm(false)}
      />
    </div>
  );
}

// ── Join Seat Form (collapsible) ──────────────────────────────────────────────

interface JoinSeatFormProps {
  isActive: boolean;
  availableSeats: Array<{ seatIndex: number }>;
  joinSeatIndex: number;
  setJoinSeatIndex: (v: number) => void;
  joinBuyIn: string;
  setJoinBuyIn: (v: string) => void;
  joinOperator: string;
  setJoinOperator: (v: string) => void;
  joinLoading: boolean;
  joinStatus: string;
  chipSymbol: string;
  onJoin: () => void;
  isConnected: boolean;
  onConnect: () => void;
}

function JoinSeatForm({
  isActive,
  availableSeats,
  joinSeatIndex,
  setJoinSeatIndex,
  joinBuyIn,
  setJoinBuyIn,
  joinOperator,
  setJoinOperator,
  joinLoading,
  joinStatus,
  chipSymbol,
  onJoin,
  isConnected,
  onConnect,
}: JoinSeatFormProps) {
  const [expanded, setExpanded] = useState(!isActive);
  const [buyInError, setBuyInError] = useState("");
  const [operatorError, setOperatorError] = useState("");

  useEffect(() => {
    if (!isActive) setExpanded(true);
  }, [isActive]);

  // During active hand: show a brief message instead of form
  if (isActive && !expanded) {
    return (
      <div className={`card ${styles.sectionCard}`}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <span className="text-muted" style={{ fontSize: "0.82rem" }}>
            Join available between hands
          </span>
          <button className={styles.joinToggleBtn} onClick={() => setExpanded(true)}>
            + Join Table
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${styles.sectionCard}`}>
      <div className={styles.joinSeatHeader}>
        <h3 className="section-title-sm">Add Player / Agent</h3>
        {isActive && (
          <button className={styles.joinToggleBtn} onClick={() => setExpanded(false)}>
            Collapse
          </button>
        )}
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
          <span className={styles.joinFieldLabel}>Buy-in ({chipSymbol})</span>
          <input
            className={styles.joinFieldInput}
            style={buyInError ? { borderColor: "var(--danger)" } : undefined}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 1000"
            value={joinBuyIn}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              setJoinBuyIn(v);
              if (!v || v === "0") setBuyInError("Enter a positive whole number");
              else setBuyInError("");
            }}
            disabled={joinLoading}
            aria-invalid={!!buyInError}
            aria-describedby={buyInError ? "buyin-error" : undefined}
          />
          {buyInError && (
            <span
              id="buyin-error"
              style={{ color: "var(--danger)", fontSize: "0.72rem", marginTop: "0.15rem" }}
            >
              {buyInError}
            </span>
          )}
        </label>
        <label className={styles.joinField}>
          <span className={styles.joinFieldLabel}>Operator (optional)</span>
          <input
            className={styles.joinFieldInput}
            style={operatorError ? { borderColor: "var(--danger)" } : undefined}
            type="text"
            placeholder="0x... (agent wallet)"
            value={joinOperator}
            onChange={(e) => setJoinOperator(e.target.value)}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && !isAddress(v)) setOperatorError("Invalid Ethereum address");
              else setOperatorError("");
            }}
            disabled={joinLoading}
            aria-invalid={!!operatorError}
            aria-describedby="operator-help operator-error"
          />
          <span
            id="operator-help"
            style={{
              color: "var(--muted)",
              fontSize: "0.72rem",
              marginTop: "0.15rem",
              lineHeight: 1.4,
            }}
          >
            The wallet address that will submit poker actions for this seat (usually your bot&apos;s
            address)
          </span>
          {operatorError && (
            <span
              id="operator-error"
              style={{ color: "var(--danger)", fontSize: "0.72rem", marginTop: "0.15rem" }}
            >
              {operatorError}
            </span>
          )}
        </label>
        {!isConnected && (
          <div
            style={{
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <span className="text-muted" style={{ fontSize: "0.82rem" }}>
              Connect wallet to join
            </span>
            <button
              className="wallet-button"
              onClick={onConnect}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
            >
              Connect Wallet
            </button>
          </div>
        )}
        <button
          className={`wallet-button sign ${styles.joinSubmitBtn}`}
          onClick={onJoin}
          disabled={joinLoading || availableSeats.length === 0}
        >
          {joinLoading ? "Submitting..." : "Join Seat"}
        </button>
      </div>
      {joinStatus && <div className="join-status">{joinStatus}</div>}
    </div>
  );
}
