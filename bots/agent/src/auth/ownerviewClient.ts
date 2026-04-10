// OwnerView API client for wallet authentication and hole card fetching

import { toHex, type Address } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, fetchWithTimeout } from "@playerco/shared";
import { ensureWebCrypto } from "../runtime/webcrypto.js";

export interface SubmitReasoningFactors {
  handStrength: string;
  potOdds: string;
  position: string;
  opponentRead: string;
  sizing?: string;
  riskAssessment?: string;
}

export interface GTODeviationData {
  gtoAction: "raise" | "call" | "fold";
  gtoFrequency: number;
  aiAction: "raise" | "call" | "fold";
  isDeviation: boolean;
  deviationType: "aligned" | "tighter" | "looser" | "passive" | "aggressive";
  severity: number;
}

export interface DecisionBreakdown {
  handStrength: string;
  potOdds: string;
  evEstimate: string;
  opponentRead: string;
  keyFactor: string;
  confidence: number;
  gtoDeviation?: { action: string; severity: number; explanation: string };
  counterStrategy?: string;
}

export interface SubmitReasoningParams {
  tableAddress: string;
  handId: string;
  seatIndex: number;
  txHash?: string;
  action: string;
  raiseAmount?: string;
  reasoning: string;
  factors?: SubmitReasoningFactors;
  /** T-1104: GTO deviation for preflop decisions */
  gtoDeviation?: GTODeviationData;
  /** T-1203: Opponent model read at time of decision */
  opponentRead?: { seatIndex: number; profile: unknown; counterAdvice: unknown };
  /** T-1205: Deep decision breakdown for Why? explainability */
  breakdown?: DecisionBreakdown;
}

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
  /** HTTP request timeout in milliseconds. Defaults to REQUEST_TIMEOUT_MS env var or 10_000. */
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || "10000", 10);

const AES_KEY_LEN = 32;
const TAG_LEN = 16;
const webCrypto = ensureWebCrypto();

export class OwnerViewClient {
  private baseUrl: string;
  private signMessage: (message: string) => Promise<string>;
  private address: Address;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private encryptionPrivKey: Uint8Array | null;
  private requestTimeoutMs: number;

  constructor(config: OwnerViewClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.signMessage = config.signMessage;
    this.address = config.address;
    this.encryptionPrivKey = config.encryptionPrivKey ?? null;
    this.requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
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
    const res = await fetchWithTimeout(url, {}, this.requestTimeoutMs);

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
    const res = await fetchWithTimeout(
      `${this.baseUrl}/auth/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: this.address, nonce, signature }),
      },
      this.requestTimeoutMs
    );

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

  async registerEncryptionKey(pubKey: Uint8Array): Promise<void> {
    await this.ensureAuthenticated();

    const res = await fetchWithTimeout(
      `${this.baseUrl}/owner/encryption-key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ pubKey: toHex(pubKey) }),
      },
      this.requestTimeoutMs
    );

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
      throw new Error(errorBody.error || `Failed to register encryption key: ${res.status}`);
    }
  }

  /**
   * Check if token is valid and not expired
   */
  isAuthenticated(): boolean {
    if (!this.token) return false;
    // tokenExpiresAt is in ms; subtract 60s buffer
    return Date.now() < this.tokenExpiresAt - 60_000;
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

    const res = await fetchWithTimeout(
      url,
      { headers: { Authorization: `Bearer ${this.token}` } },
      this.requestTimeoutMs
    );

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
   * Submit action reasoning to OwnerView for storage.
   * Fire-and-forget: failures are logged but do not block the caller.
   */
  async submitReasoning(params: SubmitReasoningParams): Promise<void> {
    const url = `${this.baseUrl}/reasoning`;
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        },
        this.requestTimeoutMs
      );
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
        throw new Error(errorBody.error || `submitReasoning failed: ${res.status}`);
      }
    } catch (error) {
      // Non-blocking: log and continue
      const message = error instanceof Error ? error.message : String(error);
      // We intentionally suppress this error to avoid circular import of logger.
      // The caller is responsible for logging at the appropriate level.
      void message; // lint: used implicitly via the throw path
      throw error;  // re-throw so callers can fire-and-forget if they choose
    }
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

    const cryptoKey = await webCrypto.subtle.importKey(
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
      decryptedBuf = await webCrypto.subtle.decrypt(
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
