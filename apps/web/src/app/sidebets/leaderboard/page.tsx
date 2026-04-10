import { Breadcrumb } from "@/components/Breadcrumb";
import { DEFAULT_INDEXER_BASE } from "@/lib/api";
import { shortenAddress } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SideBetLeaderboardEntry {
  bettor: string;
  total_bet: string;
  total_bets: number;
}

interface SideBetLeaderboardResponse {
  leaderboard?: SideBetLeaderboardEntry[];
}

export default async function SideBetLeaderboardPage() {
  const base = process.env.NEXT_PUBLIC_INDEXER_URL || DEFAULT_INDEXER_BASE;
  let entries: SideBetLeaderboardEntry[] = [];
  let error: string | null = null;

  try {
    const response = await fetch(`${base}/api/sidebets/leaderboard`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }
    const data = await response.json() as SideBetLeaderboardResponse;
    entries = data.leaderboard ?? [];
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load side-bet leaderboard";
  }

  return (
    <section className="page-section">
      <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Side Bet Leaderboard" }]} />
      <h2 className="section-title">Side Bet Leaderboard</h2>
      <p className="text-muted" style={{ fontSize: "0.82rem", marginBottom: "1rem" }}>
        Settled side-bet performance across all indexed Railbird hands.
      </p>

      {error ? (
        <div className="empty">
          <p>Unable to load side-bet leaderboard.</p>
          <p className="error-detail">{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <p>No settled side bets yet.</p>
          <p className="text-muted" style={{ fontSize: "0.82rem" }}>
            This board fills in once winners have claimed from indexed hands.
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) 140px 120px", gap: "0.75rem", padding: "0.9rem 1rem", borderBottom: "1px solid rgba(157,166,207,0.14)", fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <span>Rank</span>
            <span>Bettor</span>
            <span>Total Won</span>
            <span>Winning Pools</span>
          </div>
          {entries.map((entry, index) => (
            <div key={`${entry.bettor}-${index}`} style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) 140px 120px", gap: "0.75rem", padding: "0.9rem 1rem", borderBottom: index === entries.length - 1 ? "none" : "1px solid rgba(157,166,207,0.08)" }}>
              <strong>#{index + 1}</strong>
              <span className="text-mono">{shortenAddress(entry.bettor)}</span>
              <span>{entry.total_bet}</span>
              <span>{entry.total_bets}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
