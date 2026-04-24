-- T-1902: performance indexes from slow-query review.
--
-- Methodology: walked every query in services/indexer/src/db/repository.ts
-- and noted patterns whose existing indexes were either missing or did not
-- match the query shape (e.g. ORDER BY column not in the index, composite
-- (a, b) wanted instead of (a)). Each index below cites the query it serves.

-- agents pagination/listing — `SELECT … FROM agents WHERE is_registered = true
-- ORDER BY created_at DESC LIMIT … OFFSET …`. Existing indexes only cover
-- owner/table/vault. Partial index keeps it small for the common true case.
CREATE INDEX IF NOT EXISTS idx_agents_registered_created_at
    ON agents(created_at DESC)
    WHERE is_registered = true;

-- vault snapshot reverse-chronological lookups by vault.
-- Used by getLatestVaultSnapshot and getVaultSnapshots — both ORDER BY
-- block_number DESC, id DESC. The existing idx_vault_snapshots_vault is
-- unsorted; this composite avoids a re-sort.
CREATE INDEX IF NOT EXISTS idx_vault_snapshots_vault_block
    ON vault_snapshots(vault_address, block_number DESC, id DESC);

-- vault snapshots filtered by created_at (period queries in the leaderboard).
CREATE INDEX IF NOT EXISTS idx_vault_snapshots_created_at
    ON vault_snapshots(vault_address, created_at);

-- ELO leaderboard / lookups — getEloLeaderboard ORDERs by rating DESC.
CREATE INDEX IF NOT EXISTS idx_elo_ratings_rating_desc
    ON elo_ratings(rating DESC);

-- decision_audit verified lookups for the audit endpoint.
-- The table currently stores only a boolean verified flag (no verified_at
-- timestamp), so keep the composite index aligned to the live schema.
CREATE INDEX IF NOT EXISTS idx_decision_audit_table_hand_verified
    ON decision_audit (table_address, hand_id, verified);

-- side_bets claim history queries filter by bettor + table + hand and then
-- return rows in insertion order.
CREATE INDEX IF NOT EXISTS idx_side_bet_settlements_bettor_hand
    ON side_bets (bettor, table_address, hand_id, id);

-- auth_events — IP rate-decay queries scan recent rows.
-- Already has (ip, created_at DESC); add (outcome, created_at DESC) for
-- failure-rate alerts in T-1304.
CREATE INDEX IF NOT EXISTS idx_auth_events_outcome
    ON auth_events (outcome, created_at DESC);
