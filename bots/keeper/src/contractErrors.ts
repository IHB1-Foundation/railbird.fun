/**
 * Known PokerTable contract revert reason strings.
 *
 * Centralizing these here means a contract message change only needs one update,
 * and unit tests can import the same constants without duplicating strings.
 *
 * NOTE: If the contracts are migrated to Solidity custom errors (using `error Foo()`)
 * these should be replaced with 4-byte ABI selector matching.
 */
export const CONTRACT_ERRORS = {
  // reRequestVRF
  VRF_TIMEOUT_NOT_REACHED: "VRF timeout not reached",

  // startHand
  CANNOT_START_HAND: "Cannot start hand now",

  // settleShowdown — retry conditions (not fatal)
  NO_REVEALED_HOLE_CARDS: "No revealed hole cards",
  SHOWDOWN_REVEAL_WINDOW_OPEN: "Showdown reveal window open",

  // submitHoleCommit — idempotent duplicate (not fatal)
  COMMITMENT_ALREADY_EXISTS: "Commitment already exists",
} as const;

/**
 * Returns true when the error indicates a known benign race condition
 * on reRequestVRF (another keeper already re-requested).
 */
export function isVrfAlreadyReRequested(error: unknown): boolean {
  return String(error).includes(CONTRACT_ERRORS.VRF_TIMEOUT_NOT_REACHED);
}

/**
 * Returns true when startHand reverts because it is not yet allowed
 * (another keeper already started the hand, or table conditions not met).
 */
export function isCannotStartHand(error: unknown): boolean {
  return String(error).includes(CONTRACT_ERRORS.CANNOT_START_HAND);
}

/**
 * Returns true when settleShowdown should be retried later
 * (hole card reveals still pending or reveal window still open).
 */
export function isSettleShowdownRetriable(error: unknown): boolean {
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
  return String(error).includes(CONTRACT_ERRORS.COMMITMENT_ALREADY_EXISTS);
}
