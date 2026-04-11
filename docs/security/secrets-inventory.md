# Secrets Inventory

> **Source of truth** for all secrets required by the Railbird/PlayerCo system.
> Update this file whenever a new secret is added or rotated.

## Legend

| Column | Meaning |
|--------|---------|
| Name | Environment variable name |
| Owner | Who manages rotation |
| Rotation SLA | How often it should be rotated |
| Current storage | Where the value lives today |
| Target storage | Intended production storage |

---

## Services

### ownerview

| Name | Owner | Rotation SLA | Current | Target |
|------|-------|-------------|---------|--------|
| `JWT_SECRET` | Platform | 90 days | Railway Secrets | Railway Secrets |
| `DEALER_API_KEY` | Platform | On breach | Railway Secrets | Railway Secrets |
| `RPC_URL` | Platform | N/A | Railway Secrets | Railway Secrets |
| `POSTGRES_URL` / `DB_*` | Platform | N/A | Railway Secrets | Railway Secrets |
| `POKER_TABLE_ADDRESSES` | Deploy | Per deploy | Railway Secrets | Railway Secrets |
| `PLAYER_REGISTRY_ADDRESS` | Deploy | Per deploy | Railway Secrets | Railway Secrets |
| `CHAIN_ENV` | Deploy | N/A | Railway Vars | Railway Vars |

### indexer

| Name | Owner | Rotation SLA | Current | Target |
|------|-------|-------------|---------|--------|
| `RPC_URL` | Platform | N/A | Railway Secrets | Railway Secrets |
| `DB_*` / `POSTGRES_URL` | Platform | N/A | Railway Secrets | Railway Secrets |
| `POKER_TABLE_ADDRESSES` | Deploy | Per deploy | Railway Secrets | Railway Secrets |
| `PLAYER_REGISTRY_ADDRESS` | Deploy | Per deploy | Railway Secrets | Railway Secrets |

### fleet

| Name | Owner | Rotation SLA | Current | Target |
|------|-------|-------------|---------|--------|
| `FLEET_DEALER_API_KEY` | Platform | On breach | Railway Secrets | Railway Secrets |
| `RPC_URL` | Platform | N/A | Railway Secrets | Railway Secrets |

---

## Bots

### keeper

| Name | Owner | Rotation SLA | Current | Target |
|------|-------|-------------|---------|--------|
| `KEEPER_PRIVATE_KEY` | Platform | 180 days | Railway Secrets | Railway Secrets |
| `RPC_URL` | Platform | N/A | Railway Secrets | Railway Secrets |
| `POKER_TABLE_ADDRESSES` | Deploy | Per deploy | Railway Secrets | Railway Secrets |

### agent

| Name | Owner | Rotation SLA | Current | Target |
|------|-------|-------------|---------|--------|
| `AGENT_PRIVATE_KEY` | Platform | 180 days | Railway Secrets | Railway Secrets |
| `GEMINI_API_KEY` | Platform | 90 days | Railway Secrets | Railway Secrets |
| `RPC_URL` | Platform | N/A | Railway Secrets | Railway Secrets |

### vrf-operator

| Name | Owner | Rotation SLA | Current | Target |
|------|-------|-------------|---------|--------|
| `VRF_OPERATOR_PRIVATE_KEY` | Platform | 180 days | Railway Secrets | Railway Secrets |
| `RPC_URL` | Platform | N/A | Railway Secrets | Railway Secrets |

---

## Web (Vercel)

| Name | Owner | Rotation SLA | Current | Target |
|------|-------|-------------|---------|--------|
| `NEXT_PUBLIC_INDEXER_WS_URL` | Deploy | Per deploy | Vercel Env | Vercel Env |
| `NEXT_PUBLIC_OWNERVIEW_URL` | Deploy | Per deploy | Vercel Env | Vercel Env |
| `NEXT_PUBLIC_CHAIN_ENV` | Deploy | N/A | Vercel Env | Vercel Env |

---

## Registration Checklist

Before deploying to a new environment, verify all secrets above are registered:

**Railway**
1. Open Railway project → Variables tab
2. Add each secret from the service tables above
3. Redeploy the service

**Vercel**
1. Open Vercel project → Settings → Environment Variables
2. Add each `NEXT_PUBLIC_*` variable
3. Trigger a new deployment

---

## Do NOT

- Store secrets in `.env` files that are committed to git
- Use `process.env.FOO || "some-default"` for required secrets (use `requireEnv` instead)
- Share the same private key across services
- Reuse testnet keys for mainnet deployments
