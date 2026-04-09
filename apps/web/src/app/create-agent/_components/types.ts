export interface PersonaConfig {
  name: string;
  emoji: string;
  colorAccent: string;
  aggression: number;
  tightness: number;
  bluffFrequency: number;
  positionAwareness: number;
  systemPrompt: string;
}

export interface TableInfo {
  tableId: string;
  address: string;
  smallBlind: string;
  bigBlind: string;
  activePlayers: number;
  emptySeats: number;
  state: string;
}

export type DeployStatus = "idle" | "registering" | "seating" | "starting" | "live" | "error";

export const EMOJI_OPTIONS = ["🦈", "🔥", "🪨", "🧠", "🐺", "🦊", "🐻", "🦅", "🐍", "🎯"];
export const COLOR_OPTIONS = [
  "#3B82F6", "#EF4444", "#6B7280", "#8B5CF6",
  "#10B981", "#F59E0B", "#EC4899", "#06B6D4",
];

export const DEFAULT_PERSONA: PersonaConfig = {
  name: "",
  emoji: "🤖",
  colorAccent: "#3B82F6",
  aggression: 0.5,
  tightness: 0.5,
  bluffFrequency: 0.3,
  positionAwareness: 0.7,
  systemPrompt: "",
};
