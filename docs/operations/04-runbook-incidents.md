# 04 — Incidents runbook

> What to do when something is on fire. Each section is "symptom → likely
> cause → first actions → escalation". Pages from Better Stack Uptime
> (T-1405) link here via the alert template.

## Web app down

**Symptom**: Vercel home page returns 5xx, Better Stack reports `web` down.

1. Check Vercel project deployments page — is the latest deploy `Failed` or
   `Building`?
2. If a recent push: revert via Vercel "Promote previous deployment".
3. If Vercel infra issue: status.vercel.com.

## Indexer block lag spike

**Symptom**: `railbird_indexer_block_lag` > 60 s for > 5 min on the Grafana
indexer dashboard.

1. Check RPC connectivity: `curl $RPC_URL --data '{"jsonrpc":"2.0","method":"eth_chainId","id":1}'`.
2. If RPC is degraded, switch to fallback RPC by updating `RPC_URL` in
   Railway and redeploying. The retry wrapper (T-1501) will resume.
3. If RPC is healthy, check Postgres pool exhaustion:
   `railbird_pg_pool_waiting_count > 0`.
4. If pool is exhausted, scale Railway service to 2 replicas temporarily.

## Reorg detected

**Symptom**: `railbird_indexer_reorg_total` increments, alert from Grafana.

1. T-1502 reorg-rollback runs automatically. Verify in indexer logs:
   `grep "reorg detected"`.
2. Confirm `last_processed_block` resumes advancing within 60 s.
3. If rollback exceeds depth 5, escalate — likely RPC switching networks.

## OwnerView auth failures spike

**Symptom**: `railbird_auth_attempts_total{outcome="failure"}` > 50/min.

1. Check `railbird_auth_rate_limited_total` — if rising, this is healthy
   (rate limiter doing its job). Investigate the source IPs from
   `auth_events` table (T-1304).
2. If failures are not rate-limited, check `JWT_SECRET` rotation timing
   and Railway env consistency.

## Database rollback

**Symptom**: A bad migration shipped to prod.

1. Restore the most recent backup: `bash scripts/db/restore.sh <backup-file>`
   (T-1507). RTO: 30 min. RPO: 1 h.
2. Apply the rollback migration: `services/indexer/migrations/down/NNN_*.sql`.
3. Pin the indexer image to the prior tag in Railway until the schema
   forward path is fixed.
4. Postmortem within 24 h.

## Agent bot crashloop

**Symptom**: `railbird_fleet_agent_restarts_total{agentId="…"}` > 5 in 5 min.

1. Tail Railway logs for that agent. Common causes:
   - Gemini API quota exceeded (`GEMINI_TIMEOUT_MS` exhausted).
   - Operator wallet underfunded — keeper top-up failing.
2. The fleet bulkhead (T-1905) keeps other agents healthy; you have time.
3. Stop the agent via `DELETE /fleet/agents/<id>` once root cause is known,
   restart with `POST /fleet/agents` after fixing.

## Side-bet pool stuck unsettled

**Symptom**: `/api/sidebets/leaderboard` shows old hand IDs.

1. Verify the keeper bot is processing settle events: indexer log
   `SettlementProcessed`.
2. If keeper is stuck, restart it. Last-resort manual settle:
   `cast send <pool> "settle(uint256)" <handId>` from operator wallet.

## Escalation

- Sentry release marker + Grafana panel snapshot in the incident channel.
- Ping on-call (rotation in [`uptime-setup.md`](../observability/uptime-setup.md)).
- File a postmortem ticket once the system is healthy.
