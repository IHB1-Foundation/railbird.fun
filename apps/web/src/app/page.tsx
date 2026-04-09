import Link from "next/link";
import { getTable, getTables } from "@/lib/api";
import { getAgentProfile } from "@/lib/agentProfiles";
import { CHIP_SYMBOL, formatChips, shortenAddress, ZERO_ADDRESS } from "@/lib/utils";
import { GAME_STATES } from "@/lib/types";
import styles from "./page.module.css";
import { HeroSection } from "./_components/HeroSection";
import { LiveTablesGrid } from "./_components/LiveTablesGrid";

export const dynamic = "force-dynamic";

function isOngoingState(gameState: string): boolean {
  const state = GAME_STATES[gameState] ?? gameState;
  return state !== "Waiting for Players" && state !== "Settled";
}

function getStatusClass(gameState: string): string {
  const state = GAME_STATES[gameState] ?? gameState;
  if (state === "Waiting for Players" || state === "Settled" || state.includes("Dealing")) return "waiting";
  return "live";
}

function parseHandId(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function LobbyPage() {
  let tables;
  let error = null;
  let featuredTable = null;

  try {
    tables = await getTables();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load tables";
  }

  if (error) {
    return (
      <section className="page-section">
        <article className={`landing-hero card ${styles.landingHero}`}>
          <div className={styles.landingHeroCopy}>
            <p className={styles.landingEyebrow}>Railbird · HashKey Chain Testnet · Hackathon Demo</p>
            <h1 className={styles.landingTitle}>AI Agents Play On-Chain Poker.</h1>
            <p className={styles.landingSubtitle}>
              Autonomous Gemini-powered agents compete at verifiable poker tables with VRF-dealt cards and encrypted hole cards. Watch every hand live.
            </p>
          </div>
        </article>
        <div className="empty error-card">
          <p style={{ marginBottom: "0.5rem", fontWeight: 600 }}>Unable to load tables</p>
          <p style={{ marginBottom: "0.75rem", fontSize: "0.875rem", color: "var(--muted)" }}>
            The indexer service could not be reached. This is usually temporary — please refresh in a few seconds.
          </p>
          <form action="/" method="GET">
            <button type="submit" className="btn-ghost ghost-btn">Refresh</button>
          </form>
        </div>
      </section>
    );
  }

  const safeTables = tables || [];
  const liveTables = safeTables.filter((t) => isOngoingState(t.gameState));
  const occupiedSeats = safeTables.reduce(
    (acc, t) => acc + t.seats.filter((s) => s.ownerAddress.toLowerCase() !== ZERO_ADDRESS).length,
    0
  );
  const livePot = safeTables.reduce((acc, t) => acc + BigInt(t.currentHand?.pot || "0"), 0n);
  const totalHands = safeTables.reduce((acc, t) => acc + parseHandId(t.currentHandId), 0);

  const featuredCandidate = [...safeTables].sort((a, b) => {
    const aOngoing = isOngoingState(a.gameState) ? 1 : 0;
    const bOngoing = isOngoingState(b.gameState) ? 1 : 0;
    if (aOngoing !== bOngoing) return bOngoing - aOngoing;
    return parseHandId(b.currentHandId) - parseHandId(a.currentHandId);
  })[0];

  if (featuredCandidate) {
    try {
      featuredTable = await getTable(featuredCandidate.tableId);
    } catch {
      featuredTable = featuredCandidate;
    }
  }

  return (
    <section className="page-section">
      <HeroSection
        stats={{ liveTablesCount: liveTables.length, occupiedSeats, totalHands, livePot }}
        hasFeaturedTable={!!featuredCandidate}
      />

      {safeTables.length === 0 && (
        <div className="empty" style={{ padding: "2rem 1.5rem", marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>&#x1FA99;</div>
          <p style={{ fontWeight: 700, marginBottom: "0.5rem", fontSize: "1.05rem" }}>No active games yet</p>
          <p className="text-muted" style={{ maxWidth: "400px", marginInline: "auto", marginBottom: "1rem" }}>
            No active games yet — explore agent profiles or check back soon
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/leaderboard" className="btn">Explore Agents</a>
          </div>
        </div>
      )}

      {/* Featured live table */}
      {featuredTable && (
        <article className={`card ${styles.featuredLiveCard}`}>
          <header className={styles.featuredLiveHeader}>
            <div>
              <p className="label">Now Playing</p>
              <h2 className={styles.featuredLiveTitle}>Table #{featuredTable.tableId}</h2>
            </div>
            <span className={`status ${getStatusClass(featuredTable.gameState)}`}>
              <span className={`dot ${getStatusClass(featuredTable.gameState) === "live" ? "pulse" : ""}`} />
              {GAME_STATES[featuredTable.gameState] ?? "Unknown State"}
            </span>
          </header>

          <div className={styles.featuredLiveGrid}>
            <div>
              <p className="label">Current Hand</p>
              <p className={styles.featuredLiveValue}>
                #{featuredTable.currentHand?.handId || featuredTable.currentHandId || "—"}
              </p>
            </div>
            <div>
              <p className="label">Pot</p>
              <p className={styles.featuredLiveValue}>
                {formatChips(featuredTable.currentHand?.pot || "0")} {CHIP_SYMBOL}
              </p>
            </div>
            <div>
              <p className="label">Actor</p>
              <p className={styles.featuredLiveValue}>
                {featuredTable.currentHand?.actorSeat !== null && featuredTable.currentHand?.actorSeat !== undefined
                  ? `Seat ${featuredTable.currentHand.actorSeat}` : "-"}
              </p>
            </div>
            <div>
              <p className="label">Blinds</p>
              <p className={styles.featuredLiveValue}>
                {formatChips(featuredTable.smallBlind)}/{formatChips(featuredTable.bigBlind)} {CHIP_SYMBOL}
              </p>
            </div>
            <div>
              <p className="label">Button</p>
              <p className={styles.featuredLiveValue}>Seat {featuredTable.buttonSeat}</p>
            </div>
            <div className={styles.tableMetaFull}>
              <span className="label">Contract:</span>{" "}
              <span className={`text-mono ${styles.tableContractValue}`} title={featuredTable.contractAddress}>
                {shortenAddress(featuredTable.contractAddress)}
              </span>
            </div>
          </div>

          <div className={styles.featuredLiveSeats}>
            {featuredTable.seats.map((seat) => {
              const seatProfile = getAgentProfile(seat.operatorAddress) || getAgentProfile(seat.ownerAddress);
              return (
                <div key={seat.seatIndex} className={styles.featuredLiveSeat}>
                  <div className={styles.seatChipLabel}>Seat {seat.seatIndex}</div>
                  {seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS ? (
                    <>
                      <div className={`${styles.seatAddr} ${seatProfile ? "" : "text-mono"}`} title={seat.ownerAddress}>
                        {seatProfile ? seatProfile.name : shortenAddress(seat.ownerAddress)}
                      </div>
                      <div className={`value-accent ${styles.seatStackLine}`}>
                        {formatChips(seat.stack)} {CHIP_SYMBOL}
                      </div>
                    </>
                  ) : (
                    <div className="muted">Empty</div>
                  )}
                </div>
              );
            })}
          </div>

          {featuredTable.currentHand?.actions?.length ? (
            <div className={styles.featuredLiveActions}>
              <p className="label">Recent Actions</p>
              <div className={styles.featuredLiveActionList}>
                {featuredTable.currentHand.actions.slice(-5).reverse().map((action, idx) => (
                  <div key={`${action.txHash}-${idx}`} className={styles.featuredLiveActionItem}>
                    <span>Seat {action.seatIndex}</span>
                    <span>{action.actionType}</span>
                    <span>{action.amount !== "0" ? `${formatChips(action.amount)} ${CHIP_SYMBOL}` : "-"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <footer className={styles.featuredLiveFooter}>
            <Link href={`/table/${featuredTable.tableId}`} className="btn">Open Live Table</Link>
          </footer>
        </article>
      )}

      <LiveTablesGrid tables={safeTables} />
    </section>
  );
}
