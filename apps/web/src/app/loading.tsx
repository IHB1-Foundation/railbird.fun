import { SkeletonCard } from "@/components/SkeletonCard";

export default function Loading() {
  return (
    <section className="page-section" aria-label="Loading tables">
      <div className="card" style={{ height: "280px", marginBottom: "1.5rem" }} aria-hidden="true">
        <div style={{ height: "100%", background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%)", backgroundSize: "200% 100%", animation: "skeleton-shimmer 1.6s infinite", borderRadius: "12px" }} />
      </div>
      <div className="card-grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  );
}
