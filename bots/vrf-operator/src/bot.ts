import { randomBytes } from "crypto";
import { bytesToHex, encodePacked, keccak256, stringToHex } from "viem";
import { ChainClient, type VrfRequest } from "./chain/client.js";
import { createLogger, CircuitBreaker, CircuitOpenError } from "@playerco/shared";

export interface VrfOperatorBotConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  vrfAdapterAddress: `0x${string}`;
  pokerTableAddress?: `0x${string}`;
  pokerTableAddresses?: `0x${string}`[];
  chainId?: number;
  pollIntervalMs?: number;
  minConfirmations?: number;
  rescanWindow?: number;
  rescanFromRequestId?: bigint;
  randomSalt?: string;
  fixedRandomness?: bigint;
}

export interface VrfOperatorStats {
  scannedRequests: number;
  fulfilledRequests: number;
  skippedNotReady: number;
  errors: number;
  lastFulfilledRequestId: bigint;
  lastFulfilledTxHash: string;
}

/** Maximum pending VRF requests tracked at any time. */
const MAX_PENDING_REQUESTS = 1_000;
/** Auto-expire pending requests after this many ms (1 hour). */
const PENDING_STALE_AFTER_MS = 60 * 60 * 1000;

export class VrfOperatorBot {
  private readonly chainClient: ChainClient;
  private readonly config: VrfOperatorBotConfig;
  private running: boolean = false;
  private lastSeenRequestId: bigint = 1n;
  private readonly pendingRequestIds: Set<bigint> = new Set();
  /** Tracks when each request was added to pendingRequestIds (for stale cleanup). */
  private readonly pendingAddedAt: Map<bigint, number> = new Map();
  private readonly log = createLogger({ service: "vrf-operator" });

  private readonly stats: VrfOperatorStats = {
    scannedRequests: 0,
    fulfilledRequests: 0,
    skippedNotReady: 0,
    errors: 0,
    lastFulfilledRequestId: 0n,
    lastFulfilledTxHash: "",
  };

  private rpcCircuit = new CircuitBreaker({ name: "RPC", failureThreshold: 5, recoveryTimeoutMs: 30_000 });

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

  getRpcCircuitState(): string {
    return this.rpcCircuit.circuitState;
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

    // Validate all configured table addresses use this VRF adapter
    const tablesToValidate = this.config.pokerTableAddresses?.length
      ? this.config.pokerTableAddresses
      : this.config.pokerTableAddress
        ? [this.config.pokerTableAddress]
        : [];

    for (const tableAddress of tablesToValidate) {
      const tableAdapter = await this.chainClient.getTableVrfAdapter(tableAddress);
      if (tableAdapter.toLowerCase() !== this.config.vrfAdapterAddress.toLowerCase()) {
        throw new Error(
          `VRF adapter mismatch. table=${tableAddress} uses ${tableAdapter}, ` +
            `but bot is configured with VRF_ADAPTER_ADDRESS=${this.config.vrfAdapterAddress}`
        );
      }
      this.log.info({ table: tableAddress, adapter: tableAdapter }, "Verified table VRF adapter");
    }

    this.lastSeenRequestId =
      this.config.rescanFromRequestId ??
      (nextRequestId > rescanWindow ? nextRequestId - rescanWindow : 1n);

    this.log.info({
      address: this.address,
      adapter: this.config.vrfAdapterAddress,
      pollIntervalMs: pollInterval,
      minConfirmations: minConfirmations.toString(),
      initialScanFrom: this.lastSeenRequestId.toString(),
      tables: tablesToValidate,
    }, "VRFOperator starting");
    if (this.config.fixedRandomness !== undefined) {
      this.log.warn({ fixedRandomness: this.config.fixedRandomness.toString() }, "Fixed randomness mode enabled");
    }

    while (this.running) {
      try {
        await this.rpcCircuit.execute(() => this.tick(minConfirmations));
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          this.log.warn({ circuit: "RPC" }, "RPC circuit open — skipping tick");
        } else {
          this.stats.errors += 1;
          this.log.error({ err: error }, "Tick error");
        }
      }
      await this.sleep(pollInterval);
    }

