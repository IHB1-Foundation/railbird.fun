-- PlayerCo Indexer Database Schema
-- Designed for idempotent event ingestion and public REST API

-- ============ Event Tracking ============
-- Used to ensure idempotent event processing

CREATE TABLE IF NOT EXISTS indexer_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_block BIGINT NOT NULL DEFAULT 0,
    last_processed_log_index INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS processed_events (
    block_number BIGINT NOT NULL,
    log_index INTEGER NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    event_name VARCHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (block_number, log_index)
);

-- ============ Tables (Poker Tables) ============

CREATE TABLE IF NOT EXISTS poker_tables (
    table_id BIGINT PRIMARY KEY,
    contract_address VARCHAR(42) NOT NULL,
    small_blind NUMERIC(78, 0) NOT NULL,
    big_blind NUMERIC(78, 0) NOT NULL,
    current_hand_id BIGINT DEFAULT 0,
    game_state VARCHAR(32) NOT NULL DEFAULT 'WAITING_FOR_SEATS',
    button_seat SMALLINT DEFAULT 0,
    action_deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_tables_state ON poker_tables(game_state);

-- ============ Seats ============

CREATE TABLE IF NOT EXISTS seats (
    table_id BIGINT NOT NULL REFERENCES poker_tables(table_id),
    seat_index SMALLINT NOT NULL,
    owner_address VARCHAR(42) NOT NULL,
    operator_address VARCHAR(42) NOT NULL,
    stack NUMERIC(78, 0) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    current_bet NUMERIC(78, 0) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (table_id, seat_index)
);

CREATE INDEX IF NOT EXISTS idx_seats_owner ON seats(owner_address);

-- ============ Hands ============

CREATE TABLE IF NOT EXISTS hands (
    hand_id BIGINT NOT NULL,
    table_id BIGINT NOT NULL REFERENCES poker_tables(table_id),
    pot NUMERIC(78, 0) NOT NULL DEFAULT 0,
    current_bet NUMERIC(78, 0) DEFAULT 0,
    actor_seat SMALLINT,
    game_state VARCHAR(32) NOT NULL,
    button_seat SMALLINT NOT NULL,
    small_blind NUMERIC(78, 0) NOT NULL,
    big_blind NUMERIC(78, 0) NOT NULL,
    community_cards SMALLINT[] DEFAULT ARRAY[]::SMALLINT[],
    winner_seat SMALLINT,
    settlement_amount NUMERIC(78, 0),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (table_id, hand_id)
);

CREATE INDEX IF NOT EXISTS idx_hands_table ON hands(table_id);
CREATE INDEX IF NOT EXISTS idx_hands_state ON hands(game_state);

-- ============ Actions ============

CREATE TABLE IF NOT EXISTS actions (
    id SERIAL PRIMARY KEY,
    table_id BIGINT NOT NULL,
    hand_id BIGINT NOT NULL,
    seat_index SMALLINT NOT NULL,
    action_type VARCHAR(16) NOT NULL,
    amount NUMERIC(78, 0) DEFAULT 0,
    pot_after NUMERIC(78, 0) NOT NULL,
    block_number BIGINT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (table_id, hand_id) REFERENCES hands(table_id, hand_id)
);

CREATE INDEX IF NOT EXISTS idx_actions_hand ON actions(table_id, hand_id);
CREATE INDEX IF NOT EXISTS idx_actions_block ON actions(block_number);

-- ============ VRF Requests ============

CREATE TABLE IF NOT EXISTS vrf_requests (
    request_id BIGINT PRIMARY KEY,
    table_id BIGINT NOT NULL REFERENCES poker_tables(table_id),
    hand_id BIGINT NOT NULL,
    street VARCHAR(32) NOT NULL,
    status VARCHAR(16) DEFAULT 'pending',
    randomness NUMERIC(78, 0),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fulfilled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_vrf_table ON vrf_requests(table_id, hand_id);

-- ============ Agents ============

CREATE TABLE IF NOT EXISTS agents (
    token_address VARCHAR(42) PRIMARY KEY,
    vault_address VARCHAR(42),
    table_address VARCHAR(42),
    owner_address VARCHAR(42) NOT NULL,
    operator_address VARCHAR(42) NOT NULL,
    meta_uri TEXT,
    is_registered BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_address);
CREATE INDEX IF NOT EXISTS idx_agents_table ON agents(table_address);

-- ============ Vault Snapshots ============

CREATE TABLE IF NOT EXISTS vault_snapshots (
    id SERIAL PRIMARY KEY,
    vault_address VARCHAR(42) NOT NULL,
    hand_id BIGINT NOT NULL,
    external_assets NUMERIC(78, 0) NOT NULL,
    treasury_shares NUMERIC(78, 0) NOT NULL,
    outstanding_shares NUMERIC(78, 0) NOT NULL,
    nav_per_share NUMERIC(78, 0) NOT NULL,
    cumulative_pnl NUMERIC(78, 0) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_snapshots_vault ON vault_snapshots(vault_address);
CREATE INDEX IF NOT EXISTS idx_vault_snapshots_hand ON vault_snapshots(hand_id);

-- ============ Settlements ============

CREATE TABLE IF NOT EXISTS settlements (
    id SERIAL PRIMARY KEY,
    table_id BIGINT NOT NULL,
    hand_id BIGINT NOT NULL,
    winner_seat SMALLINT NOT NULL,
    pot_amount NUMERIC(78, 0) NOT NULL,
    block_number BIGINT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (table_id, hand_id) REFERENCES hands(table_id, hand_id)
);

CREATE INDEX IF NOT EXISTS idx_settlements_hand ON settlements(table_id, hand_id);

-- ============ Initialization ============

INSERT INTO indexer_state (id, last_processed_block, last_processed_log_index)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;
