-- Migration 002: Add rebalance_events table for PlayerVault RebalanceBuy/RebalanceSell events

CREATE TABLE IF NOT EXISTS rebalance_events (
    id SERIAL PRIMARY KEY,
    vault_address VARCHAR(42) NOT NULL,
    hand_id BIGINT NOT NULL,
    direction VARCHAR(4) NOT NULL CHECK (direction IN ('buy', 'sell')),
    amount_in NUMERIC(78, 0) NOT NULL,    -- monIn (buy) or tokenIn (sell)
    amount_out NUMERIC(78, 0) NOT NULL,   -- tokenOut (buy) or monOut (sell)
    nav_before NUMERIC(78, 0) NOT NULL,
    nav_after NUMERIC(78, 0) NOT NULL,
    block_number BIGINT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rebalance_vault ON rebalance_events(vault_address);
CREATE INDEX IF NOT EXISTS idx_rebalance_vault_hand ON rebalance_events(vault_address, hand_id);
CREATE INDEX IF NOT EXISTS idx_rebalance_created_at ON rebalance_events(created_at DESC);
