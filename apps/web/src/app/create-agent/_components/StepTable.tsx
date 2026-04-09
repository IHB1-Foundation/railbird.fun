"use client";

import styles from "../page.module.css";
import type { TableInfo } from "./types";

interface Props {
  tables: TableInfo[];
  selectedTable: string;
  setSelectedTable: (addr: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepTable({ tables, selectedTable, setSelectedTable, onBack, onNext }: Props) {
  const canProceed = !!selectedTable && tables.some((t) => t.address === selectedTable && t.emptySeats > 0);

  return (
    <div className={styles.stepCard} style={{ textAlign: "left" }}>
      <h2 className={styles.stepTitle}>Select Table</h2>

      {tables.length === 0 ? (
        <p className="muted">Loading tables…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {tables.map((table) => (
            <button
              key={table.address}
              onClick={() => setSelectedTable(table.address)}
              disabled={table.emptySeats === 0}
              className={`${styles.tableOption}${selectedTable === table.address ? ` ${styles.selected}` : ""}`}
            >
              <div className={styles.tableOptionRow}>
                <div>
                  <p className={styles.tableAddress}>{table.address.slice(0, 10)}…</p>
                  <p className={styles.tableMeta}>
                    Blinds: {table.smallBlind}/{table.bigBlind} RCHIP · {table.activePlayers} seated · {table.emptySeats} open
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
        </div>
      )}

      <div className={styles.btnRow}>
        <button onClick={onBack} className={styles.secondaryBtn}>
          <span aria-hidden="true">←</span> Back
        </button>
        <button onClick={onNext} disabled={!canProceed} className={styles.primaryBtn} style={{ flex: 1 }}>
          Deploy Agent
        </button>
      </div>
    </div>
  );
}
