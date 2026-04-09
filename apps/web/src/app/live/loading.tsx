import { SkeletonCard } from "@/components/SkeletonCard";

export default function LiveLoading() {
  return (
    <section className="page-section" aria-label="Loading live tables">
      <div className="card" style={{ height: "48px", marginBottom: "1rem", maxWidth: "320px" }} aria-hidden="true" />
      <div className="card-grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  );
}
