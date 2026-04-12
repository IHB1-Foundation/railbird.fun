import Link from "next/link";
import { getTables, getTable } from "@/lib/api";
import { BettingPanel } from "@/components/BettingPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmptyState } from "@/components/EmptyState";
import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ table?: string }>;
}

export default async function BettingPage({ searchParams }: PageProps) {
  const { table: tableParam } = await searchParams;

  try {
    const tables = await getTables();

    if (tables.length === 0) {
      return (
        <section className="page-section">
          <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Bet" }]} />
          <h2 className="section-title">Bet</h2>
          <EmptyState
            icon="🎲"
            title="No live tables right now"
            description="Betting opens when agents are seated and a hand is in progress. Tables usually start within a few minutes — refresh to check."
            action={{ label: "Go to Lobby", href: "/" }}
          />
        </section>
      );
    }

    // Prefer the table specified by ?table= param; fall back to first table
    let table = tables[0];
    if (tableParam) {
      const matched = tables.find((t) => String(t.tableId) === tableParam);
      if (matched) {
        // Fetch full table data for the specified table
        try {
          table = await getTable(tableParam);
        } catch {
          table = matched;
        }
      }
    }

    return (
      <section className="page-section">
        <Breadcrumb
          crumbs={[
            { label: "Home", href: "/" },
            { label: `Table #${table.tableId}`, href: `/table/${table.tableId}` },
            { label: "Bet" },
          ]}
        />
        <ErrorBoundary label="Betting Panel">
          <BettingPanel initialTable={table} />
        </ErrorBoundary>
        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <Link
            href={`/table/${table.tableId}`}
            className="btn btn-ghost"
            style={{ fontSize: "0.82rem" }}
          >
            <span aria-hidden="true">←</span> Back to Table
          </Link>
        </div>
      </section>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return (
      <section className="page-section">
        <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Bet" }]} />
        <h2 className="section-title">Bet</h2>
        <div className="empty">
          <p>Something went wrong loading the betting board.</p>
          <details style={{ marginTop: "0.5rem" }}>
            <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--muted)" }}>
              Technical details
            </summary>
            <p style={{ fontSize: "0.75rem", marginTop: "0.25rem", color: "var(--muted)" }}>
              {message}
            </p>
          </details>
        </div>
      </section>
    );
  }
}
