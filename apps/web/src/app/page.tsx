import Link from "next/link";
import { getTables } from "@/lib/api";
import { formatMon, shortenAddress } from "@/lib/utils";
import { GAME_STATES } from "@/lib/types";

export const dynamic = "force-dynamic";

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
        <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>{error}</p>
      </div>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="empty">
        <p>No active tables</p>
        <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
          Tables will appear here when they are created on-chain
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: "1rem" }}>Live Tables</h2>
      <div className="card-grid">
        {tables.map((table) => {
          const statusClass = getStatusClass(table.gameState);
          const stateName = GAME_STATES[table.gameState] || table.gameState;
          const activeSeats = table.seats.filter((s) => s.isActive).length;

          return (
            <Link
              key={table.tableId}
              href={`/table/${table.tableId}`}
              style={{ textDecoration: "none" }}
            >
              <div className="card" style={{ cursor: "pointer" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.75rem",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    Table #{table.tableId}
                  </span>
                  <span className={`status ${statusClass}`}>
                    <span className={`dot ${statusClass === "live" ? "pulse" : ""}`} />
                    {stateName}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.5rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--muted)" }}>Blinds:</span>{" "}
                    {formatMon(table.smallBlind)}/{formatMon(table.bigBlind)}
                  </div>
                  <div>
                    <span style={{ color: "var(--muted)" }}>Seats:</span>{" "}
                    {activeSeats}/2
                  </div>
                  {table.currentHand && (
                    <>
                      <div>
                        <span style={{ color: "var(--muted)" }}>Hand:</span>{" "}
                        #{table.currentHand.handId}
                      </div>
                      <div>
                        <span style={{ color: "var(--muted)" }}>Pot:</span>{" "}
                        <span style={{ color: "var(--accent)" }}>
                          {formatMon(table.currentHand.pot)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div
                  style={{
                    marginTop: "0.75rem",
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  {table.seats.map((seat) => (
                    <div
                      key={seat.seatIndex}
                      style={{
                        flex: 1,
                        padding: "0.5rem",
                        background: "var(--background)",
                        borderRadius: "0.25rem",
                        fontSize: "0.75rem",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ color: "var(--muted)" }}>
                        Seat {seat.seatIndex}
                      </div>
                      {seat.isActive ? (
                        <>
                          <div>{shortenAddress(seat.ownerAddress)}</div>
                          <div style={{ color: "var(--accent)" }}>
                            {formatMon(seat.stack)}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "var(--muted)" }}>Empty</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
