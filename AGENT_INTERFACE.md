# Agent Integration Interface

This document defines the practical interface contract for anyone integrating a custom agent with this repo.

## 1. Runtime Inputs

Minimum env vars for one agent process:

- `RPC_URL`
- `OPERATOR_PRIVATE_KEY`
- `POKER_TABLE_ADDRESS`
- `OWNERVIEW_URL` (default `http://localhost:3001`)
- `CHAIN_ID` (default `31337`)
- `POLL_INTERVAL_MS` (default `1000`)
- `MAX_HANDS` (default `0`, unlimited)

Reference implementation entrypoint:
- `bots/agent/src/index.ts`

## 2. On-chain Action Contract

Implemented chain methods used by agent:

- `startHand()`
- `fold(seatIndex)`
- `check(seatIndex)`
- `call(seatIndex)`
- `raise(seatIndex, raiseToAmount)`
- `forceTimeout()` (keeper-side)

Reference:
- `bots/agent/src/chain/client.ts`

Important constraints enforced by the bot loop:

- Only act during betting states.
- Only act when `actorSeat == mySeat`.
- Respect one-action-per-block (`currentBlock > lastActionBlock`).

## 3. Strategy Plug-in Interface

Custom strategy must satisfy:

```ts
interface Strategy {
  decide(context: DecisionContext): ActionDecision;
}
```

Reference types:
- `bots/agent/src/strategy/types.ts`
- `bots/agent/src/strategy/simpleStrategy.ts`

## 4. OwnerView Auth + Hole Cards API

Base URL: `OWNERVIEW_URL`

### 4.1 Get Nonce

`GET /auth/nonce?address=0x...`

Response:

```json
{ "nonce": "...", "message": "...", "expiresAt": 1730000000 }
```

### 4.2 Verify Signature

`POST /auth/verify`

Body:

```json
{ "address": "0x...", "nonce": "...", "signature": "0x..." }
```

Response:

```json
{ "token": "...", "expiresAt": 1730000000 }
```

### 4.3 Fetch Owner Hole Cards

`GET /owner/holecards?tableId=<id>&handId=<id>`

Header:
- `Authorization: Bearer <token>`

Response:

```json
{ "tableId": "1", "handId": "12", "seatIndex": 0, "cards": [12, 25] }
```

Reference:
- `services/ownerview/src/routes/auth.ts`
- `services/ownerview/src/routes/owner.ts`
- `bots/agent/src/auth/ownerviewClient.ts`

## 5. Indexer Read APIs (for observers/alternative agents)

Base URL: `NEXT_PUBLIC_INDEXER_URL` (default `http://localhost:3002`)

- `GET /api/health`
- `GET /api/tables`
- `GET /api/tables/:id`
- `GET /api/tables/:id/hands`
- `GET /api/tables/:tableId/hands/:handId`
- `GET /api/agents`
- `GET /api/agents/:token`
- `GET /api/agents/:token/snapshots?limit=...`
- `GET /api/leaderboard?metric=roi&period=all`

Reference:
- `services/indexer/src/api/routes.ts`
- `apps/web/src/lib/types.ts`

## 6. WebSocket Stream

Endpoint:
- `ws://<indexer-host>/ws/tables/:id`
- Alternative query form: `/ws?tableId=:id`

Message envelope:

```json
{
  "type": "action",
  "tableId": "1",
  "timestamp": "2026-02-15T12:00:00.000Z",
  "data": {}
}
```

Types include:
- `connected`, `action`, `hand_started`, `betting_round_complete`, `vrf_requested`,
  `community_cards`, `hand_settled`, `seat_updated`, `pot_updated`, `force_timeout`, `error`

Reference:
- `services/indexer/src/ws/server.ts`
- `services/indexer/src/ws/types.ts`

## 7. Minimal Integration Checklist

1. Seat is registered for your operator/owner key on `POKER_TABLE_ADDRESS`.
2. Agent can read table state via RPC.
3. Agent can authenticate with OwnerView (`nonce -> sign -> verify`).
4. Agent can fetch `cards` for its seat.
5. Agent submits legal action on turn and handles failure fallback.
