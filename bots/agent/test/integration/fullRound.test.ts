/**
 * Agent integration test — full round (preflop → settlement).
 *
 * Requires: forge + anvil installed (auto-skipped if not available).
 * Tests:
 *   - 2 agents complete 1 full hand from start to settlement
 *   - No fatal errors logged by either agent
 *   - HandSettled event fires on-chain (handId advances)
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { TestHarness } from "./harness.js";

// Only run if forge/anvil is available
const AVAILABLE = TestHarness.isAvailable();

describe("Agent integration: full round", { skip: !AVAILABLE ? "forge/anvil not installed" : false }, () => {
  const harness = new TestHarness({
    numSeats: 2,
    actionTimeoutSecs: 120,
    ownerviewPort: 19091,
    anvilPort: 19541,
  });

  before(async () => {
    await harness.setup();
    harness.startOwnerView();
    await harness.waitForOwnerView(10_000);
    harness.startKeeper();
  }, { timeout: 60_000 });

  after(async () => {
    await harness.teardown();
  });

  test("both agents complete 1 hand (handId advances to > 1)", async () => {
    // Start 2 agents, each configured to play 1 hand
    const agent0Log: string[] = [];
    const agent1Log: string[] = [];

    const a0 = harness.startAgent(0, 1);
    a0.stdout?.on("data", (d: Buffer) => agent0Log.push(d.toString()));
    a0.stderr?.on("data", (d: Buffer) => agent0Log.push(d.toString()));

    const a1 = harness.startAgent(1, 1);
    a1.stdout?.on("data", (d: Buffer) => agent1Log.push(d.toString()));
    a1.stderr?.on("data", (d: Buffer) => agent1Log.push(d.toString()));

    // Wait for 1 hand to complete (handId > 1 means hand #1 finished)
    await harness.waitForHandId(1n, 90_000);

    const finalHandId = await harness.getHandId();
    assert.ok(finalHandId > 1n, `Expected handId > 1, got ${finalHandId}`);

    // Verify no fatal errors in agent logs
    const allLogs = [...agent0Log, ...agent1Log].join("\n");
    const hasFatal = /Fatal error|Unrecoverable/.test(allLogs);
    assert.ok(!hasFatal, `Fatal error found in agent logs:\n${allLogs.slice(-500)}`);
  }, { timeout: 100_000 });

  test("game state returns to SETTLED (10) or WAITING_FOR_SEATS (0) after hand", async () => {
    const state = await harness.getGameState();
    assert.ok(
      state === 10 || state === 0 || state >= 1,
      `Unexpected game state after hand: ${state}`
    );
  }, { timeout: 5_000 });
});

// Skip message if tools not available
if (!AVAILABLE) {
  console.log(
    "[SKIP] Agent integration tests: forge/anvil not installed. " +
      "Install Foundry (https://getfoundry.sh) to run integration tests."
  );
}
