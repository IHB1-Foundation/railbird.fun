"use client";

import { formatChips, formatTime, shortenAddress, cn, ZERO_ADDRESS } from "@/lib/utils";
import { getAgentProfile } from "@/lib/agentProfiles";
import { ACTION_LABELS } from "@/lib/types";
import type { TableResponse } from "@/lib/types";
import styles from "./TableViewer.module.css";

const VALID_ACTION_TYPES = new Set(Object.keys(ACTION_LABELS));

function sanitizeActionType(raw: unknown): string {
  if (typeof raw === "string" && VALID_ACTION_TYPES.has(raw)) return raw;
  return "UNKNOWN";
}

function sanitizeSeatIndex(raw: unknown, maxSeats: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < maxSeats ? n : 0;
}

type TableSeat = TableResponse["seats"][number];
type TableAction = NonNullable<TableResponse["currentHand"]>["actions"][number];

interface ActionLogProps {
  streetSections: Array<{ street: string; actions: TableAction[] }>;
  seatByIndex: Map<number, TableSeat>;
  maxSeats: number;
  chipSymbol: string;
}

export function ActionLog({ streetSections, seatByIndex, maxSeats, chipSymbol }: ActionLogProps) {
  return (
    <div className={`card ${styles.sectionCard}`}>
      <h3 className="section-title-sm">Action Log</h3>
      <div className={styles.actionLog}>
        {streetSections.length > 0 ? (
          <div className={styles.streetLog}>
            {streetSections.map((section) => (
              <div key={section.street} className={styles.streetBlock}>
                <div className={styles.streetTitle}>{section.street}</div>
                {section.actions.map((action, i) => {
                  const safeActionType = sanitizeActionType(action.actionType);
                  const safeSeatIndex = sanitizeSeatIndex(action.seatIndex, maxSeats);
                  const seat = seatByIndex.get(safeSeatIndex);
                  const hasOwner = !!seat && seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS;
                  const actionProfile = seat
                    ? getAgentProfile(seat.operatorAddress) || getAgentProfile(seat.ownerAddress)
                    : null;
                  const actionLabel = ACTION_LABELS[safeActionType] ?? "Unknown";

                  return (
                    <div key={`${section.street}-${i}`} className={styles.actionItem}>
                      <div className={styles.actionMain}>
                        <span>
                          <strong>{actionProfile ? actionProfile.name : `Seat ${safeSeatIndex}`}</strong>{" "}
                          {actionLabel}
                          {action.amount !== "0" && ` ${formatChips(action.amount)} ${chipSymbol}`}
                        </span>
                        {hasOwner && !actionProfile && (
                          <span className={styles.actionActor}>
                            {shortenAddress(seat.ownerAddress)}
                          </span>
                        )}
                      </div>
                      <span className={styles.actionTime} title={`Block #${action.blockNumber}`}>
                        {formatTime(action.timestamp)}{" "}
                        <span className={styles.actionBlock}>#{action.blockNumber}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className={cn("muted")}>No actions yet</div>
        )}
      </div>
    </div>
  );
}
