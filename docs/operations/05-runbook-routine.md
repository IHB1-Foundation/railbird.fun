# 05 — Routine operations runbook

> Recurring tasks that don't require an incident response.

## Daily

- **Glance dashboards**: open the indexer, ownerview, and bots Grafana
  dashboards (T-1403). Anything red?
- **Sentry triage**: any new release-blocking exceptions? Mark or assign.
- **Agent leaderboard sanity**: spot-check `/api/leaderboard` for impossible
  values.

## Weekly

- **Backup restore drill**: pick the most recent `pg_dump` from the rolling
  backup bucket and restore it to a throwaway local database (T-1507).
  Confirm migrations replay cleanly.
- **Dependency audit**: `pnpm audit --audit-level high` locally; the CI
  job (T-1306) is the gate but a human glance catches advisories that need
  vendor follow-up.
- **Slow-query review**: `bash scripts/db/slow-queries.sh` (T-1902). Add
  indexes for anything > 100 ms P95.
- **Wallet float check**: confirm operator and keeper wallets have at least
  3 days of estimated gas runway.

## Monthly

- **Secret rotation**: per the SLA in `docs/security/secrets-inventory.md`.
  Rotate JWT_SECRET, DEALER_API_KEY, GEMINI_API_KEY.
- **Renew TLS / DNS**: confirm Cloudflare zone is healthy.
- **ABI freshness**: forge build, regenerate ABIs, confirm CI passes.
- **Postmortem review**: scan the postmortem channel for unresolved
  follow-ups.

## Quarterly

- **Disaster-recovery drill**: simulate a full Railway region outage by
  spinning up the stack in a second region from IaC (T-2004). RTO target:
  30 min.
- **Penetration / security re-audit**: run `gitleaks`, `osv-scanner`, and
  Trivy (T-2005) outside CI; review findings.
- **Cost review**: Vercel + Railway + Grafana Cloud + Gemini.
