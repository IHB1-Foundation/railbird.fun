// N-5: ABI version management utilities
// Provides deterministic hashes of committed ABIs for drift detection at startup.

import { createHash } from "node:crypto";

import { POKER_TABLE_ABI } from "./abis/pokerTable.js";
import { PLAYER_REGISTRY_ABI } from "./abis/playerRegistry.js";
import { PLAYER_VAULT_ABI } from "./abis/playerVault.js";
import { SIDE_BET_POOL_ABI } from "./abis/sideBetPool.js";

/**
 * Compute a deterministic SHA-256 hash of an ABI array.
 * Uses canonical JSON serialization (sorted keys) for stability across runtimes.
 */
export function computeAbiHash(abi: readonly object[]): string {
  const canonical = JSON.stringify(
    abi.map((entry) =>
      Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      )
    )
  );
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** Pre-computed hashes of the committed ABIs (truncated to 16 hex chars = 64 bits). */
export const ABI_HASHES = {
  POKER_TABLE:     computeAbiHash(POKER_TABLE_ABI),
  PLAYER_REGISTRY: computeAbiHash(PLAYER_REGISTRY_ABI),
  PLAYER_VAULT:    computeAbiHash(PLAYER_VAULT_ABI),
  SIDE_BET_POOL:   computeAbiHash(SIDE_BET_POOL_ABI),
} as const;

export type AbiName = keyof typeof ABI_HASHES;

/**
 * Log ABI hashes at startup for observability.
 * Operators can compare these against expected hashes in deployment runbooks.
 * If hashes change unexpectedly, ABIs may be out of sync with deployed contracts.
 *
 * @param logger  Object with an `info` method (compatible with `createLogger`)
 * @param names   Subset of ABI names to log (default: all)
 */
export function logAbiVersions(
  logger: { info: (obj: Record<string, unknown>, msg: string) => void },
  names: AbiName[] = Object.keys(ABI_HASHES) as AbiName[]
): void {
  const hashes: Record<string, string> = {};
  for (const name of names) {
    hashes[name] = ABI_HASHES[name];
  }
  logger.info({ abiHashes: hashes }, "[ABI-VERSION] Committed ABI hashes at startup");
}
