# 0005 — Custom circuit breaker over a library

- **Status**: Accepted
- **Date**: 2026-04-12
- **Deciders**: Railbird core

## Context

Bots and services call several flaky externalities (Gemini, RPC nodes, the
dealer endpoint, the indexer). We need a circuit breaker so a degraded
upstream doesn't cascade into 100% bot crashes. Options:

1. **opossum** — popular Node circuit breaker, ~30 KB.
2. **brakes** — older alternative.
3. **Custom** _(chosen)_ — `packages/shared/circuitBreaker.ts`, ~150 lines.

## Decision

Implement a minimal circuit breaker in shared. It supports:

- Three states: `closed`, `open`, `half-open`.
- Configurable failure threshold and reset timeout.
- Synchronous metric emission (`railbird_circuit_state{name}` Gauge).
- AbortSignal-aware so it composes with `fetchWithTimeout` (T-1505).

We do not need bulkheads, fallbacks, or rolling-window stats — every call
site has explicit retry/timeout from `withRpcRetry` (T-1501) and
`fetchWithTimeout` (T-1505), and we already export Prometheus metrics.

## Consequences

- **Positive**: Zero new dependencies. The implementation fits on one screen,
  is unit-tested, and integrates with our shared metrics registry.
- **Negative**: We have to maintain it ourselves. If we want sliding-window
  failure rates later we'll need to add them.
- **Risks**: A bug in our breaker can mask real failures. Mitigation:
  unit tests cover all state transitions and the metric is emitted on every
  state change so Grafana alerts notice instantly.
- **Follow-ups**: Revisit if/when we adopt a service mesh or move bots to
  Kubernetes — the platform may provide breakers.
