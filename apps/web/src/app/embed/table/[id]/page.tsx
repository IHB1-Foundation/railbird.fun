import Link from "next/link";
import { notFound } from "next/navigation";
import { getTable } from "@/lib/api";
import { getGameStateLabel } from "@/lib/types";
import { formatCard, formatChips, shortenAddress, ZERO_ADDRESS } from "@/lib/utils";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const VALID_TABLE_ID = /^(0x[a-fA-F0-9]{1,40}|\d+)$/;

export default async function EmbedTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const theme = query.theme === "light" ? "light" : "dark";

  if (!VALID_TABLE_ID.test(id)) {
    notFound();
  }

  let table;
  let error: string | null = null;

  try {
    table = await getTable(id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load table";
  }

  const communityCards = table?.currentHand?.communityCards?.filter((card) => card !== 255) ?? [];

  return (
    <div className={`${styles.embedRoot} ${theme === "light" ? styles.light : ""}`}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Railbird Embed</p>
            <h1 className={styles.title}>Table #{id}</h1>
            <p className={styles.subtitle}>
              {error
                ? "Unable to load the current snapshot."
                : "Minimal live table widget for partner sites and stream overlays."}
            </p>
          </div>
          <span className={styles.status}>
            {table ? getGameStateLabel(table.gameState) : "Unavailable"}
          </span>
        </header>

        {error || !table ? (
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Status</span>
            <div className={styles.statValue}>{error || "Table not found"}</div>
          </div>
        ) : (
          <>
            <div className={styles.stats}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Hand</span>
                <div className={styles.statValue}>
                  {table.currentHand?.handId ? `#${table.currentHand.handId}` : "Waiting"}
                </div>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Pot</span>
                <div className={styles.statValue}>{formatChips(table.currentHand?.pot || "0")} RCHIP</div>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Blinds</span>
                <div className={styles.statValue}>
                  {formatChips(table.smallBlind)}/{formatChips(table.bigBlind)}
                </div>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Players</span>
                <div className={styles.statValue}>
                  {table.seats.filter((seat) => seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS).length}
                </div>
              </div>
            </div>

            <div className={styles.community}>
              {communityCards.length > 0 ? (
                communityCards.map((card, index) => (
                  <div key={`${card}-${index}`} className={styles.cardChip}>
                    {formatCard(card)}
                  </div>
                ))
              ) : (
                <span className={styles.communityEmpty}>Community cards appear once betting starts.</span>
              )}
            </div>

            <div className={styles.seats}>
              {table.seats.map((seat) => (
                <div key={seat.seatIndex} className={styles.seatCard}>
                  <span className={styles.seatIndex}>Seat {seat.seatIndex}</span>
                  <span className={styles.seatOwner}>
                    {seat.ownerAddress.toLowerCase() === ZERO_ADDRESS ? "Empty" : shortenAddress(seat.ownerAddress)}
                  </span>
                  <span className={styles.seatStack}>{formatChips(seat.stack)} RCHIP</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className={styles.actions}>
          <Link href={`/table/${id}`} className={styles.actionLink}>
            Open full table
          </Link>
          <Link href="/live" className={styles.actionLink}>
            Watch live
          </Link>
        </div>
      </div>
    </div>
  );
}
