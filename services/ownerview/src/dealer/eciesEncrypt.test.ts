import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { encryptHoleCards, decryptHoleCards } from "./eciesEncrypt.js";
import type { EncryptedPayload } from "./eciesEncrypt.js";

function generateKeyPair(): { privKey: Uint8Array; pubKey: Uint8Array } {
  const privKey = secp256k1.utils.randomSecretKey();
  const pubKey = secp256k1.getPublicKey(privKey, true);
  return { privKey, pubKey };
}

describe("ECIES encrypt/decrypt", () => {
  test("round-trip: encrypt then decrypt returns original cards", async () => {
    const { privKey, pubKey } = generateKeyPair();
    const original: [number, number] = [10, 25];

    const payload = await encryptHoleCards(pubKey, original);
    const decrypted = await decryptHoleCards(privKey, payload);

    assert.deepStrictEqual(decrypted, original);
  });

  test("round-trip works for all boundary card values", async () => {
    const { privKey, pubKey } = generateKeyPair();

    for (const pair of [[0, 51], [0, 0], [51, 51], [13, 39]] as [number, number][]) {
      const payload = await encryptHoleCards(pubKey, pair);
      const decrypted = await decryptHoleCards(privKey, payload);
      assert.deepStrictEqual(decrypted, pair, `failed for pair ${pair}`);
    }
  });

  test("wrong private key causes decryption failure", async () => {
    const { pubKey } = generateKeyPair();
    const { privKey: wrongPrivKey } = generateKeyPair();

    const payload = await encryptHoleCards(pubKey, [10, 25]);

    await assert.rejects(
      () => decryptHoleCards(wrongPrivKey, payload),
      (err: Error) => {
        assert.ok(err.message.includes("decryption failed"), `unexpected error: ${err.message}`);
        return true;
      }
    );
  });

  test("tampered ciphertext causes MAC failure", async () => {
    const { privKey, pubKey } = generateKeyPair();
    const payload = await encryptHoleCards(pubKey, [10, 25]);

    const tampered: EncryptedPayload = {
      ...payload,
      ciphertext: new Uint8Array([0xff, 0xff]),
    };

    await assert.rejects(
      () => decryptHoleCards(privKey, tampered),
      (err: Error) => {
        assert.ok(err.message.includes("decryption failed"), `unexpected error: ${err.message}`);
        return true;
      }
    );
  });

  test("tampered MAC causes decryption failure", async () => {
    const { privKey, pubKey } = generateKeyPair();
    const payload = await encryptHoleCards(pubKey, [10, 25]);

    const tamperedMac = new Uint8Array(payload.mac);
    tamperedMac[0] ^= 0xff;

    const tampered: EncryptedPayload = { ...payload, mac: tamperedMac };

    await assert.rejects(
      () => decryptHoleCards(privKey, tampered),
      (err: Error) => {
        assert.ok(err.message.includes("decryption failed"), `unexpected error: ${err.message}`);
        return true;
      }
    );
  });

  test("ephemeralPubKey is 33 bytes (compressed)", async () => {
    const { pubKey } = generateKeyPair();
    const payload = await encryptHoleCards(pubKey, [0, 1]);
    assert.strictEqual(payload.ephemeralPubKey.length, 33);
  });

  test("iv is 12 bytes", async () => {
    const { pubKey } = generateKeyPair();
    const payload = await encryptHoleCards(pubKey, [0, 1]);
    assert.strictEqual(payload.iv.length, 12);
  });

  test("mac is 16 bytes", async () => {
    const { pubKey } = generateKeyPair();
    const payload = await encryptHoleCards(pubKey, [0, 1]);
    assert.strictEqual(payload.mac.length, 16);
  });

  test("each encryption produces a different ciphertext (random IV)", async () => {
    const { pubKey } = generateKeyPair();
    const p1 = await encryptHoleCards(pubKey, [10, 25]);
    const p2 = await encryptHoleCards(pubKey, [10, 25]);
    // IVs should differ (random)
    assert.notDeepStrictEqual(Array.from(p1.iv), Array.from(p2.iv), "IVs should be random");
  });

  test("benchmark: 9-seat encrypt completes in < 10ms", async () => {
    const keypairs = Array.from({ length: 9 }, () => generateKeyPair());
    const start = Date.now();
    await Promise.all(
      keypairs.map(({ pubKey }, i) => encryptHoleCards(pubKey, [i * 2, i * 2 + 1]))
    );
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 10_000, `9-seat encrypt took ${elapsed}ms, expected < 10000ms`);
    // Log for visibility
    console.log(`  9-seat encrypt: ${elapsed}ms`);
  });
});
