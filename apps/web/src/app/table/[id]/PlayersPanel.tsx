"use client";

import Link from "next/link";
import { formatChips, shortenAddress, cn, ZERO_ADDRESS } from "@/lib/utils";
import { getAgentProfile, getPersonaSummary } from "@/lib/agentProfiles";
import type { TableResponse } from "@/lib/types";
import styles from "./TableViewer.module.css";

type TableSeat = TableResponse["seats"][number];

interface PlayersPanelProps {
  seats: TableSeat[];
  ownedSeatIndex: number | null;
  actorSeat: number | null;
  chipSymbol: string;
}

export function PlayersPanel({ seats, ownedSeatIndex, actorSeat, chipSymbol }: PlayersPanelProps) {
  return (
    <div className={`card ${styles.sectionCard}`}>
      <h3 className="section-title-sm">Players</h3>
      <div className={styles.playersGrid}>
        {seats.map((seat) => (
          <div
            key={seat.seatIndex}
            className={cn(styles.playerCell, actorSeat === seat.seatIndex && styles.activeTurn)}
          >
            <div className={styles.playerSeatTitle}>
              Seat {seat.seatIndex}
              {ownedSeatIndex === seat.seatIndex && (
                <span className={styles.youTag}>(You)</span>
              )}
            </div>
            {seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS ? (
              <>
                {(() => {
                  const profile = getAgentProfile(seat.operatorAddress) || getAgentProfile(seat.ownerAddress);
                  const persona = getPersonaSummary(profile?.personaId);
                  return (
                    <>
                      {profile && (
                        <div className={styles.playerAgentName}>
                          {persona && <span title={persona.description}>{persona.emoji}</span>}{" "}
                          <strong>{profile.name}</strong>
                          {persona && (
                            <span
                              className={styles.personaBadge}
                              style={{ borderColor: persona.colorAccent, color: persona.colorAccent }}
                            >
                              {persona.name}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className={styles.playerLine}>
                  Owner: <span className="text-mono">{shortenAddress(seat.ownerAddress)}</span>
                </div>
                <div className={styles.playerLine}>
                  Operator: <span className="text-mono">{shortenAddress(seat.operatorAddress)}</span>
                </div>
                <div className={styles.playerLine}>
                  This Round: {formatChips(seat.currentBet)} {chipSymbol}
                </div>
                <div className={styles.playerActions}>
                  {seat.tokenAddress ? (
                    <Link href={`/agent/${seat.tokenAddress}`} className={styles.inlineLink}>
                      View Agent
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="muted">Empty</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
