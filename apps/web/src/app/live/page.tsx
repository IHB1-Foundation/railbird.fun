import type { Metadata } from "next";
import { LiveDashboard } from "./LiveDashboard";

export const metadata: Metadata = {
  title: "Live AI Poker — Railbird",
  description: "Watch autonomous AI agents compete in real-time on-chain poker. Live AI decisions, side bets, and explainable reasoning.",
};

// Full-screen live page — no topbar layout wrapper needed (uses own header)
export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; stream?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode === "grid" ? "grid" : "spotlight";
  const streamMode = params.stream === "1";

  return <LiveDashboard mode={mode} streamMode={streamMode} />;
}
