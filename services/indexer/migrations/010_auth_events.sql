-- Auth events audit log
-- Records every auth attempt (success/failure) for security auditing.
-- Rotates automatically after 90 days via the TTL cleanup job.
CREATE TABLE IF NOT EXISTS auth_events (
  id          BIGSERIAL PRIMARY KEY,
  ip          TEXT        NOT NULL,
  path        TEXT        NOT NULL,
  address     TEXT,
  outcome     TEXT        NOT NULL CHECK (outcome IN ('success', 'failure', 'blocked')),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by address and recent events
CREATE INDEX IF NOT EXISTS auth_events_address_idx ON auth_events (address, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_events_ip_idx      ON auth_events (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_events_created_idx ON auth_events (created_at DESC);
