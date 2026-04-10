import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ChainClient, GameState } from "./client.js";

function createClient() {
  return new ChainClient({
    rpcUrl: "http://127.0.0.1:8545",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    pokerTableAddress: "0x1111111111111111111111111111111111111111",
    chainId: 133,
  });
}

describe("ChainClient.getTableState legacy fallbacks", () => {
  test("falls back from getHandInfo/getCommunityCards/getSeat to legacy reads", async () => {
    const client = createClient();
    const readContract = async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      switch (functionName) {
        case "tableId":
          return 1n;
        case "smallBlind":
          return 10n;
        case "bigBlind":
          return 20n;
        case "ACTION_TIMEOUT":
          return 60n;
        case "MAX_SEATS":
          return 9n;
        case "gameState":
          return GameState.BETTING_PRE;
        case "currentHandId":
          return 7n;
        case "actionDeadline":
          return 999n;
        case "lastActionBlock":
          return 123n;
        case "buttonSeat":
          return 1;
        case "getHandInfo":
        case "getCommunityCards":
        case "getSeat":
          throw new Error(`legacy revert: ${functionName}`);
        case "currentHand":
          return [7n, 150n, 40n, 20n, 3, 2, 1, 0] as const;
        case "communityCards":
          return [12, 25, 38, 255, 255][Number(args?.[0] ?? 0)];
        case "seats": {
          const seatIndex = Number(args?.[0] ?? 0);
          if (seatIndex === 0) {
            return [
              "0x1000000000000000000000000000000000000000",
              "0x2000000000000000000000000000000000000000",
              500n,
              true,
              20n,
              false,
              20n,
            ] as const;
          }
          return [
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            0n,
            false,
            0n,
            false,
            0n,
          ] as const;
        }
        default:
          throw new Error(`Unexpected function ${functionName}`);
      }
    };

    (client as unknown as {
      publicClient: { readContract: typeof readContract };
      tableIdCache: bigint | null;
      smallBlindCache: bigint | null;
      bigBlindCache: bigint | null;
      actionTimeoutCache: bigint | null;
      maxSeatsCache: number | null;
    }).publicClient = { readContract };

    const state = await client.getTableState();

    assert.equal(state.gameState, GameState.BETTING_PRE);
    assert.equal(state.hand.handId, 7n);
    assert.equal(state.hand.pot, 150n);
    assert.equal(state.hand.currentBet, 40n);
    assert.equal(state.hand.actorSeat, 3);
    assert.equal(state.buttonSeat, 1);
    assert.deepEqual(state.communityCards, [12, 25, 38, 255, 255]);
    assert.equal(state.seats[0].owner, "0x1000000000000000000000000000000000000000");
    assert.equal(state.seats[0].stack, 500n);
    assert.equal(state.seats[1].owner, "0x0000000000000000000000000000000000000000");
  });

  test("falls back from canCheck/getAmountToCall to derived seat and hand values", async () => {
    const client = createClient();
    const readContract = async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      switch (functionName) {
        case "gameState":
          return GameState.BETTING_PRE;
        case "currentHand":
          return [7n, 150n, 40n, 20n, 3, 2, 1, 0] as const;
        case "canCheck":
        case "getAmountToCall":
        case "getSeat":
          throw new Error(`legacy revert: ${functionName}`);
        case "seats": {
          const seatIndex = Number(args?.[0] ?? 0);
          return [
            `0x${String(seatIndex + 1).padStart(40, "0")}`,
            `0x${String(seatIndex + 2).padStart(40, "0")}`,
            1000n,
            true,
            seatIndex === 3 ? 40n : 20n,
            false,
            seatIndex === 3 ? 40n : 20n,
          ] as const;
        }
        default:
          throw new Error(`Unexpected function ${functionName}`);
      }
    };

    (client as unknown as {
      publicClient: { readContract: typeof readContract };
    }).publicClient = { readContract };

    assert.equal(await client.canCheck(3), true);
    assert.equal(await client.canCheck(0), false);
    assert.equal(await client.getAmountToCall(3), 0n);
    assert.equal(await client.getAmountToCall(0), 20n);
  });
});
