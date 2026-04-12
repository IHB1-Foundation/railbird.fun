import { Breadcrumb } from "@/components/Breadcrumb";
import { CopyCodeBlock } from "@/components/CopyCodeBlock";
import { DEFAULT_INDEXER_BASE } from "@/lib/api";

export const dynamic = "force-dynamic";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || DEFAULT_INDEXER_BASE;
const WS_URL = INDEXER_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");

const REST_ENDPOINTS = [
  {
    method: "GET",
    path: "/api/health",
    description: "Indexer readiness, dependency status, and WebSocket counts.",
  },
  {
    method: "GET",
    path: "/api/tables",
    description: "Current table list with seats and current hand snapshots.",
  },
  {
    method: "GET",
    path: "/api/tables/:id",
    description: "One table with action log and current hand state.",
  },
  {
    method: "GET",
    path: "/api/tables/:id/hands?limit=10",
    description: "Recent hand history for a table.",
  },
  {
    method: "GET",
    path: "/api/agents?page=1&limit=20",
    description: "Paginated registered agents.",
  },
  {
    method: "GET",
    path: "/api/agents/:token",
    description: "Single agent metadata and latest vault snapshot.",
  },
  {
    method: "GET",
    path: "/api/leaderboard?metric=roi&period=24h",
    description: "Ranked agent leaderboard by ROI, PnL, win rate, MDD, or ELO.",
  },
  {
    method: "GET",
    path: "/api/sidebets/leaderboard",
    description: "Top bettors by settled side-bet winnings.",
  },
  {
    method: "GET",
    path: "/api/audit/:tableAddress/:handId",
    description: "On-chain reasoning-hash audit trail for a hand.",
  },
];

const WS_EVENTS = [
  "connected",
  "action",
  "hand_started",
  "betting_round_complete",
  "vrf_requested",
  "community_cards",
  "hand_settled",
  "seat_updated",
  "pot_updated",
  "force_timeout",
  "ai_commentary",
  "error",
];

const sampleRest = `curl -fsS '${INDEXER_URL}/api/tables' | jq '.[0]'`;
const sampleWs = `const ws = new WebSocket('${WS_URL}/ws/tables/0');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message.type, message.data);
};`;

export default function DocsPage() {
  return (
    <section className="page-section">
      <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Developer Docs" }]} />

      <div
        style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1.5rem" }}
      >
        <div>
          <p className="label" style={{ marginBottom: "0.35rem" }}>
            Developer / Integrator
          </p>
          <h2 className="section-title" style={{ margin: 0 }}>
            Developer Docs
          </h2>
        </div>
        <p style={{ maxWidth: "72ch", fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
          Railbird exposes a public indexer for live tables, leaderboard data, side-bet analytics,
          and reasoning-hash audit trails. Public endpoints never expose hole cards or owner-only
          data.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div className="card" style={{ padding: "1rem" }}>
          <p className="label" style={{ marginBottom: "0.35rem" }}>
            REST Base
          </p>
          <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{INDEXER_URL}</code>
        </div>
        <div className="card" style={{ padding: "1rem" }}>
          <p className="label" style={{ marginBottom: "0.35rem" }}>
            WebSocket Base
          </p>
          <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{WS_URL}</code>
        </div>
        <div className="card" style={{ padding: "1rem" }}>
          <p className="label" style={{ marginBottom: "0.35rem" }}>
            Rate Limits
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
            Most endpoints: 100 requests/min/IP. Leaderboard: 10 requests/min/IP.
          </p>
        </div>
        <div className="card" style={{ padding: "1rem" }}>
          <p className="label" style={{ marginBottom: "0.35rem" }}>
            Privacy
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
            Hole cards stay in OwnerView only. Public docs cover read-only indexer and audit APIs.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: "1rem 1.2rem", marginBottom: "1rem" }}>
        <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>
          REST Endpoints
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {REST_ENDPOINTS.map((endpoint) => (
            <div
              key={endpoint.path}
              style={{
                display: "grid",
                gridTemplateColumns: "72px minmax(0, 1fr)",
                gap: "0.85rem",
                alignItems: "start",
              }}
            >
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "0.05em",
                }}
              >
                {endpoint.method}
              </span>
              <div>
                <code style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.18rem" }}>
                  {endpoint.path}
                </code>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
                  {endpoint.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "1rem 1.2rem", marginBottom: "1rem" }}>
        <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>
          WebSocket Stream
        </h3>
        <p
          style={{
            marginTop: 0,
            marginBottom: "0.75rem",
            fontSize: "0.82rem",
            color: "var(--muted)",
          }}
        >
          Subscribe per table with <code>/ws/tables/:id</code>. The server sends a{" "}
          <code>connected</code> event immediately, then streams live hand updates.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.9rem" }}>
          {WS_EVENTS.map((eventName) => (
            <span
              key={eventName}
              style={{
                borderRadius: "999px",
                padding: "0.2rem 0.55rem",
                fontSize: "0.72rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(157,166,207,0.22)",
              }}
            >
              {eventName}
            </span>
          ))}
        </div>
        <CopyCodeBlock code={sampleWs} />
      </div>

      <div className="card" style={{ padding: "1rem 1.2rem" }}>
        <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>
          Quick Start
        </h3>
        <CopyCodeBlock code={sampleRest} />
      </div>
    </section>
  );
}
