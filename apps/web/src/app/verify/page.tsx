"use client";

import { useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { getAuditTrail, verifyDecision, type AuditDecision, type AuditTrailResponse } from "@/lib/api";
import { explorerTxUrl } from "@/lib/utils";

export default function VerifyPage() {
  const [tableAddress, setTableAddress] = useState("");
  const [handId, setHandId] = useState("");
  const [trail, setTrail] = useState<AuditTrailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyInputs, setVerifyInputs] = useState<Record<number, string>>({});
  const [verifyResults, setVerifyResults] = useState<Record<number, { verified: boolean; reason?: string }>>({});
  const [verifying, setVerifying] = useState<Record<number, boolean>>({});

  async function handleLookup() {
    setError(null);
    setTrail(null);
    setVerifyResults({});
    if (!tableAddress.trim() || !handId.trim()) {
      setError("Table address and hand ID are required.");
      return;
    }
    setLoading(true);
    try {
      const result = await getAuditTrail(tableAddress.trim(), handId.trim());
      if (!result || result.decisions.length === 0) {
        setError("No on-chain reasoning hashes found for this hand.");
      } else {
        setTrail(result);
      }
    } catch {
      setError("Failed to fetch audit trail.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(decision: AuditDecision) {
    const reasoning = verifyInputs[decision.seat_index];
    if (!reasoning?.trim()) return;
    setVerifying((v) => ({ ...v, [decision.seat_index]: true }));
    try {
      const result = await verifyDecision({
        tableAddress: trail!.tableAddress,
        handId: trail!.handId,
        seatIndex: decision.seat_index,
        reasoning: reasoning.trim(),
      });
      setVerifyResults((r) => ({ ...r, [decision.seat_index]: { verified: result.verified, reason: result.reason } }));
    } catch {
      setVerifyResults((r) => ({ ...r, [decision.seat_index]: { verified: false, reason: "Verification request failed." } }));
    } finally {
      setVerifying((v) => ({ ...v, [decision.seat_index]: false }));
    }
  }

  const allVerified = trail && trail.decisions.length > 0 &&
    trail.decisions.every((d) => verifyResults[d.seat_index]?.verified === true);
  const anyMismatch = trail && trail.decisions.some((d) => verifyResults[d.seat_index]?.verified === false);

  return (
    <section className="page-section">
      <Breadcrumb crumbs={[
        { label: "Home", href: "/" },
        { label: "AI Decision Verifier" },
      ]} />

      <h2>AI Decision Verifier</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
        Verify that AI reasoning data matches the keccak256 hash committed on-chain.
        Enter a table address and hand ID to inspect the audit trail.
      </p>

      <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Table address (0x...)"
              value={tableAddress}
              onChange={(e) => setTableAddress(e.target.value)}
              style={{
                flex: 2, minWidth: "200px", padding: "0.5rem 0.75rem",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(157,166,207,0.25)",
                borderRadius: "0.375rem", color: "var(--text)", fontSize: "0.85rem",
              }}
            />
            <input
              type="text"
              placeholder="Hand ID (number)"
              value={handId}
              onChange={(e) => setHandId(e.target.value)}
              style={{
                flex: 1, minWidth: "120px", padding: "0.5rem 0.75rem",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(157,166,207,0.25)",
                borderRadius: "0.375rem", color: "var(--text)", fontSize: "0.85rem",
              }}
            />
            <button
              onClick={() => void handleLookup()}
              disabled={loading}
              className="btn"
              style={{ padding: "0.5rem 1.2rem", fontSize: "0.85rem" }}
            >
              {loading ? "Loading…" : "Lookup"}
            </button>
          </div>
          {error && (
            <p style={{ fontSize: "0.8rem", color: "var(--danger)", margin: 0 }}>{error}</p>
          )}
        </div>
      </div>

      {trail && (
        <>
          {allVerified && (
            <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: "0.5rem", padding: "0.75rem 1rem", marginBottom: "1rem", color: "#22C55E", fontSize: "0.85rem", fontWeight: 600 }}>
              ✓ All decisions verified — reasoning data matches on-chain hashes.
            </div>
          )}
          {anyMismatch && !allVerified && (
            <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: "0.5rem", padding: "0.75rem 1rem", marginBottom: "1rem", color: "#EF4444", fontSize: "0.85rem", fontWeight: 600 }}>
              ✗ Hash mismatch detected — reasoning data does not match on-chain record.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {trail.decisions.map((decision) => {
              const result = verifyResults[decision.seat_index];
              return (
                <div key={decision.seat_index} className="card" style={{ padding: "1rem 1.2rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Seat {decision.seat_index}</span>
                    {result !== undefined && (
                      <span style={{
                        fontSize: "0.78rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "9999px",
                        background: result.verified ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                        color: result.verified ? "#22C55E" : "#EF4444",
                        border: `1px solid ${result.verified ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
                      }}>
                        {result.verified ? "✓ Verified" : "✗ Mismatch"}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
                    <div>
                      <span style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block", marginBottom: "0.15rem" }}>On-chain reasoning hash</span>
                      <code style={{ fontSize: "0.72rem", wordBreak: "break-all", color: "#9CA3AF" }}>{decision.reasoning_hash}</code>
                    </div>
                    <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                      <div>
                        <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Commit tx: </span>
                        <a
                          href={explorerTxUrl(decision.commit_tx_hash)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: "0.72rem", color: "var(--accent, #8B5CF6)" }}
                        >
                          {decision.commit_tx_hash.slice(0, 10)}…
                        </a>
                      </div>
                      <div>
                        <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Block: </span>
                        <span style={{ fontSize: "0.72rem" }}>{decision.block_number}</span>
                      </div>
                    </div>
                  </div>

                  {result === undefined && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <textarea
                        rows={3}
                        placeholder="Paste the AI reasoning text here to verify against the on-chain hash…"
                        value={verifyInputs[decision.seat_index] ?? ""}
                        onChange={(e) => setVerifyInputs((v) => ({ ...v, [decision.seat_index]: e.target.value }))}
                        style={{
                          width: "100%", padding: "0.5rem 0.75rem", resize: "vertical",
                          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(157,166,207,0.2)",
                          borderRadius: "0.375rem", color: "var(--text)", fontSize: "0.8rem", fontFamily: "inherit",
                        }}
                      />
                      <button
                        onClick={() => void handleVerify(decision)}
                        disabled={verifying[decision.seat_index] || !verifyInputs[decision.seat_index]?.trim()}
                        className="btn"
                        style={{ alignSelf: "flex-start", padding: "0.4rem 1rem", fontSize: "0.8rem" }}
                      >
                        {verifying[decision.seat_index] ? "Verifying…" : "Verify"}
                      </button>
                    </div>
                  )}
                  {result !== undefined && result.reason && (
                    <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.5rem", margin: 0 }}>{result.reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!trail && !loading && !error && (
        <div style={{ textAlign: "center", color: "var(--muted)", padding: "3rem 0", fontSize: "0.9rem" }}>
          Enter a table address and hand ID above to inspect the AI audit trail.
        </div>
      )}
    </section>
  );
}
