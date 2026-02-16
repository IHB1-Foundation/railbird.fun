// Database flush script

import { getPool, closePool } from "./pool.js";

async function flush(): Promise<void> {
  console.log("Flushing indexer database tables...");
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

    console.log("Database flush completed");
  } catch (error) {
    console.error("Database flush failed:", error);
    throw error;
  } finally {
    await closePool();
  }
}

flush().catch((err) => {
  console.error(err);
  process.exit(1);
});
