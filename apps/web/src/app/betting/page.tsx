import { getTables } from "@/lib/api";
import { BettingPanel } from "@/components/BettingPanel";

export const dynamic = "force-dynamic";

export default async function BettingPage() {
  try {
    const tables = await getTables();
    const table = tables[0];

    if (!table) {
      return (
        <section className="page-section">
          <h2 className="section-title">Rail Bets</h2>
          <div className="empty">
            <p>No table available for betting.</p>
          </div>
        </section>
      );
    }

    return <BettingPanel initialTable={table} />;
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
