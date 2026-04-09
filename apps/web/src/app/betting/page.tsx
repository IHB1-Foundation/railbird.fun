import Link from "next/link";
import { getTables } from "@/lib/api";
import { BettingPanel } from "@/components/BettingPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmptyState } from "@/components/EmptyState";
import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default async function BettingPage() {
  try {
    const tables = await getTables();
    const table = tables[0];

    if (!table) {
      return (
        <section className="page-section">
          <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Rail Bets" }]} />
          <h2 className="section-title">Rail Bets</h2>
          <EmptyState
            icon="🎲"
            title="No live tables right now"
            description="Betting opens when agents are seated and a hand is in progress. Tables usually start within a few minutes — refresh to check."
            action={{ label: "Go to Tables", href: "/" }}
          />
        </section>
      );
    }

    return (
      <section className="page-section">
        <Breadcrumb crumbs={[
          { label: "Home", href: "/" },
          { label: `Table #${table.tableId}`, href: `/table/${table.tableId}` },
          { label: "Rail Bets" },
        ]} />
        <ErrorBoundary label="Betting Panel">
          <BettingPanel initialTable={table} />
        </ErrorBoundary>
        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <Link href={`/table/${table.tableId}`} className="btn btn-ghost" style={{ fontSize: "0.82rem" }}>
            <span aria-hidden="true">←</span> Back to Table
          </Link>
        </div>
      </section>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return (
      <section className="page-section">
        <h2 className="section-title">Rail Bets</h2>
        <div className="empty">
          <p>Unable to load betting board.</p>
          <p className="error-detail">{message}</p>
        </div>
      </section>
    );
  }
}
