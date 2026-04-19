"use client";

import dynamic from "next/dynamic";

export const LazyStrategyTimeline = dynamic(
  () => import("./StrategyTimeline").then((mod) => mod.StrategyTimeline),
  { ssr: false, loading: () => null },
);

export const LazyMetaRadar = dynamic(() => import("./MetaRadar").then((mod) => mod.MetaRadar), {
  ssr: false,
  loading: () => <div style={{ height: 140 }} aria-label="Loading radar..." />,
});

export const LazyEloStrategyScatter = dynamic(
  () => import("./EloStrategyScatter").then((mod) => mod.EloStrategyScatter),
  {
    ssr: false,
    loading: () => <div className="chart-placeholder" aria-label="Loading scatter..." />,
  },
);
