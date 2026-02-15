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
import { monadTestnet } from "viem/chains";
import { ERC20_ABI } from "./nadfun/types";

const CHAIN: Chain = monadTestnet;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const POKER_TABLE_ABI = [
  {
    name: "chipToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
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
    stateMutability: "nonpayable",
    inputs: [
      { name: "seatIndex", type: "uint8" },
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
      { name: "buyIn", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";
}

function getPublicClient() {
  return createPublicClient({
    chain: CHAIN,
    transport: http(getRpcUrl()),
  });
}

function getWalletClient() {
  if (typeof window === "undefined" || !window.ethereum) {
    return null;
  }
  return createWalletClient({
    chain: CHAIN,
    transport: custom(window.ethereum),
  });
}

export interface RegisterSeatParams {
  tableAddress: Address;
  seatIndex: number;
  buyInTokens: string;
  operator?: Address;
}

export interface RegisterSeatResult {
  approveTxHash: Hash | null;
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

export async function registerSeatWithApprove(params: RegisterSeatParams): Promise<RegisterSeatResult> {
  const walletClient = getWalletClient();
  if (!walletClient) {
    throw new Error("No wallet connected");
  }
  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error("No account available");
  }

  const publicClient = getPublicClient();
  const buyIn = parseUnits(params.buyInTokens, 18);
  if (buyIn <= 0n) {
    throw new Error("Buy-in must be greater than 0");
  }

  const chipToken = (await publicClient.readContract({
    address: params.tableAddress,
    abi: POKER_TABLE_ABI,
    functionName: "chipToken",
  })) as Address;

  const allowance = (await publicClient.readContract({
    address: chipToken,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account, params.tableAddress],
  })) as bigint;

  let approveTxHash: Hash | null = null;
  if (allowance < buyIn) {
    approveTxHash = await walletClient.writeContract({
      address: chipToken,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [params.tableAddress, buyIn],
      account,
      chain: CHAIN,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
  }

  const operator = params.operator || ZERO_ADDRESS;
  const registerTxHash = await walletClient.writeContract({
    address: params.tableAddress,
    abi: POKER_TABLE_ABI,
    functionName: "registerSeat",
    args: [params.seatIndex, account, operator, buyIn],
    account,
    chain: CHAIN,
  });
  await publicClient.waitForTransactionReceipt({ hash: registerTxHash });

  return {
    approveTxHash,
    registerTxHash,
  };
}
