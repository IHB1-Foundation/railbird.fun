# Web bundle report (T-1903)

> Living document. Update on every meaningful build-size shift, especially
> after adding a new dependency or a new heavy component to a hot route.

## How to reproduce

```bash
pnpm --filter @playerco/web build
pnpm --filter @playerco/web run size      # size-limit gate
ANALYZE=true pnpm --filter @playerco/web build  # next/bundle-analyzer report
```

## 2026-04-12 baseline (after T-1903)

```
Initial JS payload (main-*)        — 34.71 KB gzipped (limit 120 KB)
App framework chunk (framework-*)  — 44.85 KB gzipped (limit 60 KB)
Total first-load JS                — 81.46 KB gzipped (limit 300 KB)
First Load JS shared by all pages  — 87.7 KB
```

## Routes

| Route                               | Page JS                    | First load            |
| ----------------------------------- | -------------------------- | --------------------- |
| `/`                                 | <small>varies</small>      | <small>varies</small> |
| `/leaderboard`                      | 8.42 KB                    | 105 KB                |
| `/live`                             | 9.34 KB                    | 106 KB                |
| `/me`                               | 3.25 KB                    | 121 KB                |
| `/create-agent`                     | 8 KB                       | 125 KB                |
| `/evolution`                        | 1.54 KB                    | 101 KB                |
| `/agent/[token]`                    | depends on chart lazy-load | ~130 KB               |
| `/table/[id]`                       | 223 KB                     | 423 KB                |
| `/terms`, `/privacy`, `/disclaimer` | 244 B                      | 87.9 KB               |

`/table/[id]` is the heaviest page. The TableViewer component bundles viem,
WebSocket subscribers, the in-game card renderer, and several reasoning
panels. Reduction work tracked in T-1906 (WS compression) and a future
follow-up to lazy-load the reasoning sidebar.

## Recent reductions

- **T-1903**: lazy-load `StrategyTimeline` on `/agent/[token]` (~12 KB
  saved on first load).
- **T-1903**: ignore @sentry/node, @opentelemetry, fastify-otel,
  import-in-the-middle, pino, pg in the client bundle via webpack
  IgnorePlugin. They were getting transitively bundled through
  `@playerco/shared` even though they're server-only — saved ~80 KB on
  every page.

## CI gate

`size-limit` runs in CI on every PR. Threshold breach fails the build.
Limits are intentionally generous (120/60/300) to absorb normal feature
work; tighten when ratchets become possible.
