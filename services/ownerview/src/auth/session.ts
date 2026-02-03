import * as jose from "jose";
import { verifyMessage } from "viem";
import type { Address } from "@playerco/shared";
import type { AuthConfig, SessionPayload } from "./types.js";

/**
 * Create the message that the wallet should sign
 */
export function createSignMessage(nonce: string): string {
  return `Sign this message to authenticate with PlayerCo OwnerView.\n\nNonce: ${nonce}`;
}

/**
 * Verify a wallet signature for a nonce
 */
export async function verifyWalletSignature(
  address: Address,
  nonce: string,
  signature: `0x${string}`
): Promise<boolean> {
  const message = createSignMessage(nonce);
  try {
    const valid = await verifyMessage({
      address,
      message,
      signature,
    });
    return valid;
  } catch {
    return false;
  }
}

/**
 * Session manager for creating and verifying JWT tokens
 */
export class SessionManager {
  private secret: Uint8Array;
  private ttlMs: number;

  constructor(config: Pick<AuthConfig, "jwtSecret" | "sessionTtlMs">) {
    // jose requires the secret as Uint8Array
    this.secret = new TextEncoder().encode(config.jwtSecret);
    this.ttlMs = config.sessionTtlMs;
  }

  /**
   * Create a session token for the given address
   */
  async createToken(address: Address): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + Math.floor(this.ttlMs / 1000);

    const token = await new jose.SignJWT({ sub: address.toLowerCase() })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(this.secret);

    return token;
  }

  /**
   * Verify a session token and return the payload
   */
  async verifyToken(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jose.jwtVerify(token, this.secret);
      if (!payload.sub || !payload.iat || !payload.exp) {
        return null;
      }
      return {
        sub: payload.sub as Address,
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch {
      return null;
    }
  }
}
