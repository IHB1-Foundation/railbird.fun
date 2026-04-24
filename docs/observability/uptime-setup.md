# Uptime Monitoring Setup

## Overview

Monitor 5 endpoints with Better Stack Uptime (or UptimeRobot).
Alert channel: Discord webhook.

## Endpoints to Monitor

| Service          | URL                                                         | Expected response                           |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Web app          | `https://www.railbird.fun/`                                 | 200 OK                                      |
| Apex redirect    | `https://railbird.fun/`                                     | 308 redirect to `https://www.railbird.fun/` |
| Indexer health   | `https://indexer-production-7498.up.railway.app/api/health` | `{"status":"ok"}`                           |
| OwnerView health | `https://ownerview-production-496d.up.railway.app/health`   | `{"status":"ok"}`                           |
| Fleet health     | `https://fleet-production-1bbe.up.railway.app/health`       | `{"status":"ok"}`                           |
| Chain RPC        | `<your-rollup-rpc-url>`                                     | 200 (JSON-RPC endpoint)                     |

## Better Stack Uptime Setup

1. Sign up at [betterstack.com](https://betterstack.com/uptime) (free: 10 monitors)
2. For each endpoint:
   - **URL**: enter endpoint above
   - **Interval**: 60 seconds
   - **Regions**: at least 2 (NA + EU)
   - **Alert policy**: create a policy → Discord webhook

3. Create a Discord webhook:
   - In your Discord server → Channel Settings → Integrations → New Webhook
   - Copy the webhook URL
   - In Better Stack → Alert policies → Add Discord webhook

## Deep Health Check

Services support `?deep=1` for comprehensive checks:

```bash
# Check ownerview with DB + chain connectivity
curl https://ownerview-production-496d.up.railway.app/health?deep=1

# Example response:
# { "status": "ok", "deep": { "db": true, "chain": true } }
# { "status": "degraded", "deep": { "db": false, "chain": true } }
```

Deep check returns HTTP 503 if any dependency is down.

Configure uptime monitors to use `?deep=1` for critical alerts.

## Status Page

Better Stack includes a public status page. Share it with users:
`https://status.railbird.fun` (configure custom domain in Better Stack settings)

## On-Call Rotation

- Primary: 0xYatha (all hours)
- Escalation: 30 minutes if not acknowledged

## Testing Uptime Monitor

1. Stop a service temporarily
2. Verify alert arrives in Discord within 2 minutes
3. Restart service
4. Verify recovery notification
