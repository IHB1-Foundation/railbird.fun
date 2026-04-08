-- Migration: AI decision on-chain verification records
-- Stores DecisionRevealed events from PokerTable.sol.
-- When an AI operator reveals a committed decision, we store it here
-- and join with actions to provide verified=true on ActionResponse.

CREATE TABLE IF NOT EXISTS decision_verifications (
    id SERIAL PRIMARY KEY,
    table_id BIGINT NOT NULL,
    hand_id BIGINT NOT NULL,
    seat_index SMALLINT NOT NULL,
    action VARCHAR(32) NOT NULL,
    reasoning TEXT NOT NULL DEFAULT '',
    reveal_tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (table_id, hand_id, seat_index)
);

CREATE INDEX IF NOT EXISTS idx_decision_verifications_hand
    ON decision_verifications(table_id, hand_id);
