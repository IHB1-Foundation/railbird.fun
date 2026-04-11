-- Block tracking table for reorg detection
-- Records each indexed block's hash and parent hash.
-- On startup, the indexer validates parent_hash continuity.
-- If a gap is detected, it rolls back affected rows and re-indexes.
CREATE TABLE IF NOT EXISTS indexed_blocks (
  number      BIGINT      PRIMARY KEY,
  hash        TEXT        NOT NULL,
  parent_hash TEXT        NOT NULL,
  indexed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS indexed_blocks_hash_idx ON indexed_blocks (hash);
