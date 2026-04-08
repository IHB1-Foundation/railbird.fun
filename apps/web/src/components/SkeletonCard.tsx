"use client";

const shimmerStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.6s infinite",
  borderRadius: "6px",
};

export function SkeletonLine({ width = "100%", height = "1rem" }: { width?: string; height?: string }) {
  return <div style={{ ...shimmerStyle, width, height, marginBottom: "0.4rem" }} />;
}

export function SkeletonCard({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      className="card"
      style={{ display: "grid", gap: "0.6rem", ...style }}
      aria-hidden="true"
    >
      <SkeletonLine width="60%" height="1.1rem" />
      <SkeletonLine width="80%" height="0.8rem" />
      <SkeletonLine width="40%" height="0.8rem" />
      <SkeletonLine height="2rem" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} style={{ padding: "0.75rem" }}>
          <div style={{ ...shimmerStyle, height: "0.9rem", width: i === 0 ? "30px" : "80%" }} />
        </td>
      ))}
    </tr>
  );
}