    this.log.info({ stats: this.stats }, "VRFOperator stopped");
  }

  /** Remove stale pending requests and enforce max size. */
  private cleanPendingRequests(): void {
    const now = Date.now();
    let staleRemoved = 0;

    // Remove requests that have been pending too long
    for (const [id, addedAt] of this.pendingAddedAt) {
      if (now - addedAt > PENDING_STALE_AFTER_MS) {
        this.pendingRequestIds.delete(id);
        this.pendingAddedAt.delete(id);
        staleRemoved++;
      }
    }
    if (staleRemoved > 0) {
      this.log.warn({ staleRemoved, pendingCount: this.pendingRequestIds.size }, "Removed stale pending VRF requests");
    }
  }

  private async tick(minConfirmations: bigint): Promise<void> {
    // Clean stale requests before each tick
    this.cleanPendingRequests();

    const nextRequestId = await this.chainClient.getNextRequestId();
    for (let id = this.lastSeenRequestId; id < nextRequestId; id += 1n) {
      if (this.pendingRequestIds.size >= MAX_PENDING_REQUESTS) {
        this.log.warn({ limit: MAX_PENDING_REQUESTS, id: id.toString() }, "Pending request limit reached, skipping");
        break;
      }
      this.pendingRequestIds.add(id);
      this.pendingAddedAt.set(id, Date.now());
      this.stats.scannedRequests += 1;
    }
    this.lastSeenRequestId = nextRequestId;

    if (this.pendingRequestIds.size === 0) {
      return;
    }

    this.log.debug({ pendingCount: this.pendingRequestIds.size, heapUsedMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) }, "Processing pending requests");

    const currentBlock = await this.chainClient.getBlockNumber();
    const latestBlock = await this.chainClient.getLatestBlock();
    const ids = [...this.pendingRequestIds].sort((a, b) => (a < b ? -1 : 1));

    for (const requestId of ids) {
      const request = await this.chainClient.getRequest(requestId);

      if (request.table === "0x0000000000000000000000000000000000000000" || request.fulfilled) {
        this.pendingRequestIds.delete(requestId);
        this.pendingAddedAt.delete(requestId);
        continue;
      }

      if (request.requestedBlock + minConfirmations > currentBlock) {
        this.stats.skippedNotReady += 1;
        continue;
      }

      const randomness =
        this.config.fixedRandomness ??
        this.buildRandomness(requestId, request, latestBlock.number, latestBlock.hash);

      try {
        const hash = await this.chainClient.fulfillRandomness(requestId, randomness);
        this.pendingRequestIds.delete(requestId);
        this.pendingAddedAt.delete(requestId);
        this.stats.fulfilledRequests += 1;
        this.stats.lastFulfilledRequestId = requestId;
        this.stats.lastFulfilledTxHash = hash;
        this.log.info({ requestId: requestId.toString(), tx: hash }, "Fulfilled VRF request");
      } catch (error) {
        this.stats.errors += 1;
        this.log.error({ err: error, requestId: requestId.toString() }, "Fulfill failed");

        // Remove only when already fulfilled by another operator/process.
        const refreshed = await this.chainClient.getRequest(requestId);
        if (refreshed.fulfilled) {
          this.pendingRequestIds.delete(requestId);
          this.pendingAddedAt.delete(requestId);
        }
      }
    }
  }

  /**
   * Returns true when the configured RPC URL points to a local node (anvil / hardhat / localhost).
   * Static salts are only permitted in local environments.
   */
  private isLocalEnvironment(): boolean {
    const url = this.config.rpcUrl.toLowerCase();
    return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("anvil");
  }

  /**
   * Build a randomness value for a VRF fulfillment.
   *
   * The salt is generated fresh per call using Node's cryptographically secure
   * RNG. This means even if all on-chain inputs are known to an adversary, the
   * output is not predictable before it is submitted.
   *
   * A static `randomSalt` may be provided in the config **only** for local /
   * testing environments (anvil / localhost). Using it in production throws.
   */
  private buildRandomness(
    requestId: bigint,
    request: VrfRequest,
    currentBlockNumber: bigint,
    latestBlockHash: `0x${string}`
  ): bigint {
    let saltHex: `0x${string}`;

    if (this.config.randomSalt !== undefined) {
      // Static salt — only permitted locally.
      if (!this.isLocalEnvironment()) {
        throw new Error(
          `[VRFOperator] static randomSalt is not allowed outside local/anvil environments ` +
          `(rpcUrl=${this.config.rpcUrl}). Remove randomSalt from config for production.`
        );
      }
      saltHex = keccak256(stringToHex(this.config.randomSalt));
    } else {
      // Cryptographically secure per-request random salt.
      saltHex = bytesToHex(randomBytes(32));
    }

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
