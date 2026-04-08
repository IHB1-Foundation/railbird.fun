"use client";

import { useState, useRef, useEffect } from "react";
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

const AGGRESSIVE_ACTIONS = new Set(["BET", "RAISE", "3"]);
const FOLD_ACTIONS = new Set(["FOLD", "0"]);
const ALLIN_ACTIONS = new Set(["ALL_IN"]);
const CALL_CHECK_ACTIONS = new Set(["CALL", "CHECK", "1", "2"]);

function actionColorClass(actionType: string): string {
  if (FOLD_ACTIONS.has(actionType)) return "text-muted";
  if (ALLIN_ACTIONS.has(actionType)) return "value-warning";
  if (AGGRESSIVE_ACTIONS.has(actionType)) return "value-positive";
  return "";
}

function actionPrefix(actionType: string): string {
  if (FOLD_ACTIONS.has(actionType)) return "⤵ ";
  if (ALLIN_ACTIONS.has(actionType)) return "⚡ ";
  if (AGGRESSIVE_ACTIONS.has(actionType)) return "↑ ";
  if (CALL_CHECK_ACTIONS.has(actionType)) return "→ ";
  return "";
}

export function ActionLog({ streetSections, seatByIndex, maxSeats, chipSymbol }: ActionLogProps) {
  // Show newest streets first
  const reversed = [...streetSections].reverse();
  const logRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const check = () => setShowFade(el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    check();
    el.addEventListener("scroll", check);
    return () => el.removeEventListener("scroll", check);
  }, [streetSections]);

  return (
    <div className={`card ${styles.sectionCard}`}>
      <h3 className="section-title-sm">Action Log</h3>
      <div className={styles.actionLogWrapper}>
      <div ref={logRef} className={styles.actionLog}>
        {reversed.length > 0 ? (
          <div className={styles.streetLog}>
            {reversed.map((section) => (
              <div key={section.street} className={styles.streetBlock}>
                <div className={styles.streetDivider}>
                  <hr className={styles.streetHr} />
                  <span className={styles.streetDividerLabel}>{section.street}</span>
                  <hr className={styles.streetHr} />
                </div>
                {[...section.actions].reverse().map((action, i) => {
                  const safeActionType = sanitizeActionType(action.actionType);
                  const safeSeatIndex = sanitizeSeatIndex(action.seatIndex, maxSeats);
                  const seat = seatByIndex.get(safeSeatIndex);
                  const hasOwner = !!seat && seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS;
                  const actionProfile = seat
                    ? getAgentProfile(seat.operatorAddress) || getAgentProfile(seat.ownerAddress)
                    : null;
                  const actionLabel = ACTION_LABELS[safeActionType] ?? "Unknown";
                  const colorClass = actionColorClass(safeActionType);

                  return (
                    <div key={`${section.street}-${i}`} className={styles.actionItem}>
                      <div className={styles.actionMain}>
                        <span aria-label={`${actionProfile ? actionProfile.name : `Seat ${safeSeatIndex}`} ${actionLabel}${action.amount !== "0" ? ` ${formatChips(action.amount)} ${chipSymbol}` : ""}`}>
                          <strong>{actionProfile ? actionProfile.name : `Seat ${safeSeatIndex}`}</strong>{" "}
                          <span className={colorClass} aria-hidden="true">
                            {actionPrefix(safeActionType)}{actionLabel}
                            {action.amount !== "0" && ` ${formatChips(action.amount)} ${chipSymbol}`}
                          </span>
                        </span>
                        {hasOwner && !actionProfile && (
                          <span className={styles.actionActor}>
                            {shortenAddress(seat.ownerAddress)}
                          </span>
                        )}
                      </div>
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
      {showFade && <div className={styles.actionLogFade} aria-hidden="true" />}
      </div>
    </div>
  );
}
