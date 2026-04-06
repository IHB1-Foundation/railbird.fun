// Shared crypto utilities — import from here to avoid duplicate implementations.

/**
 * Decode a hex string (with or without 0x prefix) to a Uint8Array.
 * Throws if the hex string has an odd length.
 */
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error(`Invalid hex string (odd length): ${hex}`);
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
