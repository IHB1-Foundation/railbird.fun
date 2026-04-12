# Indexer database data dictionary

> Schema is owned by `services/indexer/migrations/`. Update this file whenever
> a new migration adds, drops, or renames a table or load-bearing column.
> The auto-generated ER diagram (run `bash scripts/db/generate-er.sh`) lives
> alongside in `er-diagram/index.html` and is the source of truth for FK
> relationships.

## Conventions

- All monetary amounts are `NUMERIC(78,0)` (chip-base units) — no implicit
  scaling.
- All `*_address` columns are lowercase 0x-prefixed hex (`VARCHAR(42)`).
- Timestamps are `TIMESTAMP WITH TIME ZONE` and default to `NOW()` at insert.
- `created_at` / `updated_at` follow the standard pattern. `updated_at` is
  written by triggers or by application code on every UPDATE.

## Tables

### `indexer_state`

Single-row table tracking the indexer cursor (deprecated by per-contract
cursors in `indexer_cursors`, kept for backwards compatibility).

| Column                     | Type         | Description                              |
| -------------------------- | ------------ | ---------------------------------------- |
| `id`                       | INT PK       | Always `1` (`CHECK single_row`).         |
| `last_processed_block`     | BIGINT       | Highest block fully indexed.             |
| `last_processed_log_index` | INT          | Log index within `last_processed_block`. |
| `updated_at`               | TIMESTAMP TZ | Last cursor write.                       |

### `processed_events`

Idempotency log keyed by `(block_number, log_index)`. Used by every event
handler to detect re-delivery on restart.

### `poker_tables`

One row per indexed PokerTable contract (the table-level state, not per-hand).

| Column             | Type          | Description                                    |
| ------------------ | ------------- | ---------------------------------------------- |
| `table_id`         | BIGINT PK     | On-chain table ID.                             |
| `contract_address` | VARCHAR(42)   | Lowercase contract address.                    |
| `small_blind`      | NUMERIC(78,0) | Small blind in chip units.                     |
| `big_blind`        | NUMERIC(78,0) | Big blind in chip units.                       |
| `current_hand_id`  | BIGINT        | Hand currently in play (0 = idle).             |
| `game_state`       | VARCHAR(32)   | One of the FSM states (see PROJECT.md).        |
| `button_seat`      | SMALLINT      | Dealer button seat index for the current hand. |
| `action_deadline`  | TIMESTAMP TZ  | Wall-clock deadline for the current actor.     |

### `seats`

Per-table seat occupancy and stack.

| Column                   | Type          | Description                          |
| ------------------------ | ------------- | ------------------------------------ |
| `(table_id, seat_index)` | composite PK  |                                      |
| `owner_address`          | VARCHAR(42)   | The wallet that holds the seat NFT.  |
| `operator_address`       | VARCHAR(42)   | Wallet authorised to submit actions. |
| `stack`                  | NUMERIC(78,0) | Current chip stack.                  |
| `is_active`              | BOOL          | False once player sits out / busts.  |
| `current_bet`            | NUMERIC(78,0) | Per-street commit so far.            |

### `hands`

One row per hand. PK is `(table_id, hand_id)`.

Notable columns: `pot`, `current_bet`, `actor_seat`, `game_state`,
`button_seat`, `community_cards SMALLINT[]`, `winner_seat`,
`settlement_amount`, `started_at`, `settled_at`. Indexes on `table_id` and
`game_state` for active-hand queries.

### `actions`

Append-only action log per hand.

| Column                | Type          | Description                                 |
| --------------------- | ------------- | ------------------------------------------- |
| `id`                  | SERIAL PK     |                                             |
| `(table_id, hand_id)` | FK → hands    |                                             |
| `seat_index`          | SMALLINT      |                                             |
| `action_type`         | VARCHAR(16)   | `fold`/`check`/`call`/`bet`/`raise`/`allin` |
| `amount`              | NUMERIC(78,0) | Bet size for bet/raise actions.             |
| `pot_after`           | NUMERIC(78,0) | Pot total after applying this action.       |
| `block_number`        | BIGINT        |                                             |
| `tx_hash`             | VARCHAR(66)   |                                             |

### `vrf_requests`

VRF lifecycle for hand commits / community cards.

### `agents`

Agent token registry. PK is the ERC-721 token contract address.

### `vault_snapshots`

Per-hand vault NAV snapshot. Used to render NAV charts and to enforce
ADR-0004's accretive-only rebalance invariant.

### `settlements`

Final pot allocations after a hand completes. Composite FK to `hands`.

### `rebalance_events` _(migration 002)_

Treasury rebalance audit trail with pre/post NAV.

### `revealed_holecards` _(migration 003)_

Showdown hole-card reveals, indexed by `(table_id, hand_id, seat_index)`.

### `elo_ratings` / `elo_history` _(migration 005)_

Per-agent Elo ratings and the historical timeline.

### `decision_verifications` / `decision_audit` _(migrations 006, 008)_

Off-chain agent decision logs cross-referenced against on-chain actions for
audit (`/api/audit/verify`).

### `side_bets` / `side_bet_settlements` _(migration 007)_

Spectator side-bet pools per hand.

### `auth_events` _(migration 010)_

Auth attempt audit trail (T-1304). Per-IP and per-address with 90-day TTL.

### `indexed_blocks` _(migration 011)_

Reorg detection table — tracks `(block_number, hash, parent_hash)` so the
listener can detect chain re-organisations and roll back affected rows.

### `indexer_cursors` _(migration 012)_

Per-contract resume cursor (`contract_address`, `last_block`, `updated_at`).
Replaces the single-row `indexer_state` for new code paths.

## How to regenerate the ER diagram

```bash
docker compose up -d postgres
DB_HOST=localhost DB_USER=playerco DB_PASS=playerco DB_NAME=playerco \
  bash scripts/db/generate-er.sh
open docs/db/er-diagram/index.html
```
