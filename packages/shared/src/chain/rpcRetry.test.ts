import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withRpcRetry } from "./rpcRetry.js";

describe("withRpcRetry", () => {
  it("returns result on first attempt", async () => {
    const result = await withRpcRetry(async () => 42);
    assert.equal(result, 42);
  });

  it("succeeds on 3rd attempt after retriable errors", async () => {
    let calls = 0;
    const result = await withRpcRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("network error");
        return "ok";
      },
      { maxAttempts: 5, baseMs: 1, maxMs: 5 }
    );
    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });

  it("throws after maxAttempts exhausted", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRpcRetry(
          async () => {
            calls++;
            throw new Error("network error");
          },
          { maxAttempts: 3, baseMs: 1, maxMs: 5 }
        ),
      /network error/
    );
    assert.equal(calls, 3);
  });

  it("rethrows non-retriable error immediately", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRpcRetry(
          async () => {
            calls++;
            throw new Error("invalid address");
          },
          { maxAttempts: 5, baseMs: 1 }
        ),
      /invalid address/
    );
    assert.equal(calls, 1); // immediate throw, no retries
  });

  it("custom retryOn predicate overrides default", async () => {
    let calls = 0;
    const result = await withRpcRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("custom retriable");
        return "done";
      },
      {
        maxAttempts: 5,
        baseMs: 1,
        maxMs: 5,
        retryOn: (e) => e instanceof Error && e.message === "custom retriable",
      }
    );
    assert.equal(result, "done");
    assert.equal(calls, 3);
  });
});
