import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { initCache, getOrSet, isCacheActive, shutdownCache } from "./redis.js";

describe("redis cache (no REDIS_URL)", () => {
  before(async () => {
    delete process.env.REDIS_URL;
    await initCache();
  });

  after(async () => {
    await shutdownCache();
  });

  it("reports cache as inactive without REDIS_URL", () => {
    assert.equal(isCacheActive(), false);
  });

  it("getOrSet always invokes the loader", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return { value: 42 };
    };
    const a = await getOrSet("test:key", 10, loader);
    const b = await getOrSet("test:key", 10, loader);
    assert.equal(a.value, 42);
    assert.equal(b.value, 42);
    assert.equal(calls, 2, "loader runs twice when cache is disabled");
  });

  it("loader errors propagate", async () => {
    await assert.rejects(
      getOrSet("test:err", 10, async () => {
        throw new Error("loader boom");
      }),
      /loader boom/,
    );
  });
});
