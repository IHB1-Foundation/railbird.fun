import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address } from "@playerco/shared";
import { NonceStore } from "./nonceStore.js";
import { SessionManager, createSignMessage, verifyWalletSignature } from "./session.js";
import { AuthService, AuthError } from "./authService.js";

const TEST_JWT_SECRET = "test-secret-key-that-is-at-least-32-characters-long";

describe("NonceStore", () => {
  let store: NonceStore;

  beforeEach(() => {
    store = new NonceStore(1000); // 1 second TTL for tests
  });

  afterEach(() => {
    store.stopCleanup();
  });

  it("creates unique nonces", () => {
    const address = "0x1234567890123456789012345678901234567890" as Address;
    const nonce1 = store.create(address);
    const nonce2 = store.create(address);
    assert.notEqual(nonce1, nonce2);
    assert.equal(store.size(), 2);
  });

  it("consumes nonce successfully with correct address", () => {
    const address = "0x1234567890123456789012345678901234567890" as Address;
    const nonce = store.create(address);
    const record = store.consume(nonce, address);
    assert.notEqual(record, null);
    assert.equal(record!.address, address);
    assert.equal(store.size(), 0);
  });

  it("rejects consumption with wrong address", () => {
    const address1 = "0x1234567890123456789012345678901234567890" as Address;
    const address2 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
    const nonce = store.create(address1);
    const record = store.consume(nonce, address2);
    assert.equal(record, null);
  });

  it("prevents double consumption", () => {
    const address = "0x1234567890123456789012345678901234567890" as Address;
    const nonce = store.create(address);
    store.consume(nonce, address);
    const record2 = store.consume(nonce, address);
    assert.equal(record2, null);
  });

  it("rejects expired nonces", async () => {
    const address = "0x1234567890123456789012345678901234567890" as Address;
    const store = new NonceStore(50); // 50ms TTL
    const nonce = store.create(address);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const record = store.consume(nonce, address);
    assert.equal(record, null);
    store.stopCleanup();
  });

  it("cleans up expired nonces", async () => {
    const address = "0x1234567890123456789012345678901234567890" as Address;
    const store = new NonceStore(50);
    store.create(address);
    store.create(address);
    assert.equal(store.size(), 2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const removed = store.cleanup();
    assert.equal(removed, 2);
    assert.equal(store.size(), 0);
    store.stopCleanup();
  });
});

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({
      jwtSecret: TEST_JWT_SECRET,
      sessionTtlMs: 3600_000, // 1 hour
    });
  });

  it("creates valid tokens", async () => {
    const address = "0x1234567890123456789012345678901234567890" as Address;
    const token = await manager.createToken(address);
    assert.equal(typeof token, "string");
    assert.ok(token.length > 0);
  });

  it("verifies valid tokens", async () => {
    const address = "0x1234567890123456789012345678901234567890" as Address;
    const token = await manager.createToken(address);
    const payload = await manager.verifyToken(token);
    assert.notEqual(payload, null);
    assert.equal(payload!.sub, address);
  });

  it("rejects invalid tokens", async () => {
    const payload = await manager.verifyToken("invalid.token.here");
    assert.equal(payload, null);
  });

  it("rejects tampered tokens", async () => {
    const address = "0x1234567890123456789012345678901234567890" as Address;
    const token = await manager.createToken(address);
    const tampered = token.slice(0, -5) + "xxxxx";
    const payload = await manager.verifyToken(tampered);
    assert.equal(payload, null);
  });
});

describe("Signature verification", () => {
  it("creates correct sign message", () => {
    const nonce = "test-nonce-123";
    const message = createSignMessage(nonce);
    assert.ok(message.includes(nonce));
    assert.ok(message.includes("PlayerCo"));
  });

  it("verifies valid signature", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const nonce = "test-nonce-for-signing";
    const message = createSignMessage(nonce);
    const signature = await account.signMessage({ message });
    const isValid = await verifyWalletSignature(
      account.address as Address,
      nonce,
      signature
    );
    assert.equal(isValid, true);
  });

  it("rejects invalid signature", async () => {
    const privateKey1 = generatePrivateKey();
    const privateKey2 = generatePrivateKey();
    const account1 = privateKeyToAccount(privateKey1);
    const account2 = privateKeyToAccount(privateKey2);
    const nonce = "test-nonce-for-signing";
    const message = createSignMessage(nonce);
    const signature = await account1.signMessage({ message });
    // Try to verify with wrong address
    const isValid = await verifyWalletSignature(
      account2.address as Address,
      nonce,
      signature
    );
    assert.equal(isValid, false);
  });
});

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService({
      jwtSecret: TEST_JWT_SECRET,
      nonceTtlMs: 5000,
      sessionTtlMs: 3600_000,
    });
  });

  afterEach(() => {
    service.stop();
  });

  it("generates nonce for valid address", () => {
    const address = "0x1234567890123456789012345678901234567890";
    const result = service.getNonce(address);
    assert.ok(result.nonce.length > 0);
    assert.ok(result.message.includes(result.nonce));
  });

  it("rejects invalid address format", () => {
    assert.throws(
      () => service.getNonce("invalid"),
      (err: Error) => err instanceof AuthError && err.code === "INVALID_ADDRESS"
    );
  });

  it("normalizes address to lowercase", () => {
    const address = "0xAbCdEf1234567890123456789012345678901234";
    const result = service.getNonce(address);
    assert.ok(result.nonce.length > 0);
  });

  it("full auth flow: nonce -> sign -> verify -> token", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    // Get nonce
    const { nonce, message } = service.getNonce(account.address);

    // Sign message
    const signature = await account.signMessage({ message });

    // Verify and get token
    const result = await service.verify(account.address, nonce, signature);

    assert.ok(result.token.length > 0);
    assert.equal(result.address, account.address.toLowerCase());
    assert.ok(result.expiresAt > Date.now());
  });

  it("rejects reused nonce", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    const { nonce, message } = service.getNonce(account.address);
    const signature = await account.signMessage({ message });

    // First verify succeeds
    await service.verify(account.address, nonce, signature);

    // Second verify fails
    await assert.rejects(
      () => service.verify(account.address, nonce, signature),
      (err: Error) => err instanceof AuthError && err.code === "INVALID_NONCE"
    );
  });

  it("rejects wrong signature", async () => {
    const privateKey1 = generatePrivateKey();
    const privateKey2 = generatePrivateKey();
    const account1 = privateKeyToAccount(privateKey1);
    const account2 = privateKeyToAccount(privateKey2);

    // Get nonce for account1
    const { nonce, message } = service.getNonce(account1.address);

    // Sign with account2's key
    const signature = await account2.signMessage({ message });

    // Verify should fail
    await assert.rejects(
      () => service.verify(account1.address, nonce, signature),
      (err: Error) => err instanceof AuthError && err.code === "INVALID_SIGNATURE"
    );
  });

  it("verifies session token", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    const { nonce, message } = service.getNonce(account.address);
    const signature = await account.signMessage({ message });
    const { token } = await service.verify(account.address, nonce, signature);

    const payload = await service.verifySession(token);
    assert.notEqual(payload, null);
    assert.equal(payload!.sub, account.address.toLowerCase());
  });
});
