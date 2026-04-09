-- Migration 009: Add composite indexes for common query patterns

-- Covering index for per-seat action lookup within a hand
-- (used by hand history, seat-level stats, audit queries)
CREATE INDEX IF NOT EXISTS idx_actions_hand_seat
  ON actions (table_id, hand_id, seat_index);

-- Allow fast lookup of recently settled hands per table
CREATE INDEX IF NOT EXISTS idx_hands_settled_at
  ON hands (table_id, settled_at DESC NULLS LAST);

-- Speed up per-winner settlement queries
CREATE INDEX IF NOT EXISTS idx_settlements_winner
  ON settlements (table_id, winner_seat);
