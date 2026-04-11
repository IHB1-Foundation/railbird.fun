-- Rollback 009_indexes.sql
-- Indexes added: idx_agents_created_at, idx_actions_hand_id, idx_side_bets_*
DROP INDEX IF EXISTS idx_agents_created_at;
DROP INDEX IF EXISTS idx_actions_hand_id;
DROP INDEX IF EXISTS idx_side_bets_hand;
DROP INDEX IF EXISTS idx_side_bets_bettor;
DROP INDEX IF EXISTS idx_side_bet_settlements_hand;
