"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMon } from "@/lib/utils";
import type { HandResponse } from "@/lib/types";
import { HandReplay } from "@/app/table/[id]/HandReplay";

interface RecentHandsWithReplayProps {
  hands: HandResponse[];
  chipSymbol?: string;
}

export function RecentHandsWithReplay({ hands, chipSymbol = "RCHIP" }: RecentHandsWithReplayProps) {
  const [replayHandId, setReplayHandId] = useState<string | null>(null);

  if (hands.length === 0) {
    return <div className="chart-placeholder">No hands played yet</div>;
  }

  const replayHand = replayHandId ? hands.find((h) => h.handId === replayHandId) : null;

  return (
    <>
      <div className="table-scroll">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th scope="col">Hand</th>
              <th scope="col">Table</th>
              <th scope="col">Result</th>
              <th scope="col">Pot</th>
              <th scope="col">Cards</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {hands.map((h) => {
              const isWinner = h.winnerSeat !== null;
              const isFold = h.gameState === "SETTLED" && h.winnerSeat !== null;
              const isReplaying = replayHandId === h.handId;
              return (
                <tr key={`${h.tableId}-${h.handId}`}>
                  <td>#{h.handId}</td>
                  <td>
                    <Link href={`/table/${h.tableId}`} className="text-mono">
                      {h.tableId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className={isWinner ? "value-positive" : "value-negative"}>
                    {isWinner ? "Win" : isFold ? "Fold" : "Loss"}
                  </td>
                  <td>{formatMon(h.pot)}</td>
                  <td>
                    {h.communityCards.filter((c) => c !== 255).length > 0
                      ? `${h.communityCards.filter((c) => c !== 255).length} cards`
                      : "-"}
                  </td>
                  <td>
                    {h.actions.length > 0 && (
                      <button
                        onClick={() => setReplayHandId(isReplaying ? null : h.handId)}
                        style={{
                          fontSize: "0.68rem", padding: "0.15rem 0.5rem", cursor: "pointer",
                          borderRadius: "4px", border: "1px solid var(--border-default)",
                          background: isReplaying ? "rgba(129,108,249,0.15)" : "transparent",
                          color: isReplaying ? "var(--accent)" : "var(--muted)",
                        }}
                        aria-expanded={isReplaying}
                        aria-label={`${isReplaying ? "Hide" : "Replay"} hand #${h.handId}`}
                      >
                        {isReplaying ? "Hide" : "Replay"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {replayHand && (
        <div style={{ marginTop: "0.75rem" }}>
          <HandReplay hand={replayHand} chipSymbol={chipSymbol} />
        </div>
      )}
    </>
  );
}
