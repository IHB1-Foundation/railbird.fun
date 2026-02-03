# PlayerCo

Wallet-based identity | Public spectating | Owner-only hole cards | In-app nad.fun trading | Per-hand accretive-only treasury rebalancing

## Prerequisites

- Node.js >= 18
- pnpm >= 8
- Foundry (for contracts)

## Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Repository Structure

```
/contracts        - Solidity contracts (Foundry)
/apps/web         - Next.js web application
/services/indexer - Event indexer + REST API + WebSocket
/services/ownerview - Wallet-auth + hole card ACL service
/bots/agent       - Poker-playing agent bot
/bots/keeper      - Liveness keeper bot
/packages/shared  - Shared types, config, and utilities
```

## Documentation

See [PROJECT.md](./PROJECT.md) for full project specification.
See [TICKET.md](./TICKET.md) for implementation tickets.
