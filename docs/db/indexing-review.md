# Indexing review (T-1902)

> Living document. Update when a new slow-query report turns up something
> the existing indexes don't cover.

## How to capture a new slow-query baseline

```bash
# 1. Ensure pg_stat_statements is on (the script enables it idempotently).
DB_HOST=… DB_USER=… DB_PASS=… DB_NAME=… bash scripts/db/slow-queries.sh 30
```

The output is sorted by `mean_exec_time DESC`. Anything with `mean_ms > 100`
should either get an index, a query rewrite, or a cached path (T-1901).

## 2026-04-12 baseline

| Query                                                                               | Symptom                               | Action                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| `SELECT … FROM agents WHERE is_registered ORDER BY created_at`                      | Seq scan; ~80 ms with 5k agents       | Added `idx_agents_registered_created_at` (partial). |
| `SELECT … FROM vault_snapshots WHERE vault_address = $1 ORDER BY block_number DESC` | Index hit + sort step; ~120 ms        | Added composite `idx_vault_snapshots_vault_block`.  |
| `SELECT … FROM vault_snapshots … created_at >= $2`                                  | Period leaderboard; bitmap scan       | Added `idx_vault_snapshots_created_at`.             |
| `SELECT … FROM elo_ratings ORDER BY rating DESC`                                    | Sort step on every leaderboard render | Added `idx_elo_ratings_rating_desc`.                |
| `SELECT … FROM decision_audit WHERE table_address … hand_id`                        | Composite + verified DESC ordering    | Added `idx_decision_audit_table_hand_verified`.     |
| `SELECT … FROM side_bet_settlements WHERE bettor`                                   | Bettor claim flow                     | Added `idx_side_bet_settlements_bettor_hand`.       |
| `auth_events` failure-rate scan                                                     | Rate-of-failure alert query           | Added `idx_auth_events_outcome`.                    |

All of the above ship in
[`013_perf_indexes.sql`](../../services/indexer/migrations/013_perf_indexes.sql)
with a matching down file.

## Notes

- T-1901's leaderboard cache (10 s TTL) buries some of these costs but the
  underlying queries still run on every miss; the indexes win on the
  cold-cache path.
- Future scans are tracked here. If a query has its own dedicated cache, the
  table also gets a comment in the migration explaining why it's not
  blocking.
