import { describe, it, expect } from "vitest";
import { decryptHoleCards, DecryptionError } from "../auth/holeCardDecrypt";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

// ---------------------------------------------------------------------------
// Minimal ECIES encrypt helper (mirrors ownerview/src/dealer/eciesEncrypt.ts)
// ---------------------------------------------------------------------------

async function eciesEncrypt(
  recipientPubKey: Uint8Array,
  card1: number,
  card2: number
): Promise<{ ephemeralPubKey: string; iv: string; ciphertext: string; mac: string }> {
  const ephPrivKey = secp256k1.utils.randomSecretKey();
  const ephPubKey  = secp256k1.getPublicKey(ephPrivKey, true);

  const sharedPoint = secp256k1.getSharedSecret(ephPrivKey, recipientPubKey, true);
  const sharedX     = sharedPoint.slice(1);

  const aesKey = hkdf(sha256, sharedX, undefined, undefined, 32);
  const iv     = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    "raw", aesKey, { name: "AES-GCM" }, false, ["encrypt"]
  );

  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    new Uint8Array([card1, card2])
  ));

  const ciphertext = encrypted.slice(0, encrypted.length - 16);
  const mac        = encrypted.slice(encrypted.length - 16);

  const toHex = (b: Uint8Array) => "0x" + Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
  return {
    ephemeralPubKey: toHex(ephPubKey),
    iv:              toHex(iv),
    ciphertext:      toHex(ciphertext),
    mac:             toHex(mac),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const privKey = secp256k1.utils.randomSecretKey();
const pubKey  = secp256k1.getPublicKey(privKey, true);

describe("decryptHoleCards", () => {
  it("decrypts correctly encrypted cards", async () => {
    const payload = await eciesEncrypt(pubKey, 0, 51); // 2♠, A♣
    const [c1, c2] = await decryptHoleCards(privKey, payload);
    expect(c1).toBe(0);
    expect(c2).toBe(51);
  });

  it("decrypts arbitrary card values 0-51", async () => {
    for (const [c1, c2] of [[13, 26], [7, 44], [0, 0]] as [number, number][]) {
      const payload = await eciesEncrypt(pubKey, c1, c2);
      const result = await decryptHoleCards(privKey, payload);
      expect(result).toEqual([c1, c2]);
    }
  });

  it("throws DecryptionError with reason mac_failure when wrong private key is used", async () => {
    const payload   = await eciesEncrypt(pubKey, 5, 10);
    const wrongPriv = secp256k1.utils.randomSecretKey();
    await expect(decryptHoleCards(wrongPriv, payload)).rejects.toThrow(DecryptionError);
    const err = await decryptHoleCards(wrongPriv, payload).catch(e => e) as DecryptionError;
    expect(err.reason).toBe("mac_failure");
  });

  it("throws DecryptionError with reason data_corruption for odd-length hex (unparseable)", async () => {
    // hexToBytes throws on odd-length hex strings, which maps to data_corruption
    const badPayload = {
      ephemeralPubKey: "0x1", // odd-length hex → parse error
      iv: "0x" + "00".repeat(12),
      ciphertext: "0x" + "00".repeat(2),
      mac: "0x" + "00".repeat(16),
    };
    await expect(decryptHoleCards(privKey, badPayload)).rejects.toThrow(DecryptionError);
    const err = await decryptHoleCards(privKey, badPayload).catch(e => e) as DecryptionError;
    expect(err.reason).toBe("data_corruption");
  });

  it("throws DecryptionError with reason key_mismatch for invalid ephemeral pubkey bytes", async () => {
    const badPayload = {
      ephemeralPubKey: "0x" + "00".repeat(33), // all-zero point is not on secp256k1
      iv: "0x" + "00".repeat(12),
      ciphertext: "0x" + "00".repeat(2),
      mac: "0x" + "00".repeat(16),
    };
    await expect(decryptHoleCards(privKey, badPayload)).rejects.toThrow(DecryptionError);
    const err = await decryptHoleCards(privKey, badPayload).catch(e => e) as DecryptionError;
    expect(err.reason).toBe("key_mismatch");
  });

  it("throws DecryptionError when mac is corrupted (bit flip)", async () => {
    const payload = await eciesEncrypt(pubKey, 3, 7);
    // Flip one byte in the MAC
    const macBytes = Buffer.from(payload.mac.slice(2), "hex");
    macBytes[0] ^= 0xff;
    const badPayload = { ...payload, mac: "0x" + macBytes.toString("hex") };
    await expect(decryptHoleCards(privKey, badPayload)).rejects.toThrow(DecryptionError);
  });
});
