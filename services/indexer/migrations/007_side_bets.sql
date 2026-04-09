-- Migration 007: Side bet pools and decision audit trail (T-1201, T-1206)

-- Side bets placed by spectators
CREATE TABLE IF NOT EXISTS side_bets (
  id            BIGSERIAL PRIMARY KEY,
  pool_key      TEXT      NOT NULL,
  table_address TEXT      NOT NULL,
  hand_id       TEXT      NOT NULL,
  bettor        TEXT      NOT NULL,
  seat_index    SMALLINT  NOT NULL,
  amount        NUMERIC   NOT NULL,
  tx_hash       TEXT      NOT NULL,
  block_number  BIGINT    NOT NULL,
  timestamp     BIGINT    NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_side_bets_pool_key   ON side_bets (pool_key);
CREATE INDEX IF NOT EXISTS idx_side_bets_bettor      ON side_bets (bettor);
CREATE INDEX IF NOT EXISTS idx_side_bets_table_hand  ON side_bets (table_address, hand_id);

-- Side bet pool settlements
CREATE TABLE IF NOT EXISTS side_bet_settlements (
  id            BIGSERIAL PRIMARY KEY,
  pool_key      TEXT      NOT NULL UNIQUE,
  table_address TEXT      NOT NULL,
  hand_id       TEXT      NOT NULL,
  winner_seat   SMALLINT  NOT NULL,
  total_pool    NUMERIC   NOT NULL,
  tx_hash       TEXT      NOT NULL,
  block_number  BIGINT    NOT NULL,
  settled_at    BIGINT    NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_side_bet_settlements_table ON side_bet_settlements (table_address, hand_id);

-- On-chain AI decision audit trail (T-1206)
CREATE TABLE IF NOT EXISTS decision_audit (
  id              BIGSERIAL PRIMARY KEY,
  table_address   TEXT      NOT NULL,
  hand_id         TEXT      NOT NULL,
  seat_index      SMALLINT  NOT NULL,
  reasoning_hash  TEXT      NOT NULL,
  commit_tx_hash  TEXT      NOT NULL,
  block_number    BIGINT    NOT NULL,
  verified        BOOLEAN   DEFAULT FALSE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_audit_table_hand ON decision_audit (table_address, hand_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_audit_unique ON decision_audit (table_address, hand_id, seat_index);


