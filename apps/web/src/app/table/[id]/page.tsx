import type { Metadata } from "next";
import { getTable } from "@/lib/api";
import { TableViewer } from "./TableViewer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** Allow hex addresses (with or without 0x) and numeric IDs only. */
const VALID_TABLE_ID = /^(0x[a-fA-F0-9]{1,40}|\d+)$/;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { id } = params;
  return {
    title: `Table #${id}`,
    description: `Live table view, hand replay, and decision breakdown for table ${id}.`,
  };
}

export default async function TablePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Promise<{ hand?: string; view?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const focusHandId = query.hand?.trim();
  const clipMode = query.view === "clips";

  if (!VALID_TABLE_ID.test(id)) {
    notFound();
  }

  let table;
  let error = null;

  try {
    table = await getTable(id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load table";
  }

  if (error) {
    return (
      <div className="empty">
        <p>Unable to load table</p>
        <p className="error-detail">{error}</p>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="empty">
        <p>Table not found</p>
      </div>
    );
  }

  return (
    <section className="page-section">
      {focusHandId && (
        <div className="card" style={{ marginBottom: "1rem", padding: "0.9rem 1rem" }}>
          <strong style={{ display: "block", marginBottom: "0.25rem" }}>
            Replay Hand #{focusHandId}
          </strong>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>
            Deep link restored. Use the action log and decision breakdown to walk through this hand.
          </p>
        </div>
      )}
      {clipMode && (
        <div className="card" style={{ marginBottom: "1rem", padding: "0.9rem 1rem" }}>
          <strong style={{ display: "block", marginBottom: "0.25rem" }}>Highlight Builder</strong>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>
            Clip mode keeps the table focused for replay capture and sharing. Open the action log to
            isolate standout hands.
          </p>
        </div>
      )}
      <ErrorBoundary label="Table Viewer">
        <TableViewer initialData={table} tableId={id} />
      </ErrorBoundary>
    </section>
  );
}
