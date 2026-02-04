// OwnerView API client for authentication and hole cards

import type { NonceResponse, VerifyResponse, HoleCardsResponse } from "./types";

const OWNERVIEW_URL =
  process.env.NEXT_PUBLIC_OWNERVIEW_URL || "http://localhost:3001";

/**
 * Get a nonce for wallet authentication
 */
export async function getNonce(address: string): Promise<NonceResponse> {
  const res = await fetch(
    `${OWNERVIEW_URL}/auth/nonce?address=${encodeURIComponent(address)}`
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `Failed to get nonce: ${res.status}`);
  }

  return res.json();
}

/**
 * Verify signature and get session token
 */
export async function verifySignature(
  address: string,
  nonce: string,
  signature: string
): Promise<VerifyResponse> {
  const res = await fetch(`${OWNERVIEW_URL}/auth/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address, nonce, signature }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `Failed to verify signature: ${res.status}`);
  }

  return res.json();
}

/**
 * Get hole cards for the authenticated user's seat
 */
export async function getHoleCards(
  token: string,
  tableId: string,
  handId: string
): Promise<HoleCardsResponse> {
  const res = await fetch(
    `${OWNERVIEW_URL}/owner/holecards?tableId=${encodeURIComponent(
      tableId
    )}&handId=${encodeURIComponent(handId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `Failed to get hole cards: ${res.status}`);
  }

  return res.json();
}
