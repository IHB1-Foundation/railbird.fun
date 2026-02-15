import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Account,
  type Address,
  type Chain,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PRODUCTION_VRF_ADAPTER_ABI } from "./productionVrfAbi.js";

export interface VrfRequest {
  table: Address;
  tableId: bigint;
  handId: bigint;
  purpose: number;
  requestedAt: bigint;
  requestedBlock: bigint;
  fulfilled: boolean;
}

export interface ChainClientConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  vrfAdapterAddress: Address;
  chainId?: number;
}

export class ChainClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly account: Account;
  private readonly chain: Chain;
  private readonly vrfAdapterAddress: Address;

  constructor(config: ChainClientConfig) {
    this.chain = {
      id: config.chainId || 10143,
      name: "Monad",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: {
        default: { http: [config.rpcUrl] },
      },
    };

    this.account = privateKeyToAccount(config.privateKey);
    this.vrfAdapterAddress = config.vrfAdapterAddress;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(config.rpcUrl),
    });
  }

  get address(): Address {
    return this.account.address;
  }

  async getOperator(): Promise<Address> {
    return this.publicClient.readContract({
      address: this.vrfAdapterAddress,
      abi: PRODUCTION_VRF_ADAPTER_ABI,
      functionName: "operator",
    }) as Promise<Address>;
  }

  async getNextRequestId(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.vrfAdapterAddress,
      abi: PRODUCTION_VRF_ADAPTER_ABI,
      functionName: "nextRequestId",
    }) as Promise<bigint>;
  }

  async getRequest(requestId: bigint): Promise<VrfRequest> {
    const result = await this.publicClient.readContract({
      address: this.vrfAdapterAddress,
      abi: PRODUCTION_VRF_ADAPTER_ABI,
      functionName: "getRequest",
      args: [requestId],
    });

    const data = result as readonly [Address, bigint, bigint, number, bigint, bigint, boolean];
    return {
      table: data[0],
      tableId: data[1],
      handId: data[2],
      purpose: data[3],
      requestedAt: data[4],
      requestedBlock: data[5],
      fulfilled: data[6],
    };
  }

  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  async getLatestBlock(): Promise<{ number: bigint; hash: `0x${string}` }> {
    const block = await this.publicClient.getBlock();
    return {
      number: block.number,
      hash: block.hash ?? "0x0000000000000000000000000000000000000000000000000000000000000000",
    };
  }

  async fulfillRandomness(requestId: bigint, randomness: bigint): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.vrfAdapterAddress,
      abi: PRODUCTION_VRF_ADAPTER_ABI,
      functionName: "fulfillRandomness",
      args: [requestId, randomness],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }
}
