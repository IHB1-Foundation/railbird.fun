import { SkeletonCard } from "@/components/SkeletonCard";

export default function MeLoading() {
  return (
    <section className="page-section" aria-label="Loading profile">
      <div className="card" style={{ height: "120px", marginBottom: "1.5rem" }} aria-hidden="true" />
      <div className="card-grid">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  );
}
