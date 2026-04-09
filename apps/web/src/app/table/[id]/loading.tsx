import { SkeletonCard, SkeletonLine } from "@/components/SkeletonCard";

export default function TableLoading() {
  return (
    <section className="page-section" aria-label="Loading table">
      {/* Header skeleton */}
      <div className="card" style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <SkeletonLine width="40%" height="1.4rem" />
          <SkeletonLine width="60%" height="0.85rem" />
        </div>
        <SkeletonLine width="80px" height="1.8rem" />
      </div>

      {/* Table surface skeleton */}
      <div className="card" style={{ marginBottom: "1rem", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">
        <SkeletonLine width="50%" height="3rem" />
      </div>

      {/* Bottom panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  );
}
