// OwnerView API client for wallet authentication and hole card fetching

import { type Address } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export interface NonceResponse {
  nonce: string;
  message: string;
  expiresAt: number;
}

export interface VerifyResponse {
  token: string;
  expiresAt: number;
}

export interface HoleCard {
  card: number; // 0-51
}

export interface HoleCardsResponse {
  tableId: string;
  handId: string;
  seatIndex: number;
  holeCards: HoleCard[];
}

/** Encrypted payload as received from the ownerview server */
interface EncryptedPayloadSerialized {
  ephemeralPubKey: string;
  iv: string;
  ciphertext: string;
  mac: string;
}

export interface OwnerViewClientConfig {
  baseUrl: string;
  signMessage: (message: string) => Promise<string>;
  address: Address;
  /**
   * ECIES encryption private key for decrypting hole cards.
   * Should be derived via deriveEncryptionKeyPair() before passing here.
   * If not provided, getHoleCards() will fail with an error.
   */
  encryptionPrivKey?: Uint8Array;
}

const AES_KEY_LEN = 32;
const TAG_LEN = 16;

export class OwnerViewClient {
  private baseUrl: string;
  private signMessage: (message: string) => Promise<string>;
  private address: Address;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private encryptionPrivKey: Uint8Array | null;

  constructor(config: OwnerViewClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.signMessage = config.signMessage;
    this.address = config.address;
    this.encryptionPrivKey = config.encryptionPrivKey ?? null;
  }

  /**
   * Update the encryption private key (called after key derivation completes).
   */
  setEncryptionPrivKey(privKey: Uint8Array): void {
    this.encryptionPrivKey = privKey;
  }

  /**
   * Get a nonce for wallet authentication
   */
  private async getNonce(): Promise<NonceResponse> {
    const url = `${this.baseUrl}/auth/nonce?address=${encodeURIComponent(this.address)}`;
    const res = await fetch(url);

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
      throw new Error(errorBody.error || `Failed to get nonce: ${res.status}`);
    }

    return res.json() as Promise<NonceResponse>;
  }

  /**
   * Verify signature and get session token
   */
  private async verifySignature(nonce: string, signature: string): Promise<VerifyResponse> {
    const res = await fetch(`${this.baseUrl}/auth/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: this.address,
        nonce,
        signature,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
      throw new Error(errorBody.error || `Failed to verify signature: ${res.status}`);
    }

    return res.json() as Promise<VerifyResponse>;
  }

  /**
   * Authenticate with OwnerView service using wallet signature
   */
  async authenticate(): Promise<void> {
    // Get nonce
    const { nonce, message } = await this.getNonce();

    // Sign the message
    const signature = await this.signMessage(message);

    // Verify and get token
    const { token, expiresAt } = await this.verifySignature(nonce, signature);

    this.token = token;
    this.tokenExpiresAt = expiresAt;
  }

  /**
   * Check if token is valid and not expired
   */
  isAuthenticated(): boolean {
    if (!this.token) return false;
    // Add 60 seconds buffer for safety
    return Date.now() < (this.tokenExpiresAt - 60) * 1000;
  }

  /**
   * Ensure we have a valid token, re-authenticate if needed
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated()) {
      await this.authenticate();
    }
  }

  /**
   * Get hole cards for the authenticated user's seat.
   * Fetches encrypted cards from the server and decrypts them client-side.
   *
   * Requires encryptionPrivKey to be set (via constructor or setEncryptionPrivKey).
   */
  async getHoleCards(tableId: string | number, handId: string | number): Promise<HoleCardsResponse> {
    await this.ensureAuthenticated();

    if (!this.encryptionPrivKey) {
      throw new Error("Encryption private key not set — call setEncryptionPrivKey() or pass encryptionPrivKey in config");
    }

    const url = `${this.baseUrl}/owner/holecards?tableId=${encodeURIComponent(
      String(tableId)
    )}&handId=${encodeURIComponent(String(handId))}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
      throw new Error(errorBody.error || `Failed to get hole cards: ${res.status}`);
    }

    const raw = await res.json() as {
      tableId: string;
      handId: string;
      seatIndex: number;
      encryptedCards: EncryptedPayloadSerialized;
    };

    // Client-side ECIES decryption
    const [card1, card2] = await this.decryptHoleCards(raw.encryptedCards);

    return {
      tableId: raw.tableId,
      handId: raw.handId,
      seatIndex: raw.seatIndex,
      holeCards: [{ card: card1 }, { card: card2 }],
    };
  }

  /**
   * Get the current token (if authenticated)
   */
  getToken(): string | null {
    return this.token;
  }

  // ─── ECIES Decryption (secp256k1 ECDH + HKDF-SHA256 + AES-256-GCM) ─────

  private async decryptHoleCards(
    payload: EncryptedPayloadSerialized
  ): Promise<[number, number]> {
    const privKey = this.encryptionPrivKey!;

    const ephemeralPubKey = hexToBytes(payload.ephemeralPubKey);
    const iv = hexToBytes(payload.iv);
    const ciphertext = hexToBytes(payload.ciphertext);
    const mac = hexToBytes(payload.mac);

    // ECDH: sharedPoint = privKey * ephemeralPubKey
    let sharedX: Uint8Array;
    try {
      const sharedPoint = secp256k1.getSharedSecret(privKey, ephemeralPubKey, true);
      sharedX = sharedPoint.slice(1); // x-coordinate only (skip prefix byte)
    } catch (err) {
      throw new Error(`ECIES key mismatch: ${err}`);
    }

    // HKDF-SHA256 -> AES-256 key
    const aesKey = hkdf(sha256, sharedX, undefined, undefined, AES_KEY_LEN);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      aesKey.buffer as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    // Reconstitute ciphertext || tag
    const ciphertextWithTag = new Uint8Array(ciphertext.length + mac.length);
    ciphertextWithTag.set(ciphertext);
    ciphertextWithTag.set(mac, ciphertext.length);

    let decryptedBuf: ArrayBuffer;
    try {
      decryptedBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: TAG_LEN * 8 },
        cryptoKey,
        ciphertextWithTag.buffer as ArrayBuffer
      );
    } catch {
      throw new Error("ECIES decryption failed: MAC verification failed — wrong key or tampered ciphertext");
    }

    const decrypted = new Uint8Array(decryptedBuf);
    if (decrypted.length !== 2) {
      throw new Error(`ECIES decryption failed: unexpected plaintext length ${decrypted.length}`);
    }

    return [decrypted[0], decrypted[1]];
  }
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
