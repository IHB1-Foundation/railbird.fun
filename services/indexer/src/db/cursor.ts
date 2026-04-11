/**
 * Cursor management for cursor-based indexer backfill resume.
 *
 * Each contract address has its own cursor (last successfully indexed block).
 * On restart, the indexer reads max(cursor, START_BLOCK) to avoid re-processing.
 */

import type { Pool } from "pg";

/**
 * Get the last indexed block for a contract address.
 * Returns 0n if no cursor exists (fresh start).
 */
export async function getCursor(pool: Pool, contractAddress: string): Promise<bigint> {
  const result = await pool.query<{ last_block: string }>(
    `SELECT last_block FROM indexer_cursors WHERE contract_address = $1`,
    [contractAddress.toLowerCase()]
  );
  if (result.rows.length === 0) return 0n;
  return BigInt(result.rows[0].last_block);
}

/**
 * Update the cursor for a contract address after successful batch processing.
 * Should be called in the same transaction as the event inserts.
 */
export async function updateCursor(
  pool: Pool,
  contractAddress: string,
  lastBlock: bigint
): Promise<void> {
  await pool.query(
    `INSERT INTO indexer_cursors (contract_address, last_block, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (contract_address) DO UPDATE
       SET last_block = GREATEST(indexer_cursors.last_block, EXCLUDED.last_block),
           updated_at = NOW()`,
    [contractAddress.toLowerCase(), lastBlock.toString()]
  );
}

/**
 * Get the effective start block for a contract.
 * Returns max(cursor, configuredStartBlock).
 *
 * @param pool                Postgres pool
 * @param contractAddress     Contract address
 * @param configuredStartBlock  Configured START_BLOCK (from env or 0n)
 */
export async function getEffectiveStartBlock(
  pool: Pool,
  contractAddress: string,
  configuredStartBlock: bigint
): Promise<bigint> {
  const cursor = await getCursor(pool, contractAddress);
  return cursor > configuredStartBlock ? cursor : configuredStartBlock;
}
