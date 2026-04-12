import Link from "next/link";
import { CHIP_SYMBOL, formatChips, shortenAddress, ZERO_ADDRESS } from "@/lib/utils";
import { GAME_STATES } from "@/lib/types";
import type { TableResponse } from "@/lib/types";
import styles from "../page.module.css";

const MAX_SEATS = Number(process.env.NEXT_PUBLIC_TABLE_MAX_SEATS || "9");

function getStatusClass(gameState: string): string {
  const state = GAME_STATES[gameState] ?? gameState;
  if (state === "Waiting for Players" || state === "Settled" || state.includes("Dealing"))
    return "waiting";
  return "live";
}

interface LiveTablesGridProps {
  tables: TableResponse[];
  /** Table ID to exclude from the grid (e.g. the featured table already shown above) */
  excludeTableId?: string;
}

export function LiveTablesGrid({ tables, excludeTableId }: LiveTablesGridProps) {
  const displayTables = excludeTableId
    ? tables.filter((t) => String(t.tableId) !== String(excludeTableId))
    : tables;
  if (displayTables.length === 0) return null;

  return (
    <>
      <h2 className="section-title">Live Tables</h2>
      <div className="card-grid">
        {displayTables.map((table) => {
          const statusClass = getStatusClass(table.gameState);
          const stateName = GAME_STATES[table.gameState] ?? "Unknown State";
          const activeSeats = table.seats.filter(
            (s) => s.ownerAddress.toLowerCase() !== ZERO_ADDRESS,
          ).length;

          return (
            <Link key={table.tableId} href={`/table/${table.tableId}`} className={styles.tableLink}>
              <article className={`card ${styles.tableCard}`}>
                <header className={styles.tableCardHeader}>
                  <span className={styles.tableCardTitle}>Table #{table.tableId}</span>
                  <span className={`status ${statusClass}`}>
                    <span className={`dot ${statusClass === "live" ? "pulse" : ""}`} />
                    {stateName}
                  </span>
                </header>

                <div className={styles.tableMetaGrid}>
                  <div>
                    <span className="label">Blinds:</span> {formatChips(table.smallBlind)}/
                    {formatChips(table.bigBlind)} {CHIP_SYMBOL}
                  </div>
                  <div>
                    <span className="label">Seats:</span> {activeSeats}/{MAX_SEATS}
                  </div>
                  <div>
                    <span className="label">Button:</span> Seat {table.buttonSeat}
                  </div>
                  <div className={styles.tableMetaFull}>
                    <span className="label">Contract:</span>{" "}
                    <span
                      className={`text-mono ${styles.tableContractValue}`}
                      title={table.contractAddress}
                    >
                      {shortenAddress(table.contractAddress)}
                    </span>
                  </div>
                  {table.currentHand && (
                    <>
                      <div>
                        <span className="label">Hand:</span> #{table.currentHand.handId}
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

                <div className={styles.seatChips}>
                  {table.seats.map((seat) => (
                    <div key={seat.seatIndex} className={styles.seatChip}>
                      <div className={styles.seatChipLabel}>Seat {seat.seatIndex}</div>
                      {seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS ? (
                        <>
                          <div className={`${styles.seatAddr} text-mono`} title={seat.ownerAddress}>
                            {shortenAddress(seat.ownerAddress)}
                          </div>
                          <div className={`value-accent ${styles.seatStackLine}`}>
                            {formatChips(seat.stack)} {CHIP_SYMBOL}
                          </div>
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
    </>
  );
}
