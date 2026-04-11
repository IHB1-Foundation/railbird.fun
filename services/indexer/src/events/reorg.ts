/**
 * Chain reorg detection and rollback for the indexer.
 *
 * On each new batch, we store (block_number, hash, parent_hash) in indexed_blocks.
 * Before inserting a new block, we validate that its parent_hash matches the
 * previous block's hash. A mismatch signals a reorg.
 *
 * On reorg detection:
 * 1. Walk backwards to find the common ancestor
 * 2. Delete all indexed_blocks and application data at block >= fork point
 * 3. Return the fork block number so the listener can restart from there
 */

import type { Pool } from "pg";
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "indexer-reorg" });

export interface BlockRecord {
  number: bigint;
  hash: string;
  parentHash: string;
}

/**
 * Save a block to the indexed_blocks table.
 */
export async function saveIndexedBlock(pool: Pool, block: BlockRecord): Promise<void> {
  await pool.query(
    `INSERT INTO indexed_blocks (number, hash, parent_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (number) DO UPDATE
       SET hash = EXCLUDED.hash,
           parent_hash = EXCLUDED.parent_hash,
           indexed_at = NOW()`,
    [block.number.toString(), block.hash, block.parentHash]
  );
}

/**
 * Get the stored block record for a given block number, if any.
 */
export async function getIndexedBlock(pool: Pool, number: bigint): Promise<BlockRecord | null> {
  const result = await pool.query<{ number: string; hash: string; parent_hash: string }>(
    `SELECT number, hash, parent_hash FROM indexed_blocks WHERE number = $1`,
    [number.toString()]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { number: BigInt(row.number), hash: row.hash, parentHash: row.parent_hash };
}

/**
 * Get the highest indexed block number, or null if no blocks are stored.
 */
export async function getHighestIndexedBlock(pool: Pool): Promise<bigint | null> {
  const result = await pool.query<{ max: string | null }>(
    `SELECT MAX(number) as max FROM indexed_blocks`
  );
  const max = result.rows[0]?.max;
  return max != null ? BigInt(max) : null;
}

/**
 * Tables that have a block_number column and should be rolled back on reorg.
 * Add to this list as new tables with block_number are created.
 */
const ROLLBACK_TABLES = [
  "hands",
  "events",
  "auth_events",
  "indexed_blocks",
];

/**
 * Delete all rows with block_number >= forkBlock from rollback tables.
 * Runs in a single transaction for atomicity.
 */
async function rollbackFromBlock(pool: Pool, forkBlock: bigint): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of ROLLBACK_TABLES) {
      // Only rollback tables that have block_number column
      await client.query(
        `DELETE FROM ${table} WHERE block_number >= $1`,
        [forkBlock.toString()]
      ).catch(() => {
        // Table may not have block_number column — skip silently
      });
    }
    await client.query("COMMIT");
    logger.info({ forkBlock: forkBlock.toString() }, "Reorg rollback committed");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Detect and handle a chain reorg.
 *
 * @param pool        Postgres connection pool
 * @param newBlock    Newly observed block (number, hash, parentHash)
 * @returns           null if no reorg, or the block number to restart from
 */
export async function detectAndHandleReorg(
  pool: Pool,
  newBlock: BlockRecord
): Promise<bigint | null> {
  if (newBlock.number === 0n) return null;

  const prevBlock = await getIndexedBlock(pool, newBlock.number - 1n);
  if (!prevBlock) {
    // No previous block stored — can't detect reorg, proceed normally
    return null;
  }

  if (prevBlock.hash === newBlock.parentHash) {
    // Chain is continuous — no reorg
    return null;
  }

  // Reorg detected — find common ancestor
  logger.warn(
    {
      expectedParent: prevBlock.hash,
      actualParent: newBlock.parentHash,
      blockNumber: newBlock.number.toString(),
    },
    "Reorg detected — rolling back"
  );

  // Walk back to find the fork point (max 100 blocks back)
  let forkBlock = newBlock.number - 1n;
  for (let depth = 0; depth < 100; depth++) {
    const stored = await getIndexedBlock(pool, forkBlock);
    if (!stored) break;
    // Check if this block matches what the chain reports
    // We use parentHash of newBlock as the expected chain head
    // Simple heuristic: fork point is where our chain diverges
    if (stored.parentHash === newBlock.parentHash) {
      break;
    }
    forkBlock = stored.number - 1n;
    if (forkBlock < 0n) break;
  }

  logger.info({ forkBlock: forkBlock.toString() }, "Rolling back to fork block");

  await rollbackFromBlock(pool, forkBlock);

  return forkBlock;
}
