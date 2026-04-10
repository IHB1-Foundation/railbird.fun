import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ChainClient, GameState } from "./client.js";

const CONFIG = {
  rpcUrl: "http://localhost:8545",
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const,
  pokerTableAddress: "0x0000000000000000000000000000000000000001" as const,
};

function makeClient() {
  return new ChainClient(CONFIG);
}

describe("ChainClient.getTableState", () => {
  test("derives canStartHand=true from seats when canStartHand() reverts", async () => {
    const client = makeClient();

    const readContract = async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      switch (functionName) {
        case "gameState":
          return GameState.WAITING_FOR_SEATS;
        case "currentHandId":
          return 0n;
        case "actionDeadline":
          return 0n;
        case "lastActionBlock":
          return 0n;
        case "pendingVRFRequestId":
          return 0n;
        case "vrfRequestTimestamp":
          return 0n;
        case "canStartHand":
          throw new Error("execution reverted");
        case "numSeats":
          return 3;
        case "paused":
          return false;
        case "getSeat":
          throw new Error("execution reverted");
        case "seats":
          if (args?.[0] === 0n) {
            return [
              "0x0000000000000000000000000000000000000001",
              "0x0000000000000000000000000000000000000001",
              100n,
              false,
              0n,
              false,
              0n,
            ];
          }
          if (args?.[0] === 1n) {
            return [
              "0x0000000000000000000000000000000000000002",
              "0x0000000000000000000000000000000000000002",
              100n,
              false,
              0n,
              false,
              0n,
            ];
          }
          return [
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            0n,
            false,
            0n,
            false,
            0n,
          ];
        default:
          throw new Error(`unexpected function ${functionName}`);
      }
    };

    (client as unknown as { publicClient: { readContract: typeof readContract } }).publicClient = {
      readContract,
    };

    const state = await client.getTableState();

    assert.equal(state.gameState, GameState.WAITING_FOR_SEATS);
    assert.equal(state.canStartHand, true);
  });

  test("falls back to canStartHand=false when canStartHand() reverts and table is not ready", async () => {
    const client = makeClient();

    const readContract = async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      switch (functionName) {
        case "gameState":
          return GameState.WAITING_FOR_SEATS;
        case "currentHandId":
          return 0n;
        case "actionDeadline":
          return 0n;
        case "lastActionBlock":
          return 0n;
        case "pendingVRFRequestId":
          return 0n;
        case "vrfRequestTimestamp":
          return 0n;
        case "canStartHand":
          throw new Error("execution reverted");
        case "numSeats":
          return 2;
        case "paused":
          return false;
        case "getSeat":
          if (args?.[0] === 0) {
            return {
              owner: "0x0000000000000000000000000000000000000001",
              operator: "0x0000000000000000000000000000000000000001",
              stack: 100n,
              isActive: false,
              currentBet: 0n,
              isAllIn: false,
              totalHandBet: 0n,
            };
          }
          return {
            owner: "0x0000000000000000000000000000000000000000",
            operator: "0x0000000000000000000000000000000000000000",
            stack: 0n,
            isActive: false,
            currentBet: 0n,
            isAllIn: false,
            totalHandBet: 0n,
          };
        default:
          throw new Error(`unexpected function ${functionName}`);
      }
    };

    (client as unknown as { publicClient: { readContract: typeof readContract } }).publicClient = {
      readContract,
    };

    const state = await client.getTableState();

    assert.equal(state.gameState, GameState.WAITING_FOR_SEATS);
    assert.equal(state.canStartHand, false);
  });

  test("preserves canStartHand=true when the contract read succeeds", async () => {
    const client = makeClient();

    const readContract = async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case "gameState":
          return GameState.SETTLED;
        case "currentHandId":
          return 12n;
        case "actionDeadline":
          return 100n;
        case "lastActionBlock":
          return 99n;
        case "pendingVRFRequestId":
          return 0n;
        case "vrfRequestTimestamp":
          return 0n;
        case "canStartHand":
          return true;
        default:
          throw new Error(`unexpected function ${functionName}`);
      }
    };

    (client as unknown as { publicClient: { readContract: typeof readContract } }).publicClient = {
      readContract,
    };

    const state = await client.getTableState();

    assert.equal(state.currentHandId, 12n);
    assert.equal(state.canStartHand, true);
  });
});
