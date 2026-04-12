# Load Test Baseline Results

> **Status**: Initial baseline — awaiting staging environment to run against production-like setup.
> See `scripts/load/` for k6 scripts.

## Environment

| Parameter | Value |
|-----------|-------|
| Test tool | k6 |
| Target | local / staging (Railway) |
| Infra | 1x Railway container per service |
| DB | PostgreSQL 15 (Railway) |

---

## Scenario 1: Indexer WebSocket (`k6-indexer-ws.js`)

**Command**:
```bash
k6 run --env INDEXER_WS_URL=wss://indexer.railbird.fun/ws scripts/load/k6-indexer-ws.js
```

**SLO Targets**:
- P99 message latency < 1s
- Connection error rate < 50 total
- Message drop rate < 1%

**Baseline** (to be updated after first run):
| Metric | Value | SLO |
|--------|-------|-----|
| P50 latency | — | — |
| P95 latency | — | — |
| P99 latency | — | < 1s |
| Connection errors | — | < 50 |
| Drop rate | — | < 1% |
| Max concurrent VUs | 500 | 500 |

---

## Scenario 2: Auth Endpoints (`k6-auth.js`)

**Command**:
```bash
k6 run --env OWNERVIEW_URL=https://ownerview.railbird.fun scripts/load/k6-auth.js
```

**SLO Targets**:
- P95 `/auth/nonce` latency < 500ms
- Server error rate < 5%
- Rate limiter fires at correct threshold (429 at > 10 req/min per IP)

**Baseline**:
| Metric | Value | SLO |
|--------|-------|-----|
| P50 nonce latency | — | — |
| P95 nonce latency | — | < 500ms |
| Server error rate | — | < 5% |
| Rate limit triggers | — | ≥ 10 req/min |

---

## Scenario 3: SideBet Flow (`k6-sidebet.js`)

**Command**:
```bash
k6 run --env INDEXER_URL=https://indexer.railbird.fun scripts/load/k6-sidebet.js
```

**SLO Targets**:
- P95 sidebet read latency < 2s
- Success rate > 85%
- Hard error count < 100

**Baseline**:
| Metric | Value | SLO |
|--------|-------|-----|
| P50 latency | — | — |
| P95 latency | — | < 2s |
| Success rate | — | > 85% |
| Error count | — | < 100 |

---

## Identified Bottlenecks

> To be filled in after first staging run.

Known candidates based on code review:
1. **WebSocket broadcast fan-out** — O(n) loop over all clients; consider batching (T-1906)
2. **Leaderboard query** — full table scan without Redis cache (T-1901)
3. **Auth nonce generation** — DB write per request; consider in-memory nonce store with TTL

---

## How to Run

### Prerequisites
```bash
brew install k6   # macOS
# or
sudo apt install k6  # Ubuntu (add grafana repo first)
```

### Quick local test (smoke, 10 VUs)
```bash
# Start local stack first
cd scripts && ./ci-e2e.sh 3 &

# Then run reduced load
k6 run --vus 10 --duration 30s \
  --env INDEXER_WS_URL=ws://localhost:3100/ws \
  scripts/load/k6-indexer-ws.js
```

### Full staging run
```bash
# Auth
k6 run --env OWNERVIEW_URL=https://ownerview.railbird.fun scripts/load/k6-auth.js

# WebSocket
k6 run --env INDEXER_WS_URL=wss://indexer.railbird.fun/ws scripts/load/k6-indexer-ws.js

# SideBet reads
k6 run --env INDEXER_URL=https://indexer.railbird.fun scripts/load/k6-sidebet.js
```

---

## CI Integration

Load tests are **NOT** run on every CI push. They are manual-trigger only:

```yaml
# In .github/workflows/ci.yml, the load test job runs only on workflow_dispatch
# or scheduled (weekly) to establish a performance regression baseline.
```

To add a scheduled baseline run, uncomment the `load-test` job in `.github/workflows/ci.yml`
and configure `INDEXER_WS_URL`, `OWNERVIEW_URL` as repository secrets.
