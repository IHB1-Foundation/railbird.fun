"use client";

import styles from "../page.module.css";
import type { TableInfo } from "./types";

interface Props {
  tables: TableInfo[];
  isLoading: boolean;
  error: string | null;
  selectedTable: string;
  setSelectedTable: (addr: string) => void;
  onRetry: () => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepTable({
  tables,
  isLoading,
  error,
  selectedTable,
  setSelectedTable,
  onRetry,
  onBack,
  onNext,
}: Props) {
  const canProceed =
    !!selectedTable && tables.some((t) => t.address === selectedTable && t.emptySeats > 0);
  const hasOpenTable = tables.some((table) => table.emptySeats > 0);

  return (
    <div className={styles.stepCard} style={{ textAlign: "left" }}>
      <h2 className={styles.stepTitle}>Select Table</h2>

      {isLoading ? (
        <p className="muted">Loading tables…</p>
      ) : error ? (
        <div className={styles.errorAlert} role="alert" style={{ marginBottom: "1rem" }}>
          <p style={{ margin: 0 }}>{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className={styles.secondaryBtn}
            style={{ marginTop: "0.75rem" }}
          >
            Retry
          </button>
        </div>
      ) : tables.length === 0 ? (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontWeight: 600, marginBottom: "0.35rem" }}>No tables available right now</p>
          <p className="muted" style={{ margin: 0 }}>
            Wait for a new table to open, or return to the lobby and watch live games until seats
            free up.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            marginBottom: "1.5rem",
          }}
        >
          {tables.map((table) => (
            <button
              type="button"
              key={table.address}
              onClick={() => setSelectedTable(table.address)}
              disabled={table.emptySeats === 0}
              className={`${styles.tableOption}${selectedTable === table.address ? ` ${styles.selected}` : ""}`}
            >
              <div className={styles.tableOptionRow}>
                <div>
                  <p className={styles.tableAddress}>{table.address.slice(0, 10)}…</p>
                  <p className={styles.tableMeta}>
                    Blinds: {table.smallBlind}/{table.bigBlind} RCHIP · {table.activePlayers} seated
                    · {table.emptySeats} open
                  </p>
                </div>
                {table.emptySeats > 0 ? (
                  <span className={`${styles.badge} ${styles.open}`}>Open</span>
                ) : (
                  <span className={`${styles.badge} ${styles.full}`}>Full</span>
                )}
              </div>
            </button>
          ))}
          {!hasOpenTable && (
            <p className="muted" style={{ margin: 0 }}>
              Every visible table is currently full. Retry in a moment or pick a different time to
              deploy.
            </p>
          )}
        </div>
      )}

      <div className={styles.btnRow}>
        <button type="button" onClick={onBack} className={styles.secondaryBtn}>
          <span aria-hidden="true">←</span> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className={styles.primaryBtn}
          style={{ flex: 1 }}
        >
          Review Deployment
        </button>
      </div>
    </div>
  );
}
