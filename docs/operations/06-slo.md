# 06 — Service Level Objectives

> SLOs are user-visible promises. Each SLO maps 1:1 to a Grafana panel and
> a Better Stack uptime probe so we can prove compliance from outside.

## Web app (`apps/web`)

| SLI              | Target         | Measurement                              |
| ---------------- | -------------- | ---------------------------------------- |
| Availability     | 99.5% / 30 d   | Better Stack `web` probe (60 s interval) |
| P95 TTFB         | < 800 ms       | Vercel Web Vitals → Grafana via export   |
| LCP (Lighthouse) | < 2.5 s on `/` | Lighthouse CI (T-2105)                   |

## Indexer (`services/indexer`)

| SLI                            | Target                 | Source                                          |
| ------------------------------ | ---------------------- | ----------------------------------------------- |
| Block lag                      | P95 < 30 s, P99 < 60 s | `railbird_indexer_block_lag`                    |
| `/api/health` availability     | 99.9% / 30 d           | Better Stack `indexer` probe                    |
| `/api/leaderboard` P95 latency | < 400 ms               | `apiLatencyHistogram{route="/api/leaderboard"}` |
| WS broadcast P95               | < 500 ms               | `wsBroadcastDuration` (custom)                  |

## OwnerView (`services/ownerview`)

| SLI                        | Target      | Source                                                    |
| -------------------------- | ----------- | --------------------------------------------------------- |
| `/auth/*` P95 latency      | < 500 ms    | `apiLatencyHistogram{route=~"/auth/.*"}`                  |
| `/auth/verify` error rate  | < 1% / 24 h | `railbird_auth_attempts_total{outcome="failure"}` / total |
| Hole-card delivery success | > 99.5%     | `holecardDeliveryOutcome` counter                         |
| Dealer settle latency      | P95 < 2 s   | `dealerSettleDuration` histogram                          |

## Agent bot (`bots/agent`)

| SLI                            | Target       | Source                                                  |
| ------------------------------ | ------------ | ------------------------------------------------------- |
| Action submission success rate | > 98% / 24 h | `railbird_bot_actions_total{outcome="success"}` / total |
| Gemini call P95 latency        | < 4 s        | external API histogram                                  |
| Crash-free hand rate           | > 99.5%      | `railbird_bot_errors_total / hands`                     |

## Keeper bot (`bots/keeper`)

| SLI                                 | Target      | Source                                                        |
| ----------------------------------- | ----------- | ------------------------------------------------------------- |
| forceTimeout latency after deadline | < 30 s      | custom histogram                                              |
| Vault rebalance success rate        | > 99% / 7 d | `railbird_keeper_rebalances_total{outcome="success"}` / total |

## Error budget policy

If any SLO is breached for two consecutive 7-day windows, **freeze
non-critical merges** for that surface until a postmortem fix lands. The
policy is enforced by labelling PRs `slo-frozen` until the budget recovers.

## Reporting cadence

- **Weekly**: SLO compliance summary in the team channel (auto-export from
  Grafana).
- **Monthly**: per-SLO trend report in the engineering review.
- **Quarterly**: SLO targets re-evaluated against actual user demand.
