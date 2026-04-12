# Operational Runbook

> **Moved.** New canonical runbook lives in [`docs/operations/`](./operations/):
>
> - Incidents: [`04-runbook-incidents.md`](./operations/04-runbook-incidents.md)
> - Routine ops: [`05-runbook-routine.md`](./operations/05-runbook-routine.md)
> - SLOs: [`06-slo.md`](./operations/06-slo.md)
>
> This file is preserved for link compatibility — content below may be stale.

This runbook covers common operational scenarios for PlayerCo. Keep it next to the deployment for on-call reference.

---

## 1. Stuck Hand Recovery

### Symptom

Game state is `WAITING_VRF_*` for more than 5 minutes, or `WAITING_FOR_HOLECARDS` for more than 2 minutes.

### Cause — VRF delayed / not fulfilled

```bash
# Check current game state
cast call $POKER_TABLE_ADDRESS "gameState()(uint8)" --rpc-url $RPC_URL

# Re-request VRF (anyone can call this if VRF_TIMEOUT has elapsed)
cast send $POKER_TABLE_ADDRESS "reRequestVRF()" \
  --rpc-url $RPC_URL \
  --private-key $KEEPER_PRIVATE_KEY
```

KeeperBot should call `reRequestVRF()` automatically. If it isn't running, trigger manually.

### Cause — Dealer not responding (WAITING_FOR_HOLECARDS)

```bash
# Check OwnerView health
curl http://ownerview:3001/health

# Trigger a deal manually (requires DEALER_API_KEY)
curl -X POST http://ownerview:3001/dealer/deal \
  -H "Authorization: Bearer $DEALER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tableAddress":"'$POKER_TABLE_ADDRESS'","handId":'$HAND_ID'}'
```

### Cause — Action timeout exceeded

```bash
# Force timeout for the stuck actor (anyone can call if ACTION_TIMEOUT elapsed)
cast send $POKER_TABLE_ADDRESS "forceTimeout()" \
  --rpc-url $RPC_URL \
  --private-key $KEEPER_PRIVATE_KEY
```

---

## 2. VRF Failure Handling

### VRF operator is down

1. Restart `vrf-operator` service (Docker: `docker compose restart vrf-operator`)
2. On restart the bot rescans recent blocks for unfulfilled requests
3. If rescan window was exceeded: set `VRF_OPERATOR_RESCAN_FROM_REQUEST_ID` env var to the missing request ID and restart

### VRF callback never received

```bash
# Check pending VRF requests
cast call $VRF_ADAPTER_ADDRESS "pendingRequests()(uint256[])" --rpc-url $RPC_URL

# Check specific request
cast call $VRF_ADAPTER_ADDRESS "requests(uint256)((uint256,address,uint8,bool))" \
  --rpc-url $RPC_URL -- $REQUEST_ID
```

If a request is confirmed pending but unresponsive, call `reRequestVRF()` from the PokerTable contract (see section 1).

---

## 3. Key Rotation

### JWT Secret rotation (OwnerView)

1. Generate a new secret: `openssl rand -hex 32`
2. All existing JWT tokens will be immediately invalidated — users must re-authenticate
3. Update `JWT_SECRET` env var
4. Rolling restart OwnerView service (brief downtime for authenticated users only)

### Dealer API Key rotation (OwnerView ↔ Keeper)

1. Generate a new key: `openssl rand -hex 32`
2. Update `DEALER_API_KEY` in OwnerView **and** Keeper bot configs simultaneously
3. Rolling restart both services

### Operator private key rotation (Agent / Keeper / VRF)

1. Generate new wallet: `cast wallet new`
2. Fund new address with gas
3. For PokerTable seats: call `updateSeatOperator(seatIndex, newOperator)` as seat owner
4. For VRF Adapter: call `updateOperator(newOperator)` as admin
5. Update `OPERATOR_PRIVATE_KEY` / `KEEPER_PRIVATE_KEY` / `VRF_OPERATOR_PRIVATE_KEY` env vars
6. Restart affected services

---

## 4. Database Backup and Restore (Indexer)

### Backup

```bash
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -f backup-$(date +%Y%m%d-%H%M%S).dump
```

### Restore

```bash
# Stop indexer first to avoid write conflicts
docker compose stop indexer

pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME -F c backup.dump

# Restart indexer (INDEXER_FLUSH_ON_START=false to keep restored data)
INDEXER_FLUSH_ON_START=false docker compose start indexer
```

### Re-index from scratch

```bash
# WARNING: destroys all indexed data — resync from chain
INDEXER_FLUSH_ON_START=true START_BLOCK=0 docker compose restart indexer
```

---

## 5. Monitoring Setup

### Key metrics to watch

- `vrf-operator` health: `GET http://vrf-operator:9102/health`
- `keeper-bot` health: `GET http://keeper:9101/health`
- `agent-bot` health: `GET http://agent:9100/health`
- `ownerview` health: `GET http://ownerview:3001/health`
- `indexer` health: `GET http://indexer:3002/health`

### Alerting thresholds

| Service      | Alert when                                             |
| ------------ | ------------------------------------------------------ |
| VRF operator | Health returns non-200 for > 60s                       |
| Keeper bot   | Health returns non-200 for > 60s                       |
| Indexer      | Health returns non-200 for > 60s, or DB pool exhausted |
| OwnerView    | Health returns non-200 for > 30s (player auth blocked) |

### Structured log fields to monitor

All services emit pino-format JSON logs. Key fields:

- `level: "error"` — any error log warrants investigation
- `consecutiveErrors` — circuit breaker tracking (indexer listener)
- `circuitOpen: true` — indexer has stopped processing; manual intervention needed

---

## 6. Emergency Pause

### Pause the table (stops new hands, allows settlements)

```bash
cast send $POKER_TABLE_ADDRESS "pause()" \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY
```

### Unpause

```bash
cast send $POKER_TABLE_ADDRESS "unpause()" \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY
```

### Emergency withdrawal (after 7-day timelock)

Step 1 — Request (seat owner calls):

```bash
cast send $POKER_TABLE_ADDRESS "requestEmergencyWithdraw(uint8)" $SEAT_INDEX \
  --rpc-url $RPC_URL \
  --private-key $SEAT_OWNER_KEY
```

Step 2 — Execute after 7 days:

```bash
cast send $POKER_TABLE_ADDRESS "executeEmergencyWithdraw(uint8,address)" \
  $SEAT_INDEX $RECIPIENT_ADDRESS \
  --rpc-url $RPC_URL \
  --private-key $SEAT_OWNER_KEY
```

---

## 7. Common Errors and Fixes

| Error                                  | Likely Cause                      | Fix                                                         |
| -------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `Table paused`                         | Admin paused the table            | Call `unpause()` as admin                                   |
| `VRF timeout`                          | VRF operator down                 | Restart vrf-operator, then call `reRequestVRF()`            |
| `Cannot submit commit now`             | Wrong game state for hole commits | Check `gameState()` — must be `WAITING_FOR_HOLECARDS`       |
| `Not dealer`                           | Dealer address mismatch           | Verify `dealer()` on-chain matches OwnerView's signing key  |
| `JWT expired`                          | Auth token too old                | User re-authenticates (GET /auth/nonce → POST /auth/verify) |
| `circuit breaker open` in indexer logs | Persistent RPC error              | Check RPC endpoint health; backoff will auto-retry          |
