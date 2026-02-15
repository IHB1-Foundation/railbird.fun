import Link from "next/link";
import { getTables } from "@/lib/api";
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

export default async function LobbyPage() {
  let tables;
  let error = null;

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

  return (
    <section className="page-section">
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
