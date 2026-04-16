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

A staging tag is cut by pushing to `staging`.

## Staging environment

Staging mirrors production but targets HSK testnet and uses isolated
Railway + Vercel projects. It deploys automatically on every push to
`main` so that integration is always verified before manual promotion.

### One-time Railway staging setup

```bash
# Install the Railway CLI
npm install -g @railway/cli && railway login

# Create a new Railway project called "railbird-staging"
railway init --name railbird-staging

# For each service, deploy from the project root:
railway up --service indexer   --dockerfile services/indexer/Dockerfile
railway up --service ownerview --dockerfile services/ownerview/Dockerfile
railway up --service fleet     --dockerfile services/fleet/Dockerfile
railway up --service keeper    --dockerfile bots/keeper/Dockerfile
railway up --service agent     --dockerfile bots/agent/Dockerfile
railway up --service vrf-op    --dockerfile bots/vrf-operator/Dockerfile
```

Set the same env vars as production but point to testnet contracts and a
separate `DATABASE_URL` (Railway creates a Postgres instance per project).

### Vercel staging domain

1. In the Vercel dashboard, create a new project linked to the same repo.
2. Set "Production Branch" to `main`; this creates a dedicated staging URL.
3. Set all `NEXT_PUBLIC_*` env vars to point to the Railway staging services.
4. Enable "Deploy on every push to main" — Vercel handles this by default.

### Auto-deploy GitHub Action

`.github/workflows/ci.yml` already runs on push to `main`. To add a
post-CI deploy step to Railway staging, add:

```yaml
deploy-staging:
  name: Deploy to Railway Staging
  needs: [typecheck, lint, contracts]
  if: github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Deploy to Railway
      run: npx @railway/cli@latest up --service indexer
      env:
        RAILWAY_TOKEN: ${{ secrets.RAILWAY_STAGING_TOKEN }}
```

Add `RAILWAY_STAGING_TOKEN` as a GitHub Actions secret.

### Staging vs production independence

| Dimension | Staging                | Production              |
| --------- | ---------------------- | ----------------------- |
| Chain     | HSK Testnet (133)      | HSK Mainnet (177)       |
| Contracts | Separate deploy        | Live contracts          |
| Database  | Isolated Railway DB    | Production Railway DB   |
| Web URL   | `staging.railbird.xyz` | `railbird.xyz`          |
| Analytics | Vercel Analytics (dev) | Vercel Analytics (prod) |

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
2. Run `pnpm verify:predeploy` locally on the exact commit being shipped.
3. Update [`DEPLOY.md`](../../DEPLOY.md) if env vars or service shape changed.
4. Confirm migrations are idempotent and have a `down/` counterpart (T-1507).
5. Bump SemVer tag if cutting a release.
6. Push.

## Post-deploy verification

1. Run `pnpm verify:postdeploy` and confirm `pass=18 fail=0 skip=0`.
2. Hit each `/health` endpoint with `?deep=1` (T-1405) and confirm `ready`.
3. Open Grafana indexer dashboard — `railbird_indexer_block_lag` should
   stabilise within 60 s of deploy.
4. Sentry release marker created automatically by the release tag.
5. Smoke-check `/docs` (T-1801) loads on each service.

On pushes to `main`, CI also runs a retried `production-smoke` job against the
live web + API surfaces so post-deploy regressions are caught even after the
branch is already merged.

## Rollback

Railway: revert via the dashboard's "Rollback to previous deploy" button.
Vercel: redeploy a prior production deployment from the project page.
Database: see [`docs/operations/04-runbook-incidents.md`](./04-runbook-incidents.md#database-rollback).
