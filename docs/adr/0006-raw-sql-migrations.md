# 0006 — Raw SQL migrations over an ORM

- **Status**: Accepted
- **Date**: 2026-04-12
- **Deciders**: Railbird core

## Context

The indexer's storage is PostgreSQL. We need:

- Reproducible migrations across local, staging, prod.
- The ability to read EXPLAIN plans and tune indexes (T-1902).
- A small surface area — the indexer is a write-mostly event sink, not a
  CRUD app.

Options:

1. **Prisma / TypeORM** — full ORM, generates migrations from a schema file.
2. **Knex / Kysely** — query builder + migration runner.
3. **Raw SQL files + tiny runner** _(chosen)_ — `services/indexer/migrations/NNN_*.sql`
   applied by `services/indexer/src/db/migrate.ts`.

## Decision

Each migration is a hand-written `.sql` file numbered `NNN_description.sql`.
The runner applies them in order, recording the applied filename in a
`schema_migrations` table. T-1507 added matching `down/NNN_*.sql` files for
rollback.

We use the `pg` driver directly. Queries live in `services/indexer/src/db/`
as plain functions taking the connection.

## Consequences

- **Positive**: No ORM impedance — we get exactly the SQL we wrote, including
  upserts, partial indexes, materialized views. Migrations are reviewable by
  any DBA. Total runtime cost: zero extra dependencies.
- **Negative**: Type safety on query results is manual. We compensate by
  defining row interfaces alongside the query function and asserting at the
  edge.
- **Risks**: A typo in a hand-written migration can ship to prod. Mitigation:
  the smoke-test workflow (T-R12-02) runs migrations on a fresh Postgres in
  CI; T-1804 adds an ER diagram so drift is visible.
- **Follow-ups**: If the schema grows past ~30 tables, reconsider Kysely for
  the type-safety win without paying ORM runtime cost.
