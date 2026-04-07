import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { validatePrivateKey, parseTableAddresses, parsePositiveInt, optionalEnv } from "./envUtils.js";

const VALID_KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const VALID_ADDR = "0xabCDEF1234567890abcdef1234567890abcdef12";

describe("validatePrivateKey", () => {
  beforeEach(() => { delete process.env.TEST_PK; });
  afterEach(() => { delete process.env.TEST_PK; });

  test("accepts valid 32-byte hex without 0x prefix", () => {
    process.env.TEST_PK = VALID_KEY;
    const result = validatePrivateKey("TEST_PK");
    assert.equal(result, `0x${VALID_KEY}`);
  });

  test("accepts valid key with 0x prefix", () => {
    process.env.TEST_PK = `0x${VALID_KEY}`;
    const result = validatePrivateKey("TEST_PK");
    assert.equal(result, `0x${VALID_KEY}`);
  });

  test("throws on missing env var", () => {
    assert.throws(() => validatePrivateKey("TEST_PK"), /empty/);
  });

  test("throws on too-short key", () => {
    process.env.TEST_PK = "deadbeef";
    assert.throws(() => validatePrivateKey("TEST_PK"), /invalid/i);
  });

  test("throws on non-hex characters", () => {
    process.env.TEST_PK = "zz" + VALID_KEY.slice(2);
    assert.throws(() => validatePrivateKey("TEST_PK"), /invalid/i);
  });
});

describe("parseTableAddresses", () => {
  beforeEach(() => {
    delete process.env.POKER_TABLE_ADDRESSES;
    delete process.env.POKER_TABLE_ADDRESS;
  });
  afterEach(() => {
    delete process.env.POKER_TABLE_ADDRESSES;
    delete process.env.POKER_TABLE_ADDRESS;
  });

  test("parses single address from POKER_TABLE_ADDRESS fallback", () => {
    process.env.POKER_TABLE_ADDRESS = VALID_ADDR;
    const result = parseTableAddresses();
    assert.deepEqual(result, [VALID_ADDR]);
  });

  test("parses comma-separated addresses from POKER_TABLE_ADDRESSES", () => {
    const addr2 = "0x1234567890123456789012345678901234567890";
    process.env.POKER_TABLE_ADDRESSES = `${VALID_ADDR},${addr2}`;
    const result = parseTableAddresses();
    assert.deepEqual(result, [VALID_ADDR, addr2]);
  });

  test("trims whitespace around addresses", () => {
    process.env.POKER_TABLE_ADDRESSES = `  ${VALID_ADDR}  ,  ${VALID_ADDR}  `;
    const result = parseTableAddresses();
    assert.deepEqual(result, [VALID_ADDR, VALID_ADDR]);
  });

  test("throws when env var is empty string", () => {
    process.env.POKER_TABLE_ADDRESSES = "  ,  ";
    assert.throws(() => parseTableAddresses(), /no valid addresses/);
  });

  test("throws when neither env var is set", () => {
    assert.throws(() => parseTableAddresses(), /Missing required/);
  });

  test("accepts custom env var names", () => {
    process.env.MY_TABLES = VALID_ADDR;
    try {
      const result = parseTableAddresses("MY_TABLES");
      assert.deepEqual(result, [VALID_ADDR]);
    } finally {
      delete process.env.MY_TABLES;
    }
  });
});

describe("parsePositiveInt", () => {
  beforeEach(() => { delete process.env.TEST_INT; });
  afterEach(() => { delete process.env.TEST_INT; });

  test("returns value when valid", () => {
    process.env.TEST_INT = "42";
    assert.equal(parsePositiveInt("TEST_INT", 10), 42);
  });

  test("returns fallback when absent", () => {
    assert.equal(parsePositiveInt("TEST_INT", 10), 10);
  });

  test("returns fallback on NaN", () => {
    process.env.TEST_INT = "abc";
    assert.equal(parsePositiveInt("TEST_INT", 7), 7);
  });

  test("returns fallback on negative value", () => {
    process.env.TEST_INT = "-5";
    assert.equal(parsePositiveInt("TEST_INT", 3), 3);
  });

  test("accepts zero", () => {
    process.env.TEST_INT = "0";
    assert.equal(parsePositiveInt("TEST_INT", 5), 0);
  });
});

describe("optionalEnv", () => {
  beforeEach(() => { delete process.env.TEST_OPT; });
  afterEach(() => { delete process.env.TEST_OPT; });

  test("returns env value when set", () => {
    process.env.TEST_OPT = "hello";
    assert.equal(optionalEnv("TEST_OPT", "default"), "hello");
  });

  test("returns fallback when absent", () => {
    assert.equal(optionalEnv("TEST_OPT", "default"), "default");
  });

  test("returns fallback for empty string", () => {
    process.env.TEST_OPT = "";
    assert.equal(optionalEnv("TEST_OPT", "fallback"), "fallback");
  });
});
