/**
 * T3.3 (bot): Encryption key derivation + on-chain registration for the agent bot.
 *
 * Derives a deterministic secp256k1 encryption key pair by signing a fixed message
 * with the agent's wallet private key. The derived key is used for ECIES encryption
 * of hole cards by the dealer service.
 *
 * Key derivation (matches web client T3.1):
 *   message  = "Railbird Encryption Key Derivation v1"
 *   signature = personal_sign(message, agentAddress)
 *   privKey  = keccak256(signature bytes)   // 32 bytes
 *   pubKey   = secp256k1.getPublicKey(privKey, compressed=true)  // 33 bytes
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { signMessage } from "viem/accounts";
import { createPublicClient, http, toHex, type Address, type Chain } from "viem";

const DERIVATION_MESSAGE = "Railbird Encryption Key Derivation v1";

export interface EncryptionKeyPair {
  privKey: Uint8Array; // 32-byte secp256k1 private key
  pubKey: Uint8Array;  // 33-byte compressed secp256k1 public key
}

const POKER_TABLE_ENCRYPTION_ABI = [
  {
    name: "registerEncryptionKey",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "seatIndex", type: "uint8" },
      { name: "pubKey", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "getEncryptionKey",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "seatIndex", type: "uint8" }],
    outputs: [{ type: "bytes" }],
  },
] as const;

/**
 * Derive a deterministic ECIES encryption key pair from the agent's wallet private key.
 * Same derivation path as the web client (T3.1).
 */
export async function deriveEncryptionKeyPair(
  privateKey: `0x${string}`
): Promise<EncryptionKeyPair> {
  const signature = await signMessage({
    message: DERIVATION_MESSAGE,
    privateKey,
  });

  const sigBytes = hexToBytes(signature);
  const privKey = keccak_256(sigBytes);

  if (!secp256k1.utils.isValidSecretKey(privKey)) {
    throw new Error("Derived key is not a valid secp256k1 private key");
  }

  const pubKey = secp256k1.getPublicKey(privKey, true); // compressed
  return { privKey, pubKey };
}

/**
 * Register the agent's ECIES encryption public key on-chain for a given seat.
 * Skips the transaction if the same key is already registered.
 *
 * @param rpcUrl     Chain RPC URL
 * @param chain      Viem chain config
 * @param walletClient  Viem wallet client for submitting tx
 * @param tableAddress  PokerTable contract address
 * @param seatIndex  Seat index to register for
 * @param pubKey     33-byte compressed secp256k1 public key
 * @returns tx hash, or undefined if skipped
 */
export async function ensureEncryptionKeyRegistered(params: {
  rpcUrl: string;
  chain: Chain;
  privateKey: `0x${string}`;
  address: Address;
  tableAddress: `0x${string}`;
  seatIndex: number;
  pubKey: Uint8Array;
  writeContract: (args: unknown) => Promise<`0x${string}`>;
}): Promise<`0x${string}` | undefined> {
  const { rpcUrl, chain, tableAddress, seatIndex, pubKey, writeContract } = params;

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  // Check existing registration
  const existing = await publicClient.readContract({
    address: tableAddress,
    abi: POKER_TABLE_ENCRYPTION_ABI,
    functionName: "getEncryptionKey",
    args: [seatIndex],
  }) as `0x${string}`;

  const newKeyHex = toHex(pubKey);
  if (existing && existing !== "0x" && existing.toLowerCase() === newKeyHex.toLowerCase()) {
    console.log(`[EncryptionKey] Key already registered for seat ${seatIndex}, skipping`);
    return undefined;
  }

  console.log(`[EncryptionKey] Registering encryption key for seat ${seatIndex}...`);

  const txHash = await writeContract({
    address: tableAddress,
    abi: POKER_TABLE_ENCRYPTION_ABI,
    functionName: "registerEncryptionKey",
    args: [seatIndex, pubKey],
  }) as `0x${string}`;

  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: parseInt(process.env.TX_TIMEOUT_MS || "60000", 10),
  });
  console.log(`[EncryptionKey] Registered for seat ${seatIndex}: ${txHash}`);

  return txHash;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
