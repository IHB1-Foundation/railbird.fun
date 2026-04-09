import { SkeletonCard } from "@/components/SkeletonCard";

export default function EvolutionLoading() {
  return (
    <section className="page-section" aria-label="Loading evolution data">
      <div className="card" style={{ height: "220px", marginBottom: "1rem" }} aria-hidden="true" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  );
}
