import Link from "next/link";
import { getTable, getTables } from "@/lib/api";
import { CHIP_SYMBOL, formatChips, shortenAddress } from "@/lib/utils";
import { GAME_STATES } from "@/lib/types";

export const dynamic = "force-dynamic";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_SEATS = Number(process.env.NEXT_PUBLIC_TABLE_MAX_SEATS || "9");

function getStatusClass(gameState: string): string {
  const state = GAME_STATES[gameState] || gameState;
  if (state === "Waiting for Seats" || state === "Settled") {
    return "waiting";
  }
  if (state.includes("Waiting VRF")) {
    return "waiting";
  }
  return "live";
}

function isOngoingState(gameState: string): boolean {
  const state = GAME_STATES[gameState] || gameState;
  return state !== "Waiting for Seats" && state !== "Settled";
}

function parseHandId(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function LobbyPage() {
  let tables;
  let error = null;
  let featuredTable = null;

  try {
    tables = await getTables();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load tables";
  }

  if (error) {
    return (
      <div className="empty">
        <p>Unable to load tables</p>
        <p className="error-detail">{error}</p>
      </div>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="empty">
        <p>No active tables</p>
        <p className="error-detail">
          Tables will appear here when they are created on-chain
        </p>
      </div>
    );
  }

  const featuredCandidate = [...tables]
    .sort((a, b) => {
      const aOngoing = isOngoingState(a.gameState) ? 1 : 0;
      const bOngoing = isOngoingState(b.gameState) ? 1 : 0;
      if (aOngoing !== bOngoing) return bOngoing - aOngoing;
      return parseHandId(b.currentHandId) - parseHandId(a.currentHandId);
    })[0];

  if (featuredCandidate) {
    try {
      featuredTable = await getTable(featuredCandidate.tableId);
    } catch {
      featuredTable = featuredCandidate;
    }
  }

  return (
    <section className="page-section">
      {featuredTable && (
        <article className="card featured-live-card">
          <header className="featured-live-header">
            <div>
              <p className="label">Now Playing</p>
              <h2 className="featured-live-title">
                Table #{featuredTable.tableId}
              </h2>
            </div>
            <span className={`status ${getStatusClass(featuredTable.gameState)}`}>
              <span className={`dot ${getStatusClass(featuredTable.gameState) === "live" ? "pulse" : ""}`} />
              {GAME_STATES[featuredTable.gameState] || featuredTable.gameState}
            </span>
          </header>

          <div className="featured-live-grid">
            <div>
              <p className="label">Current Hand</p>
              <p className="featured-live-value">
                #{featuredTable.currentHand?.handId || featuredTable.currentHandId || "0"}
              </p>
            </div>
            <div>
              <p className="label">Pot</p>
              <p className="featured-live-value">
                {formatChips(featuredTable.currentHand?.pot || "0")} {CHIP_SYMBOL}
              </p>
            </div>
            <div>
              <p className="label">Actor</p>
              <p className="featured-live-value">
                {featuredTable.currentHand?.actorSeat !== null && featuredTable.currentHand?.actorSeat !== undefined
                  ? `Seat ${featuredTable.currentHand.actorSeat}`
                  : "-"}
              </p>
            </div>
            <div>
              <p className="label">Blinds</p>
              <p className="featured-live-value">
                {formatChips(featuredTable.smallBlind)}/{formatChips(featuredTable.bigBlind)} {CHIP_SYMBOL}
              </p>
            </div>
          </div>

          <div className="featured-live-seats">
            {featuredTable.seats.map((seat) => (
              <div key={seat.seatIndex} className="featured-live-seat">
                <div className="seat-chip-label">Seat {seat.seatIndex}</div>
                {seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS ? (
                  <>
                    <div>{shortenAddress(seat.ownerAddress)}</div>
                    <div className="value-accent">
                      {formatChips(seat.stack)} {CHIP_SYMBOL}
                    </div>
                  </>
                ) : (
                  <div className="muted">Empty</div>
                )}
              </div>
            ))}
          </div>

          {featuredTable.currentHand?.actions?.length ? (
            <div className="featured-live-actions">
              <p className="label">Recent Actions</p>
              <div className="featured-live-action-list">
                {featuredTable.currentHand.actions.slice(-5).reverse().map((action, idx) => (
                  <div key={`${action.txHash}-${idx}`} className="featured-live-action-item">
                    <span>Seat {action.seatIndex}</span>
                    <span>{action.actionType}</span>
                    <span>
                      {action.amount !== "0" ? `${formatChips(action.amount)} ${CHIP_SYMBOL}` : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <footer className="featured-live-footer">
            <Link href={`/table/${featuredTable.tableId}`} className="btn">
              Open Live Table
            </Link>
          </footer>
        </article>
      )}

      <h2 className="section-title">Live Tables</h2>
      <div className="card-grid">
        {tables.map((table) => {
          const statusClass = getStatusClass(table.gameState);
          const stateName = GAME_STATES[table.gameState] || table.gameState;
          const activeSeats = table.seats.filter((s) => s.ownerAddress.toLowerCase() !== ZERO_ADDRESS).length;

          return (
            <Link key={table.tableId} href={`/table/${table.tableId}`} className="table-link">
              <article className="card table-card">
                <header className="table-card-header">
                  <span className="table-card-title">Table #{table.tableId}</span>
                  <span className={`status ${statusClass}`}>
                    <span className={`dot ${statusClass === "live" ? "pulse" : ""}`} />
                    {stateName}
                  </span>
                </header>

                <div className="table-meta-grid">
                  <div>
                    <span className="label">Blinds:</span>{" "}
                    {formatChips(table.smallBlind)}/{formatChips(table.bigBlind)} {CHIP_SYMBOL}
                  </div>
                  <div>
                    <span className="label">Seats:</span>{" "}
                    {activeSeats}/{MAX_SEATS}
                  </div>
                  {table.currentHand && (
                    <>
                      <div>
                        <span className="label">Hand:</span>{" "}
                        #{table.currentHand.handId}
                      </div>
                      <div>
                        <span className="label">Pot:</span>{" "}
                        <span className="value-accent">
                          {formatChips(table.currentHand.pot)} {CHIP_SYMBOL}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="seat-chips">
                  {table.seats.map((seat) => (
                    <div key={seat.seatIndex} className="seat-chip">
                      <div className="seat-chip-label">Seat {seat.seatIndex}</div>
                      {seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS ? (
                        <>
                          <div>{shortenAddress(seat.ownerAddress)}</div>
                          <div className="value-accent">{formatChips(seat.stack)} {CHIP_SYMBOL}</div>
                        </>
                      ) : (
                        <div className="muted">Empty</div>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
