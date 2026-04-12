-- Rollback for 013_perf_indexes.sql
DROP INDEX IF EXISTS idx_auth_events_outcome;
DROP INDEX IF EXISTS idx_side_bet_settlements_bettor_hand;
DROP INDEX IF EXISTS idx_decision_audit_table_hand_verified;
DROP INDEX IF EXISTS idx_elo_ratings_rating_desc;
DROP INDEX IF EXISTS idx_vault_snapshots_created_at;
DROP INDEX IF EXISTS idx_vault_snapshots_vault_block;
DROP INDEX IF EXISTS idx_agents_registered_created_at;
