// Persona type system for AI agent strategy personalities

export interface PersonaConfig {
  id: string;                    // e.g., "shark", "maniac", "rock", "adaptive"
  name: string;                  // e.g., "The Shark"
  description: string;           // 1-line description
  // Behavioral parameters
  aggression: number;            // 0.0 ~ 1.0
  tightness: number;             // 0.0 (loose) ~ 1.0 (tight)
  bluffFrequency: number;        // 0.0 ~ 1.0
  positionAwareness: number;     // 0.0 ~ 1.0
  // LLM prompt personality
  systemPromptOverride: string;  // Injected into Gemini prompt
  // Visual identity
  emoji: string;                 // Display emoji at table
  colorAccent: string;           // CSS color for UI
}

const PERSONAS: PersonaConfig[] = [
  {
    id: "shark",
    name: "The Shark",
    description: "Tight-aggressive (TAG) — plays premium hands aggressively, exploits position relentlessly.",
    aggression: 0.7,
    tightness: 0.7,
    bluffFrequency: 0.3,
    positionAwareness: 0.9,
    systemPromptOverride:
      "You are a tight-aggressive (TAG) player. Play premium hands aggressively. Fold marginal hands. Exploit position relentlessly. Value bet thin.",
    emoji: "🦈",
    colorAccent: "#3B82F6",
  },
  {
    id: "maniac",
    name: "The Maniac",
    description: "Loose-aggressive (LAG) — plays many hands, applies maximum pressure with frequent raises and bluffs.",
    aggression: 0.9,
    tightness: 0.2,
    bluffFrequency: 0.7,
    positionAwareness: 0.5,
    systemPromptOverride:
      "You are a loose-aggressive (LAG) maniac. Play many hands. Apply maximum pressure with frequent raises and bluffs. Make opponents uncomfortable.",
    emoji: "🔥",
    colorAccent: "#EF4444",
  },
  {
    id: "rock",
    name: "The Rock",
    description: "Ultra-tight (nit) — only plays premium hands (top 15%), rarely bluffs, minimizes losses.",
    aggression: 0.3,
    tightness: 0.9,
    bluffFrequency: 0.05,
    positionAwareness: 0.6,
    systemPromptOverride:
      "You are an ultra-tight (nit) player. Only play premium hands (top 15%). Rarely bluff. Wait for strong spots. Minimize losses.",
    emoji: "🪨",
    colorAccent: "#6B7280",
  },
  {
    id: "adaptive",
    name: "The Adaptive",
    description: "Adjusts strategy based on opponents — steals vs tight players, traps vs aggressive ones.",
    aggression: 0.5,
    tightness: 0.5,
    bluffFrequency: 0.3,
    positionAwareness: 0.8,
    systemPromptOverride:
      "You are an adaptive player. Adjust your strategy based on opponents. Against tight players, steal more. Against aggressive players, trap more. Against calling stations, value bet wider.",
    emoji: "🧠",
    colorAccent: "#8B5CF6",
  },
];

const PERSONA_MAP = new Map<string, PersonaConfig>(
  PERSONAS.map((p) => [p.id, p])
);

/**
 * Look up a persona preset by ID.
 * Returns undefined if the ID is not recognized.
 */
export function getPersona(id: string): PersonaConfig | undefined {
  return PERSONA_MAP.get(id.toLowerCase());
}

/**
 * Return all persona presets.
 */
export function getAllPersonas(): PersonaConfig[] {
  return PERSONAS;
}
