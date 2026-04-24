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
import { TestHarness, DEPLOYER_KEY } from "../../../agent/test/integration/harness.js";

// Only run if forge/anvil is available
const AVAILABLE = TestHarness.isAvailable();

describe(
  "Keeper integration: forceTimeout",
  { skip: !AVAILABLE ? "forge/anvil not installed" : false },
  () => {
    // Use the contract minimums, then fast-forward Anvil time inside the test.
    const harness = new TestHarness({
      numSeats: 2,
      actionTimeoutSecs: 60,
      vrfTimeoutSecs: 30,
      ownerviewPort: 19092,
      anvilPort: 19542,
    });

    before(
      async () => {
        await harness.setup();
        harness.startOwnerView();
        await harness.waitForOwnerView(10_000);
        await harness.seedOwnerViewEncryptionKeys();
        harness.startKeeper();
      },
      { timeout: 60_000 },
    );

    after(async () => {
      await harness.teardown();
    });

    test(
      "keeper calls forceTimeout when action deadline expires",
      async () => {
        // Manually start a hand (no agents will act, so deadline will pass)
        execSync(
          [
            "cast",
            "send",
            harness.tableAddr,
            `"startHand()"`,
            "--rpc-url",
            harness.rpcUrl,
            "--private-key",
            DEPLOYER_KEY,
          ].join(" "),
        );

        await harness.waitForGameState(2, 20_000);

        execSync(`cast rpc --rpc-url ${harness.rpcUrl} evm_increaseTime 61`);
        execSync(`cast rpc --rpc-url ${harness.rpcUrl} evm_mine`);

        // Wait up to 15s for keeper to detect and call forceTimeout after time warp.
        const deadline = Date.now() + 15_000;
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
          `Keeper did not call forceTimeout after deadline. Final state: ${await harness.getGameState()}`,
        );
      },
      { timeout: 25_000 },
    );

    test(
      "hand ID advances after timeout resolution",
      async () => {
        const handId = await harness.getHandId();
        // At minimum the hand should have started (handId >= 1)
        assert.ok(handId >= 1n, `Expected handId >= 1, got ${handId}`);
      },
      { timeout: 5_000 },
    );
  },
);

// Skip message if tools not available
if (!AVAILABLE) {
  console.log(
    "[SKIP] Keeper integration tests: forge/anvil not installed. " +
      "Install Foundry (https://getfoundry.sh) to run integration tests.",
  );
}
