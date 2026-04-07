// Database flush script

import { getPool, closePool } from "./pool.js";
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "indexer" });

async function flush(): Promise<void> {
  logger.info("Flushing indexer database tables...");
  const pool = getPool();

  try {
    await pool.query(`
      TRUNCATE TABLE
        settlements,
        vault_snapshots,
        vrf_requests,
        actions,
        hands,
        seats,
        agents,
        processed_events,
        poker_tables,
        indexer_state
      RESTART IDENTITY CASCADE
    `);

    await pool.query(
      `INSERT INTO indexer_state (id, last_processed_block, last_processed_log_index)
       VALUES (1, 0, 0)
       ON CONFLICT (id) DO UPDATE SET
         last_processed_block = EXCLUDED.last_processed_block,
         last_processed_log_index = EXCLUDED.last_processed_log_index,
         updated_at = NOW()`
    );

    logger.info("Database flush completed");
  } catch (error) {
    logger.error({ err: error }, "Database flush failed");
    throw error;
  } finally {
    await closePool();
  }
}

flush().catch((err) => {
  logger.error({ err }, "Flush script failed");
  process.exit(1);
});
