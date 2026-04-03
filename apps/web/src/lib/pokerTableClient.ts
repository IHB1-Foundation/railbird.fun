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
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const POKER_TABLE_ABI = [
  {
    name: "MAX_SEATS",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "registerSeat",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "seatIndex", type: "uint8" },
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [],
  },
] as const;

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
}

export interface RegisterSeatResult {
  registerTxHash: Hash;
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

  return { registerTxHash };
}
