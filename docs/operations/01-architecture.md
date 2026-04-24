# 01 — Architecture overview

> What runs where, and how the pieces talk to each other.

## Service map

```
                                   ┌─────────────────────────┐
                                   │ Initia MiniEVM Rollup  │
                                   │  PokerTable, Vault, …   │
                                   └────────┬────────┬───────┘
                                            │ events │ tx
                  ┌─────────────────────────┘        └─────────────┐
                  ▼                                                 ▼
        ┌─────────────────┐    /api      ┌──────────────────┐  /dealer  ┌──────────────┐
        │ services/index- │◀────────────▶│   apps/web       │◀─────────▶│ services/    │
        │  er (Node)      │   /ws        │   (Next.js 14)   │           │  ownerview   │
        │  Postgres       │              └──────────────────┘           │  (Node)      │
        └─────────────────┘                                              └──────┬───────┘
                  ▲                                                            │
                  │ events                                                     │ /dealer
        ┌─────────┴───────┐                                                    │ /owner
        │ bots/keeper     │◀───────────────────────────────────────────────────┤
        │ bots/agent      │                                                    │
        │ bots/vrf-       │                                                    │
        │  operator       │                                                    │
        └─────────────────┘                                                    │
                                                                                ▼
                                                                       ┌────────────────┐
                                                                       │ Gemini API     │
                                                                       └────────────────┘
```

## Deployment targets

| Service              | Host    | Image / build                   | Healthcheck      |
| -------------------- | ------- | ------------------------------- | ---------------- |
| `apps/web`           | Vercel  | Next.js (auto)                  | `/`              |
| `services/indexer`   | Railway | `services/indexer/Dockerfile`   | `/api/health`    |
| `services/ownerview` | Railway | `services/ownerview/Dockerfile` | `/health`        |
| `services/fleet`     | Railway | `services/fleet/Dockerfile`     | `/health`        |
| `bots/keeper`        | Railway | `bots/keeper/Dockerfile`        | process liveness |
| `bots/agent`         | Railway | `bots/agent/Dockerfile`         | process liveness |
| `bots/vrf-operator`  | Railway | `bots/vrf-operator/Dockerfile`  | process liveness |

## State boundaries

- **On-chain (Initia MiniEVM rollup)** — table state, hand outcomes, vault NAV,
  side-bet pools. Source of truth.
- **Postgres (indexer)** — replayable view of on-chain state plus per-hand
  derived data, leaderboards, agent profiles.
- **Filesystem (ownerview `/data`)** — encrypted hole cards and dealer seeds
  (separate dirs by ADR-0003).
- **Gemini context window** — agent reasoning. Ephemeral.

See also:

- [02 deployment](./02-deployment.md)
- [03 local-dev](./03-local-dev.md)
- [04 incidents runbook](./04-runbook-incidents.md)
- [06 SLOs](./06-slo.md)
