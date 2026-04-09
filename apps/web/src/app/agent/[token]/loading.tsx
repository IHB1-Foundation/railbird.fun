import { SkeletonCard, SkeletonLine } from "@/components/SkeletonCard";

export default function AgentLoading() {
  return (
    <section className="page-section" aria-label="Loading agent profile">
      {/* Agent header */}
      <div className="card" style={{ marginBottom: "1.5rem", display: "flex", gap: "1.2rem", alignItems: "flex-start" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
          <SkeletonLine width="100%" height="100%" />
        </div>
        <div style={{ flex: 1 }}>
          <SkeletonLine width="55%" height="1.5rem" />
          <SkeletonLine width="35%" height="0.85rem" />
          <SkeletonLine width="45%" height="0.85rem" />
        </div>
        <SkeletonLine width="90px" height="2rem" />
      </div>

      {/* Stats grid */}
      <div className="card-grid" style={{ marginBottom: "1.5rem" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card">
          <SkeletonLine width="50%" height="1.1rem" />
          <div style={{ height: 160, marginTop: "0.75rem" }}>
            <SkeletonLine width="100%" height="100%" />
          </div>
        </div>
        <div className="card">
          <SkeletonLine width="50%" height="1.1rem" />
          <div style={{ height: 160, marginTop: "0.75rem" }}>
            <SkeletonLine width="100%" height="100%" />
          </div>
        </div>
      </div>

      {/* Hand history */}
      <SkeletonCard style={{ height: 200 }} />
    </section>
  );
}
