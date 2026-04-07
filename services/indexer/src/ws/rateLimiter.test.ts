// MessageRateLimiter unit tests

import { test, describe } from "node:test";
import assert from "node:assert";
import { MessageRateLimiter } from "./rateLimiter.js";

describe("MessageRateLimiter", () => {
  test("allows messages within burst capacity", () => {
    const limiter = new MessageRateLimiter(20, 20);
    // Should allow 20 messages immediately (full burst)
    for (let i = 0; i < 20; i++) {
      assert.strictEqual(limiter.consume(), true, `Message ${i + 1} should be allowed`);
    }
  });

  test("blocks message that exceeds burst capacity", () => {
    const limiter = new MessageRateLimiter(20, 5);
    // Consume all 5 burst tokens
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(limiter.consume(), true);
    }
    // 6th message should be blocked (no tokens left)
    assert.strictEqual(limiter.consume(), false);
  });

  test("refills tokens over time", () => {
    const limiter = new MessageRateLimiter(1000, 1); // 1000 tokens/sec, burst=1
    // Consume the single burst token
    assert.strictEqual(limiter.consume(), true);
    assert.strictEqual(limiter.consume(), false);
    // After ~3ms, at 1000 tokens/sec should have ~3 tokens
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        assert.strictEqual(limiter.consume(), true);
        resolve();
      }, 3);
    });
  });

  test("rate limit triggers at threshold (>20/sec burst exhaustion)", () => {
    // Limiter with burst=20: 21st message should fail immediately
    const limiter = new MessageRateLimiter(20, 20);
    let allowed = 0;
    let blocked = 0;
    for (let i = 0; i < 30; i++) {
      if (limiter.consume()) {
        allowed++;
      } else {
        blocked++;
      }
    }
    assert.strictEqual(allowed, 20, "Exactly 20 messages should be allowed initially");
    assert.ok(blocked > 0, "Some messages should be blocked after burst exhaustion");
  });

  test("normal subscription messages are well within limit", () => {
    const limiter = new MessageRateLimiter(20, 20);
    // A client subscribing (1 message) + ping (1 message) is well within limit
    assert.strictEqual(limiter.consume(), true); // subscribe
    assert.strictEqual(limiter.consume(), true); // ping
  });
});
