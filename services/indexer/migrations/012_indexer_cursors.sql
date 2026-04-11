-- Cursor table for per-contract indexer resume
-- Stores the last successfully indexed block per contract address.
-- On restart, the indexer reads max(cursor, START_BLOCK) to avoid re-processing.
CREATE TABLE IF NOT EXISTS indexer_cursors (
  contract_address TEXT        PRIMARY KEY,
  last_block       BIGINT      NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
