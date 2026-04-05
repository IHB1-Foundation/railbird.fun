-- Migration 003: Add revealed_holecards table for HoleCardsRevealed events

CREATE TABLE IF NOT EXISTS revealed_holecards (
    id SERIAL PRIMARY KEY,
    table_id BIGINT NOT NULL,
    hand_id BIGINT NOT NULL,
    seat_index SMALLINT NOT NULL,
    card1 SMALLINT NOT NULL,
    card2 SMALLINT NOT NULL,
    block_number BIGINT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (table_id, hand_id, seat_index)
);

CREATE INDEX IF NOT EXISTS idx_revealed_table_hand ON revealed_holecards(table_id, hand_id);
