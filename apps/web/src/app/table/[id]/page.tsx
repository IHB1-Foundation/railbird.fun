import { getTable } from "@/lib/api";
import { TableViewer } from "./TableViewer";

export const dynamic = "force-dynamic";

export default async function TablePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;

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
        <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>{error}</p>
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

  return <TableViewer initialData={table} tableId={id} />;
}
