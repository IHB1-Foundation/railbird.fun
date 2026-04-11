-- Rollback 005_elo_ratings.sql
DROP TABLE IF EXISTS elo_history CASCADE;
DROP TABLE IF EXISTS elo_ratings CASCADE;
