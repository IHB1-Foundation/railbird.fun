import { SkeletonCard } from "@/components/SkeletonCard";
import styles from "./loading.module.css";

export default function Loading() {
  return (
    <section className="page-section" aria-label="Loading tables">
      <div className={`card ${styles.heroSkeleton}`} aria-hidden="true">
        <div className={styles.shimmer} />
      </div>
      <div className="card-grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  );
}
