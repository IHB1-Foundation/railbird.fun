import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HandStartedEventListener } from "./eventListener.js";
import { DealerSeedStore } from "./dealerSeedStore.js";
import { DealerService } from "./dealerService.js";
import { HoleCardStore } from "../holecards/index.js";

/**
 * Build a minimal HandStartedEventListener with a mocked viem public client.
 * The mock tracks how many watchContractEvent calls were made and whether
 * the returned unwatch callbacks were invoked.
 */
function buildListenerWithMockClient() {
  const unwatchCallCounts: number[] = [];
  let watchCallCount = 0;

  // Minimal stub that replaces createPublicClient
  const mockClient = {
    watchContractEvent: (_opts: unknown) => {
      const idx = watchCallCount++;
      unwatchCallCounts[idx] = 0;
      return () => {
        unwatchCallCounts[idx]++;
      };
    },
  };

  const store = new HoleCardStore();
  const dealerService = new DealerService(store, new DealerSeedStore());
  const listener = new HandStartedEventListener(
    {
      rpcUrl: "http://localhost:8545",
      pokerTableAddress: "0x0000000000000000000000000000000000000001",
      trustlessDealerEnabled: false,
    },
    dealerService,
    "table-1"
  );

  // Swap out the private client with our mock
  // @ts-expect-error — accessing private field for testing
  listener["client"] = mockClient;

  return { listener, unwatchCallCounts, getWatchCallCount: () => watchCallCount };
}

describe("HandStartedEventListener — watch leak fix", () => {
  it("start() registers two event watchers", async () => {
    const { listener, getWatchCallCount } = buildListenerWithMockClient();
    await listener.start();
    assert.equal(getWatchCallCount(), 2, "start() should call watchContractEvent twice");
    listener.stop();
  });

  it("stop() calls all unwatch callbacks (both HandStarted and CardIntegrityViolation)", async () => {
    const { listener, unwatchCallCounts } = buildListenerWithMockClient();
    await listener.start();

    assert.equal(unwatchCallCounts.length, 2);
    assert.equal(unwatchCallCounts[0], 0, "first watcher not yet stopped");
    assert.equal(unwatchCallCounts[1], 0, "second watcher not yet stopped");

    listener.stop();

    assert.equal(unwatchCallCounts[0], 1, "first watcher should be stopped after stop()");
    assert.equal(unwatchCallCounts[1], 1, "second watcher (CardIntegrityViolation) should be stopped after stop()");
  });

  it("isListening() returns false after stop()", async () => {
    const { listener } = buildListenerWithMockClient();
    await listener.start();
    assert.equal(listener.isListening(), true);
    listener.stop();
    assert.equal(listener.isListening(), false);
  });

  it("stop() is idempotent — calling twice does not throw", async () => {
    const { listener } = buildListenerWithMockClient();
    await listener.start();
    listener.stop();
    assert.doesNotThrow(() => listener.stop());
  });
});
