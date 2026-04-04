import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import type { Card } from "../holecards/types.js";

/**
 * ECIES encryption payload for hole cards.
 *
 * Scheme: secp256k1 ECDH → HKDF-SHA256 → AES-256-GCM
 *   - ephemeralPubKey: 33-byte compressed secp256k1 public key
 *   - iv: 12-byte random nonce for AES-GCM
 *   - ciphertext: AES-GCM encrypted card payload (2 bytes)
 *   - mac: 16-byte GCM authentication tag
 *
 * All fields are Uint8Array for browser compatibility.
 */
export interface EncryptedPayload {
  ephemeralPubKey: Uint8Array; // 33 bytes, compressed
  iv: Uint8Array;              // 12 bytes
  ciphertext: Uint8Array;      // variable length (typically 2 bytes for 2 cards)
  mac: Uint8Array;             // 16 bytes (AES-GCM tag)
}

const AES_KEY_LEN = 32; // AES-256
const IV_LEN = 12;      // AES-GCM standard nonce
const TAG_LEN = 16;     // AES-GCM authentication tag

/**
 * Encrypt hole cards with a secp256k1 ECIES public key.
 *
 * Flow:
 *  1. Generate ephemeral keypair
 *  2. ECDH(ephemeralPrivKey, recipientPubKey) → sharedPoint
 *  3. HKDF-SHA256(sharedPoint.x) → 32-byte AES key
 *  4. AES-256-GCM encrypt([card1, card2]) → { ciphertext, mac }
 *  5. Return { ephemeralPubKey, iv, ciphertext, mac }
 *
 * @param pubKey Recipient's secp256k1 public key (compressed 33 bytes)
 * @param cards Two hole cards (0–51 each)
 */
export async function encryptHoleCards(
  pubKey: Uint8Array,
  cards: [Card, Card]
): Promise<EncryptedPayload> {
  // 1. Ephemeral keypair
  const ephemeralPrivKey = secp256k1.utils.randomSecretKey();
  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivKey, true); // compressed

  // 2. ECDH: compute shared secret
  const sharedPoint = secp256k1.getSharedSecret(ephemeralPrivKey, pubKey, true);
  // sharedPoint is a 33-byte compressed point; use the x-coordinate (bytes 1..33)
  const sharedX = sharedPoint.slice(1);

  // 3. HKDF-SHA256 to derive AES key
  const aesKey = hkdf(sha256, sharedX, undefined, undefined, AES_KEY_LEN);

  // 4. AES-256-GCM encrypt
  const iv = randomBytes(IV_LEN);
  const plaintext = new Uint8Array([cards[0], cards[1]]);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    aesKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encryptedBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: TAG_LEN * 8 },
    cryptoKey,
    plaintext
  );

  // AES-GCM output: ciphertext || tag
  const encryptedBytes = new Uint8Array(encryptedBuf);
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - TAG_LEN);
  const mac = encryptedBytes.slice(encryptedBytes.length - TAG_LEN);

  return { ephemeralPubKey, iv, ciphertext, mac };
}

/**
 * Decrypt hole cards using the recipient's secp256k1 private key.
 *
 * @param privKey Recipient's secp256k1 private key (32 bytes)
 * @param payload Encrypted payload from encryptHoleCards
 * @returns [card1, card2]
 * @throws If MAC verification fails or decryption fails
 */
export async function decryptHoleCards(
  privKey: Uint8Array,
  payload: EncryptedPayload
): Promise<[Card, Card]> {
  const { ephemeralPubKey, iv, ciphertext, mac } = payload;

  // ECDH with recipient's private key
  const sharedPoint = secp256k1.getSharedSecret(privKey, ephemeralPubKey, true);
  const sharedX = sharedPoint.slice(1);

  // Derive AES key
  const aesKey = hkdf(sha256, sharedX, undefined, undefined, AES_KEY_LEN);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    aesKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // Reconstitute ciphertext || tag for AES-GCM
  const ciphertextWithTag = new Uint8Array(ciphertext.length + mac.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(mac, ciphertext.length);

  let decryptedBuf: ArrayBuffer;
  try {
    decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: TAG_LEN * 8 },
      cryptoKey,
      ciphertextWithTag
    );
  } catch {
    throw new Error("ECIES decryption failed: MAC verification failed or invalid ciphertext");
  }

  const decrypted = new Uint8Array(decryptedBuf);
  if (decrypted.length !== 2) {
    throw new Error(`ECIES decryption failed: unexpected plaintext length ${decrypted.length}`);
  }

  return [decrypted[0] as Card, decrypted[1] as Card];
}
