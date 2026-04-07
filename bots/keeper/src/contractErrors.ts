/**
 * Known PokerTable contract revert reasons — custom error selector matching (primary)
 * with string-based fallback for backward compatibility with older deployments.
 *
 * Error selectors are keccak256("<ErrorName>()") first 4 bytes, ABI-encoded.
 */
import { decodeErrorResult } from "viem";

export const CONTRACT_ERRORS = {
  // reRequestVRF / reRequestHoleCardVRF
  VRF_TIMEOUT_NOT_REACHED: "VRF timeout not reached",

  // startHand
  CANNOT_START_HAND: "Cannot start hand now",

  // settleShowdown — retry conditions (not fatal)
  NO_REVEALED_HOLE_CARDS: "No revealed hole cards",
  SHOWDOWN_REVEAL_WINDOW_OPEN: "Showdown reveal window open",

  // submitHoleCommit — idempotent duplicate (not fatal)
  COMMITMENT_ALREADY_EXISTS: "Commitment already exists",

  // Multi-keeper race: another keeper already acted this block
  ONE_ACTION_PER_BLOCK: "One action per block",
  INVALID_GAME_STATE: "Invalid game state",
  NOT_YOUR_TURN: "Not your turn",
} as const;

/**
 * Custom error definitions for ABI-decoding PokerTable reverts.
 * Matches the errors declared in PokerTable.sol.
 */
const POKER_TABLE_CUSTOM_ERRORS = [
  { type: "error" as const, name: "OneActionPerBlock", inputs: [] },
  { type: "error" as const, name: "InvalidGameState", inputs: [] },
  { type: "error" as const, name: "CannotStartHand", inputs: [] },
  { type: "error" as const, name: "VRFTimeoutNotReached", inputs: [] },
  { type: "error" as const, name: "ShowdownRevealWindowOpen", inputs: [] },
  { type: "error" as const, name: "CommitmentAlreadyExists", inputs: [] },
  { type: "error" as const, name: "NotYourTurn", inputs: [] },
];

/**
 * Extract raw revert data from a viem contract error.
 * viem wraps revert data in ContractFunctionExecutionError.cause.data or error.data.
 */
function extractRevertData(error: unknown): `0x${string}` | null {
  if (!error || typeof error !== "object") return null;
  const err = error as Record<string, unknown>;
  // viem ContractFunctionExecutionError: error.cause.data
  if (err.cause && typeof err.cause === "object") {
    const cause = err.cause as Record<string, unknown>;
    if (typeof cause.data === "string" && cause.data.startsWith("0x")) {
      return cause.data as `0x${string}`;
    }
  }
  // Direct .data on the error
  if (typeof err.data === "string" && err.data.startsWith("0x")) {
    return err.data as `0x${string}`;
  }
  return null;
}

/**
 * Try to decode a custom error selector from a revert.
 * Returns the error name if recognized, null otherwise.
 */
export function tryDecodeCustomError(error: unknown): string | null {
  const data = extractRevertData(error);
  if (!data || data.length < 10) return null; // need at least 4 bytes (0x + 8 hex chars)
  try {
    const result = decodeErrorResult({
      abi: POKER_TABLE_CUSTOM_ERRORS,
      data,
    });
    return result.errorName;
  } catch {
    return null;
  }
}

/**
 * Returns true when the error indicates a known benign race condition
 * on reRequestVRF (another keeper already re-requested).
 */
export function isVrfAlreadyReRequested(error: unknown): boolean {
  const decoded = tryDecodeCustomError(error);
  if (decoded !== null) return decoded === "VRFTimeoutNotReached";
  // String fallback for older contract deployments
  return String(error).includes(CONTRACT_ERRORS.VRF_TIMEOUT_NOT_REACHED);
}

/**
 * Returns true when startHand reverts because it is not yet allowed
 * (another keeper already started the hand, or table conditions not met).
 */
export function isCannotStartHand(error: unknown): boolean {
  const decoded = tryDecodeCustomError(error);
  if (decoded !== null) return decoded === "CannotStartHand";
  // String fallback
  return String(error).includes(CONTRACT_ERRORS.CANNOT_START_HAND);
}

/**
 * Returns true when settleShowdown should be retried later
 * (hole card reveals still pending or reveal window still open).
 */
export function isSettleShowdownRetriable(error: unknown): boolean {
  const decoded = tryDecodeCustomError(error);
  if (decoded !== null) return decoded === "ShowdownRevealWindowOpen";
  // String fallback
  const msg = String(error);
  return (
    msg.includes(CONTRACT_ERRORS.NO_REVEALED_HOLE_CARDS) ||
    msg.includes(CONTRACT_ERRORS.SHOWDOWN_REVEAL_WINDOW_OPEN)
  );
}

/**
 * Returns true when submitHoleCommit reverts because the commitment
 * was already submitted (idempotent duplicate — safe to ignore).
 */
export function isCommitmentAlreadyExists(error: unknown): boolean {
  const decoded = tryDecodeCustomError(error);
  if (decoded !== null) return decoded === "CommitmentAlreadyExists";
  // String fallback
  return String(error).includes(CONTRACT_ERRORS.COMMITMENT_ALREADY_EXISTS);
}

/**
 * Returns true when a transaction fails because another keeper already acted
 * in the same block or the game state changed before this keeper could act.
 * These are benign multi-keeper coordination races, not real errors.
 */
export function isDuplicateKeeperAction(error: unknown): boolean {
  const decoded = tryDecodeCustomError(error);
  if (decoded !== null) {
    return (
      decoded === "OneActionPerBlock" ||
      decoded === "InvalidGameState" ||
      decoded === "CannotStartHand" ||
      decoded === "VRFTimeoutNotReached"
    );
  }
  // String fallback
  const msg = String(error);
  return (
    msg.includes(CONTRACT_ERRORS.ONE_ACTION_PER_BLOCK) ||
    msg.includes(CONTRACT_ERRORS.INVALID_GAME_STATE) ||
    msg.includes(CONTRACT_ERRORS.CANNOT_START_HAND) ||
    msg.includes(CONTRACT_ERRORS.VRF_TIMEOUT_NOT_REACHED)
  );
}
