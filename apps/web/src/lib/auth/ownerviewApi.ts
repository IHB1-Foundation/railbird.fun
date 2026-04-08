// OwnerView API client for authentication and hole cards

import type { NonceResponse, VerifyResponse, HoleCardsResponse, EncryptedHoleCardsResponse } from "./types";
import { decryptHoleCards, DecryptionError } from "./holeCardDecrypt";

const OWNERVIEW_URL =
  process.env.NEXT_PUBLIC_OWNERVIEW_URL || "https://ownerview.railbird.fun";

/**
 * When true, session tokens are stored in httpOnly cookies.
 * JS code uses credentials: 'include' and a CSRF token from the csrf_token cookie.
 * Defaults to true in production.
 */
export const COOKIE_SESSION_ENABLED =
  process.env.NEXT_PUBLIC_COOKIE_SESSION === "true" ||
  (process.env.NEXT_PUBLIC_COOKIE_SESSION !== "false" &&
    process.env.NODE_ENV === "production");

const CSRF_COOKIE_NAME = "csrf_token";

/**
 * Read the CSRF token from the csrf_token cookie (set by OwnerView on verify).
 * Returns empty string if not found.
 */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? match.slice(CSRF_COOKIE_NAME.length + 1) : "";
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Build fetch options for an authenticated request.
 * In cookie mode: credentials: 'include' + X-CSRF-Token header.
 * In bearer mode: Authorization: Bearer <token> header.
 */
function authHeaders(token?: string): RequestInit {
  const requestId = generateRequestId();
  if (COOKIE_SESSION_ENABLED) {
    return {
      credentials: "include" as RequestCredentials,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": readCsrfToken(),
        "X-Request-ID": requestId,
      },
    };
  }
  return {
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

/**
 * Get a nonce for wallet authentication
 */
export async function getNonce(address: string): Promise<NonceResponse> {
  const fetchOptions: RequestInit = COOKIE_SESSION_ENABLED
    ? { credentials: "include", headers: { "X-Request-ID": generateRequestId() } }
    : { headers: { "X-Request-ID": generateRequestId() } };

  const res = await fetch(
    `${OWNERVIEW_URL}/auth/nonce?address=${encodeURIComponent(address)}`,
    fetchOptions
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `Failed to get nonce: ${res.status}`);
  }

  return res.json();
}

/**
 * Verify signature and get session token.
 * In cookie mode: server sets httpOnly cookie; returns { address, expiresAt, cookieSession: true }.
 * In bearer mode: returns { token, address, expiresAt }.
 */
export async function verifySignature(
  address: string,
  nonce: string,
  signature: string
): Promise<VerifyResponse> {
  const fetchOptions: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-ID": generateRequestId() },
    body: JSON.stringify({ address, nonce, signature }),
    ...(COOKIE_SESSION_ENABLED ? { credentials: "include" as RequestCredentials } : {}),
  };

  const res = await fetch(`${OWNERVIEW_URL}/auth/verify`, fetchOptions);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `Failed to verify signature: ${res.status}`);
  }

  return res.json();
}

/**
 * Get hole cards for the authenticated user's seat.
 *
 * If a decryption key is provided, the server's encrypted response is decrypted
 * client-side and the plaintext cards are returned. This ensures the server never
 * sees plaintext cards.
 *
 * @param token   Auth session token (ignored in cookie session mode)
 * @param tableId Table identifier
 * @param handId  Hand identifier
 * @param privKey Optional: 32-byte secp256k1 private key for client-side decryption
 */
export async function getHoleCards(
  token: string | undefined,
  tableId: string,
  handId: string,
  privKey?: Uint8Array
): Promise<HoleCardsResponse> {
  const res = await fetch(
    `${OWNERVIEW_URL}/owner/holecards?tableId=${encodeURIComponent(
      tableId
    )}&handId=${encodeURIComponent(handId)}`,
    authHeaders(token)
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `Failed to get hole cards: ${res.status}`);
  }

  const raw: EncryptedHoleCardsResponse = await res.json();

  if (!privKey) {
    throw new Error(
      "Encryption private key required to decrypt hole cards. " +
      "Call deriveEncryptionKeyPair() first."
    );
  }

  let cards: [number, number];
  try {
    cards = await decryptHoleCards(privKey, raw.encryptedCards);
  } catch (err) {
    if (err instanceof DecryptionError) {
      throw new Error(`Failed to decrypt hole cards (${err.reason}): ${err.message}`);
    }
    throw err;
  }

  return {
    tableId: raw.tableId,
    handId: raw.handId,
    seatIndex: raw.seatIndex,
    cards,
  };
}
