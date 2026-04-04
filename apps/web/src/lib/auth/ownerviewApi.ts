// OwnerView API client for authentication and hole cards

import type { NonceResponse, VerifyResponse, HoleCardsResponse, EncryptedHoleCardsResponse } from "./types";
import { decryptHoleCards, DecryptionError } from "./holeCardDecrypt";

const OWNERVIEW_URL =
  process.env.NEXT_PUBLIC_OWNERVIEW_URL || "https://ownerview.railbird.fun";

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
 * Get hole cards for the authenticated user's seat.
 *
 * If a decryption key is provided, the server's encrypted response is decrypted
 * client-side and the plaintext cards are returned. This ensures the server never
 * sees plaintext cards.
 *
 * If no decryption key is provided (legacy / fallback), the raw encrypted payload
 * is returned as-is (caller must handle decryption separately).
 *
 * @param token   Auth session token
 * @param tableId Table identifier
 * @param handId  Hand identifier
 * @param privKey Optional: 32-byte secp256k1 private key for client-side decryption
 */
export async function getHoleCards(
  token: string,
  tableId: string,
  handId: string,
  privKey?: Uint8Array
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
