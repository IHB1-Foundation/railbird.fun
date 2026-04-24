// Contract ABIs for event parsing — imported from @playerco/shared (single source of truth)
export {
  POKER_TABLE_ABI as pokerTableAbi,
  PLAYER_REGISTRY_ABI as playerRegistryAbi,
  PLAYER_VAULT_ABI as playerVaultAbi,
} from "@playerco/shared";

// Game state enum mapping
export const GAME_STATES = [
  "WAITING_FOR_SEATS",
  "HAND_INIT",
  "BETTING_PRE",
  "WAITING_VRF_FLOP",
  "BETTING_FLOP",
  "WAITING_VRF_TURN",
  "BETTING_TURN",
  "WAITING_VRF_RIVER",
  "BETTING_RIVER",
  "SHOWDOWN",
  "SETTLED",
  "TOURNAMENT_OVER",
  "WAITING_VRF_HOLECARDS",
  "WAITING_FOR_HOLECARDS",
] as const;

export function gameStateToString(state: number): string {
  return GAME_STATES[state] || `UNKNOWN_${state}`;
}

// Action type enum mapping
export const ACTION_TYPES = ["FOLD", "CHECK", "CALL", "RAISE"] as const;

export function actionTypeToString(action: number): string {
  return ACTION_TYPES[action] || `UNKNOWN_${action}`;
}
