import { SkeletonRow } from "@/components/SkeletonCard";

export default function LeaderboardLoading() {
  return (
    <section className="page-section" aria-label="Loading leaderboard">
      <h1 className="section-title">Leaderboard</h1>
      <div className="table-scroll">
        <table className="leaderboard-table" aria-busy="true">
          <tbody>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </tbody>
        </table>
      </div>
    </section>
  );
}
