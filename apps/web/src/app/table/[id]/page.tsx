import { getTable } from "@/lib/api";
import { TableViewer } from "./TableViewer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** Allow hex addresses (with or without 0x) and numeric IDs only. */
const VALID_TABLE_ID = /^(0x[a-fA-F0-9]{1,40}|\d+)$/;

export default async function TablePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;

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
    <ErrorBoundary label="Table Viewer">
      <TableViewer initialData={table} tableId={id} />
    </ErrorBoundary>
  );
}
