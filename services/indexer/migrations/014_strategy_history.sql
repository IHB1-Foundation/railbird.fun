-- Strategy history table for on-chain PlayerRegistry strategy updates.
CREATE TABLE IF NOT EXISTS strategy_history (
    id SERIAL PRIMARY KEY,
    agent VARCHAR(42) NOT NULL,
    version BIGINT NOT NULL,
    config_hash VARCHAR(66) NOT NULL,
    persona_id TEXT NOT NULL,
    aggression_bps SMALLINT NOT NULL,
    tightness_bps SMALLINT NOT NULL,
    bluff_freq_bps SMALLINT NOT NULL,
    block_number BIGINT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_history_agent ON strategy_history(agent);
CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_history_agent_version ON strategy_history(agent, version);
