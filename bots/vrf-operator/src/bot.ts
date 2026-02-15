import { encodePacked, keccak256, stringToHex } from "viem";
import { ChainClient, type VrfRequest } from "./chain/client.js";

export interface VrfOperatorBotConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  vrfAdapterAddress: `0x${string}`;
  chainId?: number;
  pollIntervalMs?: number;
  minConfirmations?: number;
  rescanWindow?: number;
  rescanFromRequestId?: bigint;
  randomSalt?: string;
}

export interface VrfOperatorStats {
  scannedRequests: number;
  fulfilledRequests: number;
  skippedNotReady: number;
  errors: number;
  lastFulfilledRequestId: bigint;
  lastFulfilledTxHash: string;
}

export class VrfOperatorBot {
  private readonly chainClient: ChainClient;
  private readonly config: VrfOperatorBotConfig;
  private running: boolean = false;
  private lastSeenRequestId: bigint = 1n;
  private readonly pendingRequestIds: Set<bigint> = new Set();

  private readonly stats: VrfOperatorStats = {
    scannedRequests: 0,
    fulfilledRequests: 0,
    skippedNotReady: 0,
    errors: 0,
    lastFulfilledRequestId: 0n,
    lastFulfilledTxHash: "",
  };

  constructor(config: VrfOperatorBotConfig) {
    this.config = config;
    this.chainClient = new ChainClient({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      vrfAdapterAddress: config.vrfAdapterAddress,
      chainId: config.chainId,
    });
  }

  get address(): `0x${string}` {
    return this.chainClient.address;
  }

  getStats(): VrfOperatorStats {
    return { ...this.stats };
  }

  stop(): void {
    this.running = false;
  }

  async run(): Promise<void> {
    this.running = true;
    const pollInterval = this.config.pollIntervalMs ?? 1500;
    const minConfirmations = BigInt(this.config.minConfirmations ?? 1);
    const rescanWindow = BigInt(this.config.rescanWindow ?? 256);

    const [operator, nextRequestId] = await Promise.all([
      this.chainClient.getOperator(),
      this.chainClient.getNextRequestId(),
    ]);

    if (operator.toLowerCase() !== this.address.toLowerCase()) {
      throw new Error(
        `Configured key is not VRF operator. adapter.operator=${operator}, bot.address=${this.address}`
      );
    }

    this.lastSeenRequestId =
      this.config.rescanFromRequestId ??
      (nextRequestId > rescanWindow ? nextRequestId - rescanWindow : 1n);

    console.log(`[VRFOperator] starting with address=${this.address}`);
    console.log(`[VRFOperator] adapter=${this.config.vrfAdapterAddress}`);
    console.log(`[VRFOperator] pollIntervalMs=${pollInterval}`);
    console.log(`[VRFOperator] minConfirmations=${minConfirmations}`);
    console.log(`[VRFOperator] initialScanFrom=${this.lastSeenRequestId}`);

    while (this.running) {
      try {
        await this.tick(minConfirmations);
      } catch (error) {
        this.stats.errors += 1;
        console.error("[VRFOperator] tick error:", error);
      }
      await this.sleep(pollInterval);
    }

    console.log("[VRFOperator] stopped");
    console.log(`[VRFOperator] stats=${JSON.stringify(this.stats)}`);
  }

  private async tick(minConfirmations: bigint): Promise<void> {
    const nextRequestId = await this.chainClient.getNextRequestId();
    for (let id = this.lastSeenRequestId; id < nextRequestId; id += 1n) {
      this.pendingRequestIds.add(id);
      this.stats.scannedRequests += 1;
    }
    this.lastSeenRequestId = nextRequestId;

    if (this.pendingRequestIds.size === 0) {
      return;
    }

    const currentBlock = await this.chainClient.getBlockNumber();
    const latestBlock = await this.chainClient.getLatestBlock();
    const ids = [...this.pendingRequestIds].sort((a, b) => (a < b ? -1 : 1));

    for (const requestId of ids) {
      const request = await this.chainClient.getRequest(requestId);

      if (request.table === "0x0000000000000000000000000000000000000000" || request.fulfilled) {
        this.pendingRequestIds.delete(requestId);
        continue;
      }

      if (request.requestedBlock + minConfirmations > currentBlock) {
        this.stats.skippedNotReady += 1;
        continue;
      }

      const randomness = this.buildRandomness(requestId, request, latestBlock.number, latestBlock.hash);

      try {
        const hash = await this.chainClient.fulfillRandomness(requestId, randomness);
        this.pendingRequestIds.delete(requestId);
        this.stats.fulfilledRequests += 1;
        this.stats.lastFulfilledRequestId = requestId;
        this.stats.lastFulfilledTxHash = hash;
        console.log(`[VRFOperator] fulfilled requestId=${requestId} tx=${hash}`);
      } catch (error) {
        this.stats.errors += 1;
        console.error(`[VRFOperator] fulfill failed for requestId=${requestId}:`, error);

        // Remove only when already fulfilled by another operator/process.
        const refreshed = await this.chainClient.getRequest(requestId);
        if (refreshed.fulfilled) {
          this.pendingRequestIds.delete(requestId);
        }
      }
    }
  }

  private buildRandomness(
    requestId: bigint,
    request: VrfRequest,
    currentBlockNumber: bigint,
    latestBlockHash: `0x${string}`
  ): bigint {
    const saltHex = keccak256(stringToHex(this.config.randomSalt ?? "railbird-vrf-operator"));
    const digest = keccak256(
      encodePacked(
        [
          "uint256",
          "address",
          "uint256",
          "uint256",
          "uint8",
          "uint256",
          "bytes32",
          "bytes32",
        ],
        [
          requestId,
          request.table,
          request.tableId,
          request.handId,
          request.purpose,
          currentBlockNumber,
          latestBlockHash,
          saltHex,
        ]
      )
    );

    const randomness = BigInt(digest);
    return randomness === 0n ? 1n : randomness;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
