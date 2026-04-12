# Architecture Decision Records

ADRs capture significant design decisions and the reasoning behind them.
Each record is short, self-contained, and dated. New ADRs use the next
sequential number and copy [`template.md`](./template.md).

## Index

| #    | Title                                                                                        | Status   |
| ---- | -------------------------------------------------------------------------------------------- | -------- |
| 0001 | [pnpm workspace monorepo layout](./0001-monorepo-layout.md)                                  | Accepted |
| 0002 | [Wallet-only authentication](./0002-wallet-only-auth.md)                                     | Accepted |
| 0003 | [Commit-reveal hole cards via ECIES + verifiable shuffle](./0003-commit-reveal-holecards.md) | Accepted |
| 0004 | [Accretive-only treasury rebalancing](./0004-accretive-only-rebalancing.md)                  | Accepted |
| 0005 | [Custom circuit breaker over a library](./0005-custom-circuit-breaker-vs-library.md)         | Accepted |
| 0006 | [Raw SQL migrations over an ORM](./0006-raw-sql-migrations.md)                               | Accepted |

## Adding a new ADR

1. `cp docs/adr/template.md docs/adr/NNNN-short-title.md`.
2. Fill it in. Keep it under one page.
3. Add a row to the table above.
4. Open a PR with the change.
