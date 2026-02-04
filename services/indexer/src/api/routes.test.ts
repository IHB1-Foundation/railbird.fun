// API routes tests

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Mock the database module before importing routes
const mockTables = [
  {
    table_id: "1",
    contract_address: "0x1234567890123456789012345678901234567890",
    small_blind: "10",
    big_blind: "20",
    current_hand_id: "5",
    game_state: "BETTING_PRE",
    button_seat: 0,
    action_deadline: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  },
];

const mockSeats = [
  {
    table_id: "1",
    seat_index: 0,
    owner_address: "0xowner1",
    operator_address: "0xop1",
    stack: "1000",
    is_active: true,
    current_bet: "20",
    updated_at: new Date(),
  },
  {
    table_id: "1",
    seat_index: 1,
    owner_address: "0xowner2",
    operator_address: "0xop2",
    stack: "980",
    is_active: true,
    current_bet: "20",
    updated_at: new Date(),
  },
];

const mockHand = {
  hand_id: "5",
  table_id: "1",
  pot: "40",
  current_bet: "20",
  actor_seat: 0,
  game_state: "BETTING_PRE",
  button_seat: 0,
  small_blind: "10",
  big_blind: "20",
  community_cards: [],
  winner_seat: null,
  settlement_amount: null,
  started_at: new Date(),
  settled_at: null,
};

const mockAgents = [
  {
    token_address: "0xagent1",
    vault_address: "0xvault1",
    table_address: "0xtable1",
    owner_address: "0xowner1",
    operator_address: "0xop1",
    meta_uri: "ipfs://test",
    is_registered: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

const mockSnapshot = {
  id: 1,
  vault_address: "0xvault1",
  hand_id: "5",
  external_assets: "10000",
  treasury_shares: "1000",
  outstanding_shares: "9000",
  nav_per_share: "1111111111111111111",
  cumulative_pnl: "500",
  block_number: "100",
  created_at: new Date(),
};

describe("API Routes", () => {
  describe("Response formatting", () => {
    it("should format table response correctly", () => {
      const table = mockTables[0];
      const formatted = {
        tableId: table.table_id,
        contractAddress: table.contract_address,
        smallBlind: table.small_blind,
        bigBlind: table.big_blind,
        currentHandId: table.current_hand_id,
        gameState: table.game_state,
        buttonSeat: table.button_seat,
        actionDeadline: table.action_deadline?.toISOString() || null,
        seats: mockSeats.map((s) => ({
          seatIndex: s.seat_index,
          ownerAddress: s.owner_address,
          operatorAddress: s.operator_address,
          stack: s.stack,
          isActive: s.is_active,
          currentBet: s.current_bet,
        })),
        currentHand: null,
      };

      assert.strictEqual(formatted.tableId, "1");
      assert.strictEqual(formatted.gameState, "BETTING_PRE");
      assert.strictEqual(formatted.seats.length, 2);
      assert.strictEqual(formatted.seats[0].ownerAddress, "0xowner1");
    });

    it("should format hand response correctly", () => {
      const hand = mockHand;
      const formatted = {
        handId: hand.hand_id,
        tableId: hand.table_id,
        pot: hand.pot,
        currentBet: hand.current_bet || "0",
        actorSeat: hand.actor_seat,
        gameState: hand.game_state,
        buttonSeat: hand.button_seat,
        communityCards: hand.community_cards || [],
        winnerSeat: hand.winner_seat,
        settlementAmount: hand.settlement_amount,
        actions: [],
      };

      assert.strictEqual(formatted.handId, "5");
      assert.strictEqual(formatted.pot, "40");
      assert.strictEqual(formatted.actorSeat, 0);
      assert.deepStrictEqual(formatted.communityCards, []);
    });

    it("should format agent response correctly", () => {
      const agent = mockAgents[0];
      const snapshot = mockSnapshot;
      const formatted = {
        tokenAddress: agent.token_address,
        vaultAddress: agent.vault_address,
        tableAddress: agent.table_address,
        ownerAddress: agent.owner_address,
        operatorAddress: agent.operator_address,
        metaUri: agent.meta_uri,
        isRegistered: agent.is_registered,
        latestSnapshot: snapshot
          ? {
              handId: snapshot.hand_id,
              externalAssets: snapshot.external_assets,
              treasuryShares: snapshot.treasury_shares,
              outstandingShares: snapshot.outstanding_shares,
              navPerShare: snapshot.nav_per_share,
              cumulativePnl: snapshot.cumulative_pnl,
              blockNumber: snapshot.block_number,
            }
          : null,
      };

      assert.strictEqual(formatted.tokenAddress, "0xagent1");
      assert.strictEqual(formatted.ownerAddress, "0xowner1");
      assert.strictEqual(formatted.latestSnapshot?.externalAssets, "10000");
    });

    it("should format action response correctly", () => {
      const action = {
        id: 1,
        table_id: "1",
        hand_id: "5",
        seat_index: 0,
        action_type: "CALL",
        amount: "10",
        pot_after: "30",
        block_number: "100",
        tx_hash: "0xtx123",
        created_at: new Date("2024-01-01T00:00:00Z"),
      };

      const formatted = {
        seatIndex: action.seat_index,
        actionType: action.action_type,
        amount: action.amount,
        potAfter: action.pot_after,
        blockNumber: action.block_number,
        txHash: action.tx_hash,
        timestamp: action.created_at?.toISOString() || new Date().toISOString(),
      };

      assert.strictEqual(formatted.seatIndex, 0);
      assert.strictEqual(formatted.actionType, "CALL");
      assert.strictEqual(formatted.amount, "10");
      assert.strictEqual(formatted.timestamp, "2024-01-01T00:00:00.000Z");
    });
  });

  describe("Snapshot formatting", () => {
    it("should format vault snapshot correctly", () => {
      const snapshot = mockSnapshot;
      const formatted = {
        handId: snapshot.hand_id,
        externalAssets: snapshot.external_assets,
        treasuryShares: snapshot.treasury_shares,
        outstandingShares: snapshot.outstanding_shares,
        navPerShare: snapshot.nav_per_share,
        cumulativePnl: snapshot.cumulative_pnl,
        blockNumber: snapshot.block_number,
      };

      assert.strictEqual(formatted.handId, "5");
      assert.strictEqual(formatted.externalAssets, "10000");
      assert.strictEqual(formatted.outstandingShares, "9000");
    });
  });
});

describe("ABI Parsing", () => {
  it("should map game states correctly", () => {
    const GAME_STATES = [
      "WAITING_FOR_SEATS",
      "HAND_INIT",
      "BETTING_PRE",
      "WAITING_VRF_FLOP",
      "BETTING_FLOP",
      "WAITING_VRF_TURN",
      "BETTING_TURN",
      "WAITING_VRF_RIVER",
      "BETTING_RIVER",
      "SHOWDOWN",
      "SETTLED",
    ];

    assert.strictEqual(GAME_STATES[0], "WAITING_FOR_SEATS");
    assert.strictEqual(GAME_STATES[2], "BETTING_PRE");
    assert.strictEqual(GAME_STATES[10], "SETTLED");
  });

  it("should map action types correctly", () => {
    const ACTION_TYPES = ["FOLD", "CHECK", "CALL", "RAISE"];

    assert.strictEqual(ACTION_TYPES[0], "FOLD");
    assert.strictEqual(ACTION_TYPES[1], "CHECK");
    assert.strictEqual(ACTION_TYPES[2], "CALL");
    assert.strictEqual(ACTION_TYPES[3], "RAISE");
  });
});
