// Re-export agent profiles for web app usage.
// Imported directly to avoid pulling in server-only deps from @playerco/shared barrel.

export interface AgentProfile {
  name: string;
  aggressionLabel: "Tight" | "Balanced" | "Loose" | "Maniac";
  colorHex: string;
  accentColor: string;
  aggressionFactor: number;
}

/**
 * Hardcoded demo agent profiles keyed by lowercased operator address.
 * Operator addresses derived from AGENT_N_OPERATOR_PRIVATE_KEY in .env.
 */
const AGENT_PROFILES: Record<string, AgentProfile> = {
  // Agent 1 — Tight (Aegis)
  "0x1c4ae656c9640a9a838a8f289326e35452d113b1": {
    name: "Aegis",
    aggressionLabel: "Tight",
    colorHex: "#0f172a",
    accentColor: "#22d3ee",
    aggressionFactor: 0.15,
  },
  // Agent 2 — Balanced (Maverick)
  "0xaa256b84d3a87f7782ddc01241960023acc60392": {
    name: "Maverick",
    aggressionLabel: "Balanced",
    colorHex: "#052e16",
    accentColor: "#4ade80",
    aggressionFactor: 0.35,
  },
  // Agent 3 — Loose (Nova)
  "0x63e459ad2b1f78bbf450e541fb16a33578936eb4": {
    name: "Nova",
    aggressionLabel: "Loose",
    colorHex: "#172554",
    accentColor: "#60a5fa",
    aggressionFactor: 0.60,
  },
  // Agent 4 — Maniac (Rex)
  "0xda55846b0ff474e6bc3c6c5383b5604c0fb90c24": {
    name: "Rex",
    aggressionLabel: "Maniac",
    colorHex: "#3b0764",
    accentColor: "#c084fc",
    aggressionFactor: 0.85,
  },
};

/**
 * Look up an agent profile by any known address (operator, owner, etc.).
 * Returns null if address is not a known demo agent.
 */
export function getAgentProfile(address: string): AgentProfile | null {
  if (!address) return null;
  return AGENT_PROFILES[address.toLowerCase()] ?? null;
}
