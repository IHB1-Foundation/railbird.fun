import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  deriveEncryptionKeyPair,
  clearEncryptionKeyCache,
  getCachedPubKey,
} from "../auth/encryptionKey";

// Deterministic mock signature
const MOCK_ADDRESS = "0xaabbccddee000000000000000000000000000001";
const MOCK_SIG = "0x" + "ab".repeat(65); // 65-byte signature

async function mockSign(_msg: string, _addr: string): Promise<string> {
  return MOCK_SIG;
}

beforeEach(() => {
  clearEncryptionKeyCache(MOCK_ADDRESS);
  localStorage.clear();
});

describe("deriveEncryptionKeyPair", () => {
  it("derives a key pair with 32-byte privKey and 33-byte pubKey", async () => {
    const pair = await deriveEncryptionKeyPair(MOCK_ADDRESS, mockSign);
    expect(pair.privKey).toHaveLength(32);
    expect(pair.pubKey).toHaveLength(33);
  });

  it("is deterministic — same signature yields same keys", async () => {
    const pair1 = await deriveEncryptionKeyPair(MOCK_ADDRESS, mockSign);
    clearEncryptionKeyCache(MOCK_ADDRESS);
    const pair2 = await deriveEncryptionKeyPair(MOCK_ADDRESS, mockSign);
    expect(pair1.privKey).toEqual(pair2.privKey);
    expect(pair1.pubKey).toEqual(pair2.pubKey);
  });

  it("caches result — sign is called only once per address", async () => {
    const sign = vi.fn().mockResolvedValue(MOCK_SIG);
    await deriveEncryptionKeyPair(MOCK_ADDRESS, sign);
    await deriveEncryptionKeyPair(MOCK_ADDRESS, sign);
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("persists pubKey to localStorage", async () => {
    await deriveEncryptionKeyPair(MOCK_ADDRESS, mockSign);
    const stored = getCachedPubKey(MOCK_ADDRESS);
    expect(stored).not.toBeNull();
    expect(stored).toHaveLength(33);
  });
});

describe("clearEncryptionKeyCache", () => {
  it("forces re-derivation on next call", async () => {
    const sign = vi.fn().mockResolvedValue(MOCK_SIG);
    await deriveEncryptionKeyPair(MOCK_ADDRESS, sign);
    clearEncryptionKeyCache(MOCK_ADDRESS);
    await deriveEncryptionKeyPair(MOCK_ADDRESS, sign);
    expect(sign).toHaveBeenCalledTimes(2);
  });
});

describe("getCachedPubKey", () => {
  it("returns null when nothing is cached", () => {
    expect(getCachedPubKey("0x0000000000000000000000000000000000000000")).toBeNull();
  });

  it("returns the pubKey bytes after derivation", async () => {
    const pair = await deriveEncryptionKeyPair(MOCK_ADDRESS, mockSign);
    const cached = getCachedPubKey(MOCK_ADDRESS);
    expect(cached).toEqual(pair.pubKey);
  });
});
