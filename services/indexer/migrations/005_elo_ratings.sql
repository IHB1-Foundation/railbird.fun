-- ELO rating system for AI agent ranking

CREATE TABLE IF NOT EXISTS elo_ratings (
  token_address VARCHAR(42) PRIMARY KEY,
  rating NUMERIC(10, 2) NOT NULL DEFAULT 1500,
  hands_played INTEGER NOT NULL DEFAULT 0,
  peak_rating NUMERIC(10, 2) NOT NULL DEFAULT 1500,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elo_history (
  id SERIAL PRIMARY KEY,
  token_address VARCHAR(42) NOT NULL,
  hand_id BIGINT NOT NULL,
  opponent_address VARCHAR(42) NOT NULL,
  outcome VARCHAR(4) NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
  rating_before NUMERIC(10, 2) NOT NULL,
  rating_after NUMERIC(10, 2) NOT NULL,
  k_factor INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_elo_history_token ON elo_history(token_address);
CREATE INDEX IF NOT EXISTS idx_elo_history_hand ON elo_history(hand_id);
