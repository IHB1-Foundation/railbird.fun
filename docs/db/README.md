# Database documentation

- [`data-dictionary.md`](./data-dictionary.md) — table-level descriptions and conventions.
- `er-diagram/` — auto-generated SchemaSpy report (run
  [`scripts/db/generate-er.sh`](../../scripts/db/generate-er.sh) against a
  populated Postgres). Not committed; regenerated on demand.
- Schema source of truth: [`services/indexer/migrations/`](../../services/indexer/migrations/).
- Rollback files: [`services/indexer/migrations/down/`](../../services/indexer/migrations/down/).
