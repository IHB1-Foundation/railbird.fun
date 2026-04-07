-- Migration 004: Add index on hands.settled_at for faster recent settlement queries
-- Supports common queries like "hands settled in the last 24h" and leaderboard computations.

CREATE INDEX IF NOT EXISTS idx_hands_settled_at ON hands(settled_at)
    WHERE settled_at IS NOT NULL;
