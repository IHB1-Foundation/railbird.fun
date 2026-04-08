import { SkeletonCard, SkeletonRow } from "@/components/SkeletonCard";

export default function AgentLoading() {
  return (
    <section className="page-section" aria-label="Loading agent">
      <div className="card-grid" style={{ marginBottom: "1.5rem" }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="card section-card" aria-hidden="true">
        <div className="table-scroll">
          <table className="leaderboard-table" aria-busy="true">
            <tbody>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
