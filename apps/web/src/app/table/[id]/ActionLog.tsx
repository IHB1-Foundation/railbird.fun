"use client";

import { useState, useRef, useEffect } from "react";
import { formatChips, shortenAddress, cn, ZERO_ADDRESS } from "@/lib/utils";
import { getAgentProfile } from "@/lib/agentProfiles";
import { ACTION_LABELS } from "@/lib/types";
import type { TableResponse, ReasoningFactors } from "@/lib/types";
import { DecisionBreakdown } from "@/components/DecisionBreakdown";
import type { DecisionBreakdownData } from "@/lib/types";
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
  fetchError?: string;
  onRetry?: () => void;
  tableId?: string;
  handId?: string | null;
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

// ── AI Reasoning sub-component ───────────────────────────────────────────────

const FACTOR_LABELS: Record<keyof ReasoningFactors, string> = {
  handStrength: "Hand",
  potOdds: "Odds",
  position: "Pos",
  opponentRead: "Read",
  sizing: "Size",
  riskAssessment: "Risk",
};

function ReasoningPanel({ reasoning, factors }: { reasoning: string; factors?: ReasoningFactors }) {
  return (
    <div className={styles.reasoningPanel}>
      <p className={styles.reasoningText}>{reasoning}</p>
      {factors && (
        <div className={styles.reasoningFactors}>
          {(Object.keys(FACTOR_LABELS) as Array<keyof ReasoningFactors>)
            .filter((k) => factors[k] !== undefined)
            .map((k) => (
              <span key={k} className={styles.reasoningPill} title={factors[k]}>
                <span className={styles.reasoningPillLabel}>{FACTOR_LABELS[k]}:</span> {factors[k]}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function ActionItem({
  action,
  seatByIndex,
  maxSeats,
  chipSymbol,
  streetIdx,
  actionIdx,
}: {
  action: TableAction;
  seatByIndex: Map<number, TableSeat>;
  maxSeats: number;
  chipSymbol: string;
  streetIdx: number;
  actionIdx: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [whyExpanded, setWhyExpanded] = useState(false);
  const [verifyExpanded, setVerifyExpanded] = useState(false);
  const safeActionType = sanitizeActionType(action.actionType);
  const safeSeatIndex = sanitizeSeatIndex(action.seatIndex, maxSeats);
  const seat = seatByIndex.get(safeSeatIndex);
  const hasOwner = !!seat && seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS;
  const actionProfile = seat
    ? getAgentProfile(seat.operatorAddress) || getAgentProfile(seat.ownerAddress)
    : null;
  const actionLabel = ACTION_LABELS[safeActionType] ?? "Unknown";
  const colorClass = actionColorClass(safeActionType);
  const hasReasoning = !!action.reasoning;
  const hasBreakdown = !!(action as { breakdown?: DecisionBreakdownData }).breakdown;
  const breakdown = (action as { breakdown?: DecisionBreakdownData }).breakdown;
  const isAiAction = hasReasoning;

  return (
    <div key={`${streetIdx}-${actionIdx}`} className={styles.actionItem}>
      <div className={styles.actionMain}>
        <div className={styles.actionRow}>
          <span
            aria-label={`${actionProfile ? actionProfile.name : `Seat ${safeSeatIndex}`} ${actionLabel}${action.amount !== "0" ? ` ${formatChips(action.amount)} ${chipSymbol}` : ""}`}
          >
            <strong>{actionProfile ? actionProfile.name : `Seat ${safeSeatIndex}`}</strong>{" "}
            <span className={colorClass} aria-hidden="true">
              {actionPrefix(safeActionType)}
              {actionLabel}
              {action.amount !== "0" && ` ${formatChips(action.amount)} ${chipSymbol}`}
            </span>
            {/* T-1205: Confidence badge (always visible when breakdown exists) */}
            {breakdown && <DecisionBreakdown data={breakdown} mode="compact" />}
          </span>
          <div className={styles.actionBadges}>
            {/* T-1205: Why? button */}
            {hasBreakdown && (
              <button
                className={styles.whyBtn}
                onClick={() => setWhyExpanded((v) => !v)}
                aria-expanded={whyExpanded}
                aria-label="Show decision breakdown"
                title="Why did the AI make this decision?"
              >
                Why?
              </button>
            )}
            {hasReasoning && (
              <button
                className={styles.reasoningBadge}
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-label="Toggle AI reasoning"
                title="AI reasoning"
              >
                💡
              </button>
            )}
            {isAiAction && action.verified && (
              <button
                className={styles.verifiedBadge}
                onClick={() => setVerifyExpanded((v) => !v)}
                aria-label="Decision recorded permanently on blockchain"
                title="Decision recorded permanently on blockchain"
              >
                ✓ Verified
              </button>
            )}
            {isAiAction && !action.verified && (
              <span
                className={styles.pendingBadge}
                title="AI decision commitment pending on-chain reveal"
              >
                Pending
              </span>
            )}
          </div>
        </div>
        {hasOwner && !actionProfile && (
          <span className={styles.actionActor}>{shortenAddress(seat.ownerAddress)}</span>
        )}
        {/* T-1205: Decision breakdown panel */}
        {whyExpanded && breakdown && <DecisionBreakdown data={breakdown} mode="expanded" />}
        {expanded && action.reasoning && (
          <ReasoningPanel reasoning={action.reasoning} factors={action.factors} />
        )}
        {verifyExpanded && action.verified && action.revealTxHash && (
          <div className={styles.verifyDetail}>
            <span className={styles.verifyLabel}>Reveal tx:</span>{" "}
            <span className={styles.verifyTxHash} title={action.revealTxHash}>
              {action.revealTxHash.slice(0, 10)}…{action.revealTxHash.slice(-6)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ActionLog ────────────────────────────────────────────────────────────

// D-58: Only render at most this many actions to avoid large DOM.
const ACTION_DISPLAY_LIMIT = 100;

export function ActionLog({
  streetSections,
  seatByIndex,
  maxSeats,
  chipSymbol,
  fetchError,
  onRetry,
  tableId,
  handId,
}: ActionLogProps) {
  // Show newest streets first
  const reversed = [...streetSections].reverse();
  const [showAll, setShowAll] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  // Count total actions for the display limit
  const totalActions = reversed.reduce((sum, s) => sum + s.actions.length, 0);
  const isOverLimit = totalActions > ACTION_DISPLAY_LIMIT;

  // Compute which sections to show (trim older streets from the back of reversed)
  const displayedSections = (() => {
    if (!isOverLimit || showAll) return reversed;
    let count = 0;
    const result = [];
    for (const section of reversed) {
      if (count >= ACTION_DISPLAY_LIMIT) break;
      const remaining = ACTION_DISPLAY_LIMIT - count;
      if (section.actions.length <= remaining) {
        result.push(section);
        count += section.actions.length;
      } else {
        result.push({ ...section, actions: section.actions.slice(0, remaining) });
        count += remaining;
      }
    }
    return result;
  })();

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const check = () =>
      setShowFade(
        el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight < el.scrollHeight - 4,
      );
    check();
    el.addEventListener("scroll", check);
    return () => el.removeEventListener("scroll", check);
  }, [streetSections]);

  return (
    <div className={`card ${styles.sectionCard}`}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}
      >
        <h3 className="section-title-sm" style={{ margin: 0 }}>
          Action Log
        </h3>
        {tableId && handId && (
          <a
            href={`/verify?table=${tableId}&hand=${handId}`}
            style={{ fontSize: "0.7rem", color: "var(--muted)", textDecoration: "underline" }}
            title="Verify this hand on-chain"
          >
            Verify on-chain →
          </a>
        )}
      </div>
      <div className={styles.actionLogWrapper}>
        <div ref={logRef} className={styles.actionLog}>
          {fetchError ? (
            <div
              role="alert"
              style={{
                textAlign: "center",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                Unable to load actions — network issue
              </span>
              {onRetry && (
                <button
                  className="btn btn-ghost"
                  onClick={onRetry}
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem", minHeight: 0 }}
                >
                  Retry
                </button>
              )}
            </div>
          ) : displayedSections.length > 0 ? (
            <div className={styles.streetLog}>
              {isOverLimit && !showAll && (
                <button
                  className="btn btn-ghost"
                  style={{
                    fontSize: "0.72rem",
                    padding: "0.25rem 0.75rem",
                    minHeight: 0,
                    margin: "0 auto 0.5rem",
                    display: "block",
                  }}
                  onClick={() => setShowAll(true)}
                >
                  Show all {totalActions} actions
                </button>
              )}
              {displayedSections.map((section, si) => (
                <div key={section.street} className={styles.streetBlock}>
                  <div className={styles.streetDivider}>
                    <hr className={styles.streetHr} />
                    <span className={styles.streetDividerLabel}>{section.street}</span>
                    <hr className={styles.streetHr} />
                  </div>
                  {[...section.actions].reverse().map((action, ai) => (
                    <ActionItem
                      key={`${section.street}-${ai}`}
                      action={action}
                      seatByIndex={seatByIndex}
                      maxSeats={maxSeats}
                      chipSymbol={chipSymbol}
                      streetIdx={si}
                      actionIdx={ai}
                    />
                  ))}
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
