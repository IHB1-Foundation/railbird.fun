// Re-export agent profiles for web app usage.
// Imported directly to avoid pulling in server-only deps from @playerco/shared barrel.

export interface PersonaSummary {
  id: string;
  name: string;
  emoji: string;
  colorAccent: string;
  aggression: number;
  tightness: number;
  bluffFrequency: number;
  description: string;
}

export interface AgentProfile {
  name: string;
  aggressionLabel: "Tight" | "Balanced" | "Loose" | "Maniac";
  colorHex: string;
  accentColor: string;
  aggressionFactor: number;
  personaId?: string;
}

// Persona presets (mirrors bots/agent/src/strategy/persona.ts)
export const PERSONA_PRESETS: Record<string, PersonaSummary> = {
  shark: {
    id: "shark",
    name: "The Shark",
    emoji: "🦈",
    colorAccent: "#3B82F6",
    aggression: 0.7,
    tightness: 0.7,
    bluffFrequency: 0.3,
    description: "Tight-aggressive — plays premium hands aggressively, exploits position.",
  },
  maniac: {
    id: "maniac",
    name: "The Maniac",
    emoji: "🔥",
    colorAccent: "#EF4444",
    aggression: 0.9,
    tightness: 0.2,
    bluffFrequency: 0.7,
    description: "Loose-aggressive — maximum pressure with frequent raises and bluffs.",
  },
  rock: {
    id: "rock",
    name: "The Rock",
    emoji: "🪨",
    colorAccent: "#6B7280",
    aggression: 0.3,
    tightness: 0.9,
    bluffFrequency: 0.05,
    description: "Ultra-tight — only plays top 15% hands, rarely bluffs.",
  },
  adaptive: {
    id: "adaptive",
    name: "The Adaptive",
    emoji: "🧠",
    colorAccent: "#8B5CF6",
    aggression: 0.5,
    tightness: 0.5,
    bluffFrequency: 0.3,
    description: "Adjusts strategy based on opponents — reads and adapts.",
  },
};

export function getPersonaSummary(personaId: string | undefined): PersonaSummary | undefined {
  if (!personaId) return undefined;
  return PERSONA_PRESETS[personaId.toLowerCase()];
}

/**
 * Hardcoded demo agent profiles keyed by lowercased operator address.
 * Operator addresses derived from AGENT_N_OPERATOR_PRIVATE_KEY in .env.
 */
const AGENT_PROFILES: Record<string, AgentProfile> = {
  // Agent 1 — Shark (Aegis)
  "0x1c4ae656c9640a9a838a8f289326e35452d113b1": {
    name: "Aegis",
    aggressionLabel: "Tight",
    colorHex: "#0f172a",
    accentColor: "#3B82F6",
    aggressionFactor: 0.7,
    personaId: "shark",
  },
  // Agent 2 — Maniac (Maverick)
  "0xaa256b84d3a87f7782ddc01241960023acc60392": {
    name: "Maverick",
    aggressionLabel: "Maniac",
    colorHex: "#052e16",
    accentColor: "#EF4444",
    aggressionFactor: 0.9,
    personaId: "maniac",
  },
  // Agent 3 — Rock (Nova)
  "0x63e459ad2b1f78bbf450e541fb16a33578936eb4": {
    name: "Nova",
    aggressionLabel: "Tight",
    colorHex: "#172554",
    accentColor: "#6B7280",
    aggressionFactor: 0.3,
    personaId: "rock",
  },
  // Agent 4 — Adaptive (Rex)
  "0xda55846b0ff474e6bc3c6c5383b5604c0fb90c24": {
    name: "Rex",
    aggressionLabel: "Balanced",
    colorHex: "#3b0764",
    accentColor: "#8B5CF6",
    aggressionFactor: 0.5,
    personaId: "adaptive",
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
