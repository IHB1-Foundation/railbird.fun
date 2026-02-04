// OwnerView API client for wallet authentication and hole card fetching

import { type Address } from "viem";

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

export interface OwnerViewClientConfig {
  baseUrl: string;
  signMessage: (message: string) => Promise<string>;
  address: Address;
}

export class OwnerViewClient {
  private baseUrl: string;
  private signMessage: (message: string) => Promise<string>;
  private address: Address;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: OwnerViewClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.signMessage = config.signMessage;
    this.address = config.address;
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
   * Get hole cards for the authenticated user's seat
   */
  async getHoleCards(tableId: string | number, handId: string | number): Promise<HoleCardsResponse> {
    await this.ensureAuthenticated();

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

    return res.json() as Promise<HoleCardsResponse>;
  }

  /**
   * Get the current token (if authenticated)
   */
  getToken(): string | null {
    return this.token;
  }
}
