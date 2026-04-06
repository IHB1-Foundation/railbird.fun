import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseUnits,
  type Address,
  type Chain,
  type Hash,
} from "viem";
import { POKER_TABLE_ABI } from "@playerco/shared";
import { ZERO_ADDRESS as ZERO_ADDR } from "./utils";

function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_RPC_URL || "https://testnet.hsk.xyz";
}

// HashKey Chain Testnet (chain ID 133)
const HASHKEY_TESTNET: Chain = {
  id: 133,
  name: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: [getRpcUrl()] },
  },
  blockExplorers: {
    default: { name: "HashKey Explorer", url: "https://testnet-explorer.hsk.xyz" },
  },
};

const CHAIN: Chain = HASHKEY_TESTNET;
const ZERO_ADDRESS = ZERO_ADDR as Address;


function getPublicClient() {
  return createPublicClient({
    chain: CHAIN,
    transport: http(getRpcUrl()),
  });
}

function getProvider() {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

function getWalletClient() {
  const provider = getProvider();
  if (!provider) return null;
  return createWalletClient({
    chain: CHAIN,
    transport: custom(provider),
  });
}

export interface RegisterSeatParams {
  tableAddress: Address;
  seatIndex: number;
  buyInKaia: string;
  operator?: Address;
  /**
   * If provided, the encryption public key will be registered on-chain
   * immediately after the seat registration transaction confirms.
   * Pass the compressed secp256k1 public key (33 bytes) from deriveEncryptionKeyPair().
   */
  encryptionPubKey?: Uint8Array;
}

export interface RegisterSeatResult {
  registerTxHash: Hash;
  encryptionKeyTxHash?: Hash;
}

export async function getPokerTableMaxSeats(tableAddress: Address): Promise<number> {
  const client = getPublicClient();
  const result = await client.readContract({
    address: tableAddress,
    abi: POKER_TABLE_ABI,
    functionName: "MAX_SEATS",
  });
  return Number(result);
}

export async function registerSeat(params: RegisterSeatParams): Promise<RegisterSeatResult> {
  const walletClient = getWalletClient();
  if (!walletClient) {
    throw new Error("No wallet connected");
  }
  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error("No account available");
  }

  const publicClient = getPublicClient();
  const buyIn = parseUnits(params.buyInKaia, 18);
  if (buyIn <= 0n) {
    throw new Error("Buy-in must be greater than 0");
  }

  const operator = params.operator || ZERO_ADDRESS;
  const registerTxHash = await walletClient.writeContract({
    address: params.tableAddress,
    abi: POKER_TABLE_ABI,
    functionName: "registerSeat",
    args: [params.seatIndex, account, operator],
    value: buyIn,
    account,
    chain: CHAIN,
  });
  await publicClient.waitForTransactionReceipt({ hash: registerTxHash });

  // Register encryption key immediately after seat registration (if provided)
  let encryptionKeyTxHash: Hash | undefined;
  if (params.encryptionPubKey) {
    encryptionKeyTxHash = await registerEncryptionKeyOnChain({
      tableAddress: params.tableAddress,
      seatIndex: params.seatIndex,
      pubKey: params.encryptionPubKey,
    });
  }

  return { registerTxHash, encryptionKeyTxHash };
}

export interface RegisterEncryptionKeyParams {
  tableAddress: Address;
  seatIndex: number;
  pubKey: Uint8Array;
}

/**
 * Register (or update) the ECIES encryption public key for a seat on-chain.
 * Skips the transaction if the same key is already registered.
 *
 * @returns transaction hash, or undefined if skipped (key already registered)
 */
export async function registerEncryptionKeyOnChain(
  params: RegisterEncryptionKeyParams
): Promise<Hash | undefined> {
  const walletClient = getWalletClient();
  if (!walletClient) throw new Error("No wallet connected");

  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error("No account available");

  const publicClient = getPublicClient();

  // Check if the same key is already registered — skip if so
  const existing = await publicClient.readContract({
    address: params.tableAddress,
    abi: POKER_TABLE_ABI,
    functionName: "getEncryptionKey",
    args: [params.seatIndex],
  }) as `0x${string}`;

  const newKeyHex = "0x" + Array.from(params.pubKey).map(b => b.toString(16).padStart(2, "0")).join("");
  if (existing && existing !== "0x" && existing.toLowerCase() === newKeyHex.toLowerCase()) {
    return undefined; // same key already registered, skip
  }

  const pubKeyHex = ("0x" + Array.from(params.pubKey).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
  const txHash = await walletClient.writeContract({
    address: params.tableAddress,
    abi: POKER_TABLE_ABI,
    functionName: "registerEncryptionKey",
    args: [params.seatIndex, pubKeyHex],
    account,
    chain: CHAIN,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return txHash;
}

/**
 * Get the registered ECIES encryption public key for a seat.
 * Returns null if no key is registered.
 */
export async function getEncryptionKeyOnChain(
  tableAddress: Address,
  seatIndex: number
): Promise<Uint8Array | null> {
  const publicClient = getPublicClient();
  const hex = await publicClient.readContract({
    address: tableAddress,
    abi: POKER_TABLE_ABI,
    functionName: "getEncryptionKey",
    args: [seatIndex],
  }) as `0x${string}`;

  if (!hex || hex === "0x") return null;
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length === 0) return null;
  // Validate hex format: must be even-length and contain only hex chars
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(h)) {
    console.error("getEncryptionKeyOnChain: unexpected hex format", hex);
    return null;
  }
  try {
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  } catch (err) {
    console.error("getEncryptionKeyOnChain: failed to parse hex key", err);
    return null;
  }
}
