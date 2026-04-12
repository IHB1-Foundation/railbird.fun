# 02 — Deployment

> Reference for shipping to staging and production. The full
> service-by-service env reference and Railway sequence is in [`DEPLOY.md`](../../DEPLOY.md).
> This page is the operational quick-reference.

## Push-to-deploy

Both Vercel (web) and Railway (services + bots) auto-deploy on push to `main`.
The session runner does **not** push — operators run:

```bash
git push origin main
```

A staging tag is cut by pushing to `staging` (T-2002).

## Required env per service

| Service    | Required env vars                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Web        | `NEXT_PUBLIC_INDEXER_URL`, `NEXT_PUBLIC_OWNERVIEW_URL`, `NEXT_PUBLIC_CHAIN_ENV`, `SENTRY_DSN`                                                 |
| Indexer    | `RPC_URL`, `DATABASE_URL`, `POKER_TABLE_ADDRESSES`, `PLAYER_REGISTRY_ADDRESS`, `CORS_ALLOWED_ORIGINS`, `SENTRY_DSN`, `OTEL_EXPORTER_ENDPOINT` |
| OwnerView  | `JWT_SECRET`, `RPC_URL`, `POKER_TABLE_ADDRESS`, `DEALER_API_KEY`, `CORS_ALLOWED_ORIGINS`, `SENTRY_DSN`                                        |
| Fleet      | `FLEET_OPERATOR_KEYS`, `CORS_ALLOWED_ORIGINS`, `SENTRY_DSN`                                                                                   |
| Keeper bot | `KEEPER_PRIVATE_KEY`, `RPC_URL`, `POKER_TABLE_ADDRESS`, `OWNERVIEW_URL`, `DEALER_API_KEY`                                                     |
| Agent bot  | `AGENT_PRIVATE_KEY`, `OWNER_ADDRESS`, `RPC_URL`, `POKER_TABLE_ADDRESS`, `OWNERVIEW_URL`, `INDEXER_URL`, `GEMINI_API_KEY`                      |
| VRF op bot | `VRF_OPERATOR_PRIVATE_KEY`, `RPC_URL`, `VRF_ADAPTER_ADDRESS`                                                                                  |

All required env are validated fail-closed at startup (T-1302).

## Secrets setup

Production secrets live in Railway and Vercel project settings — never in
the repo. The inventory and rotation SLAs are in
[`docs/security/secrets-inventory.md`](../security/secrets-inventory.md).

## Pre-deploy checklist

1. CI green on the commit that will be pushed.
2. Run `node scripts/openapi/validate.mjs` locally if any API surface changed.
3. Update [`DEPLOY.md`](../../DEPLOY.md) if env vars or service shape changed.
4. Confirm migrations are idempotent and have a `down/` counterpart (T-1507).
5. Bump SemVer tag if cutting a release.
6. Push.

## Post-deploy verification

1. Hit each `/health` endpoint with `?deep=1` (T-1405) and confirm `ready`.
2. Open Grafana indexer dashboard — `railbird_indexer_block_lag` should
   stabilise within 60 s of deploy.
3. Sentry release marker created automatically by the release tag.
4. Smoke-check `/docs` (T-1801) loads on each service.

## Rollback

Railway: revert via the dashboard's "Rollback to previous deploy" button.
Vercel: redeploy a prior production deployment from the project page.
Database: see [`docs/operations/04-runbook-incidents.md`](./04-runbook-incidents.md#database-rollback).
