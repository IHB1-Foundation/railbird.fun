# 0001 — pnpm workspace monorepo layout

- **Status**: Accepted
- **Date**: 2026-04-12
- **Deciders**: Railbird core

## Context

Railbird ships five independently deployable surfaces (web, indexer, ownerview,
keeper bot, agent bot, fleet) plus Solidity contracts and a shared TS library.
Each surface needs its own build/test pipeline but shares ABIs, types, env
parsers, observability helpers, and the contract artifact bundle.

Options considered:

1. **Polyrepo** — one repo per service.
2. **Single-package monorepo** — everything under one `package.json`.
3. **pnpm workspaces with package boundaries** _(chosen)_.
4. **Nx** or **Bazel** — heavyweight, requires team training.

## Decision

Use pnpm workspaces with explicit package boundaries:

```
apps/web         — Next.js frontend
services/{indexer,ownerview,fleet}
bots/{keeper,agent}
contracts        — Foundry, not a JS package
packages/shared  — published as @playerco/shared via workspace:* protocol
```

Turborepo (T-1703) provides incremental builds on top.

## Consequences

- **Positive**: One PR can atomically update an ABI and every consumer.
  Shared utilities don't need npm publishing.
- **Negative**: Initial setup is more complex than a polyrepo. CI needs to be
  smart about which packages to rebuild.
- **Risks**: Tight coupling between packages can leak. We mitigate via the
  explicit `@playerco/shared` boundary — services may not import from each
  other directly.
- **Follow-ups**: When the team grows past ~5 engineers, revisit whether
  bots/agent should split into its own repo (Gemini iteration speed concern).
