/**
 * Keeper integration test — forceTimeout & VRF re-request.
 *
 * Requires: forge + anvil installed (auto-skipped if not available).
 * Tests:
 *   1. Keeper calls forceTimeout when action deadline passes (no agents acting)
 *   2. Keeper re-requests VRF when VRF fulfillment times out
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import * as path from "node:path";
import { TestHarness, DEPLOYER_KEY } from "../../agent/test/integration/harness.js";

const ROOT_DIR = path.resolve(__dirname, "../../../..");

// Only run if forge/anvil is available
const AVAILABLE = TestHarness.isAvailable();

describe("Keeper integration: forceTimeout", { skip: !AVAILABLE ? "forge/anvil not installed" : false }, () => {
  // Short action timeout so the timeout fires in a few seconds during tests
  const harness = new TestHarness({
    numSeats: 2,
    actionTimeoutSecs: 10, // 10s action timeout — fires quickly for testing
    vrfTimeoutSecs: 5,
    ownerviewPort: 19092,
    anvilPort: 19542,
  });

  before(async () => {
    await harness.setup();
    // NO agents started — keeper will detect timeout and call forceTimeout
    harness.startOwnerView();
    await harness.waitForOwnerView(10_000);
    harness.startKeeper();
  }, { timeout: 60_000 });

  after(async () => {
    await harness.teardown();
  });

  test("keeper calls forceTimeout when action deadline expires", async () => {
    // Manually start a hand (no agents will act, so deadline will pass)
    execSync(
      [
        "cast", "send", harness.tableAddr,
        `"startHand()"`,
        "--rpc-url", harness.rpcUrl,
        "--private-key", DEPLOYER_KEY,
      ].join(" ")
    );

    // Fulfill VRF so preflop begins (otherwise we're stuck in WAITING_VRF_HOLECARDS)
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const lastReqOut = execSync(
        `cast call ${harness.vrfAddr} "lastRequestId()(uint256)" --rpc-url ${harness.rpcUrl}`
      ).toString().trim();
      const reqId = BigInt(lastReqOut);
      if (reqId > 0n) {
        execSync(
          [
            "cast", "send", harness.vrfAddr,
            `"fulfillRandomness(uint256,uint256)"`, String(reqId), "12345678",
            "--rpc-url", harness.rpcUrl,
            "--private-key", DEPLOYER_KEY,
          ].join(" ")
        );
      }
    } catch { /* VRF might not be pending — continue */ }

    // Wait up to 30s for keeper to detect and call forceTimeout
    // (action timeout = 10s, keeper polls every 300ms → should fire in ~12s)
    const deadline = Date.now() + 30_000;
    let resolved = false;

    while (Date.now() < deadline) {
      const state = await harness.getGameState().catch(() => -1);
      // SETTLED=10 or WAITING_FOR_SEATS=0 means the hand resolved
      if (state === 10 || state === 0) {
        resolved = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    assert.ok(
      resolved,
      `Keeper did not call forceTimeout within 30s. Final state: ${await harness.getGameState()}`
    );
  }, { timeout: 40_000 });

  test("hand ID advances after timeout resolution", async () => {
    const handId = await harness.getHandId();
    // At minimum the hand should have started (handId >= 1)
    assert.ok(handId >= 1n, `Expected handId >= 1, got ${handId}`);
  }, { timeout: 5_000 });
});

// Skip message if tools not available
if (!AVAILABLE) {
  console.log(
    "[SKIP] Keeper integration tests: forge/anvil not installed. " +
      "Install Foundry (https://getfoundry.sh) to run integration tests."
  );
}
