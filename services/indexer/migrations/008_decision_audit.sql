-- T-1206: On-chain AI decision audit trail
-- Stores the keccak256 reasoning hash committed on-chain per decision,
-- enabling post-hoc verification of AI reasoning.

CREATE TABLE IF NOT EXISTS decision_audit (
  id                BIGSERIAL PRIMARY KEY,
  table_address     TEXT NOT NULL,
  hand_id           NUMERIC NOT NULL,
  seat_index        SMALLINT NOT NULL,
  reasoning_hash    TEXT NOT NULL,
  commit_tx_hash    TEXT NOT NULL,
  block_number      NUMERIC NOT NULL,
  verified          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (table_address, hand_id, seat_index)
);

CREATE INDEX IF NOT EXISTS idx_decision_audit_table_hand
  ON decision_audit (table_address, hand_id);

CREATE INDEX IF NOT EXISTS idx_decision_audit_verified
  ON decision_audit (verified);
