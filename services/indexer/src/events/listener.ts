// Event listener - subscribes to chain events and dispatches to handlers

import { createPublicClient, http, type Log, decodeEventLog, type Address } from "viem";
import { getChainConfig } from "@playerco/shared";
import { pokerTableAbi, playerRegistryAbi, playerVaultAbi } from "./abis.js";
import * as handlers from "./handlers.js";
import { getAllAgents, getIndexerState, updateIndexerState, upsertSeat, upsertTable } from "../db/index.js";

export interface ListenerConfig {
  pokerTableAddress: Address;
  playerRegistryAddress: Address;
  playerVaultAddress?: Address;
  startBlock?: bigint;
  replayOnStart?: boolean;
  pollIntervalMs?: number;
  logBlockRange?: number;
}

export class EventListener {
  private client;
  private config: ListenerConfig;
  private running = false;
  private tableContext: handlers.EventContext;
  private trackedVaultAddresses = new Set<Address>();
  private static readonly ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

  constructor(config: ListenerConfig) {
    const chainConfig = getChainConfig();
    this.client = createPublicClient({
      transport: http(chainConfig.rpcUrl),
    });
    this.config = {
      ...config,
      pollIntervalMs: config.pollIntervalMs ?? 2000,
      logBlockRange: Math.max(1, config.logBlockRange ?? 90),
    };
    this.trackVaultAddress(config.playerVaultAddress);

    // Default table context - will be updated when we read table info
    this.tableContext = {
      tableId: 1n,
      contractAddress: config.pokerTableAddress,
      smallBlind: 10n,
      bigBlind: 20n,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log("Starting event listener...");
    console.log(`Log block range: ${this.config.logBlockRange}`);
    await this.seedSeatsFromChain();
    await this.loadTrackedVaultAddresses();
    console.log(`Tracking ${this.trackedVaultAddresses.size} vault address(es)`);

    // Get last processed block from DB
    const state = await getIndexerState();
    const configuredStartBlock = this.config.startBlock ?? 0n;
    let fromBlock = configuredStartBlock;

    if (state) {
      const stateBlock = BigInt(state.last_processed_block);
      if (this.config.replayOnStart) {
        fromBlock = configuredStartBlock;
        console.log(
          `Replay mode enabled: starting from configured START_BLOCK ${configuredStartBlock} (cursor was ${stateBlock})`
        );
      } else if (stateBlock > fromBlock) {
        fromBlock = stateBlock;
      }
    }

    console.log(`Resuming from block ${fromBlock}`);

    while (this.running) {
      try {
        const latestBlock = await this.client.getBlockNumber();
        let processedAny = false;

        while (this.running && fromBlock <= latestBlock) {
          // Process in RPC-safe chunks. Monad testnet RPC rejects large eth_getLogs ranges.
          const range = BigInt(this.config.logBlockRange! - 1);
          const toBlock = fromBlock + range < latestBlock ? fromBlock + range : latestBlock;

          await this.processBlockRange(fromBlock, toBlock);

          fromBlock = toBlock + 1n;
          await updateIndexerState(fromBlock, 0);
          processedAny = true;
        }

        // Wait before next poll only when caught up.
        if (!processedAny) {
          await this.sleep(this.config.pollIntervalMs!);
        }
      } catch (error) {
        console.error("Error in event listener:", error);
        await this.sleep(5000); // Back off on error
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private async processBlockRange(fromBlock: bigint, toBlock: bigint): Promise<void> {
    console.log(`Processing blocks ${fromBlock} to ${toBlock}...`);

    // Fetch table/registry first, then derive any new vault addresses before vault log query.
    const [tableLogs, registryLogs] = await Promise.all([
      this.fetchPokerTableLogs(fromBlock, toBlock),
      this.fetchRegistryLogs(fromBlock, toBlock),
    ]);
    this.discoverVaultAddressesFromRegistryLogs(registryLogs);
    const vaultLogs = await this.fetchVaultLogs(fromBlock, toBlock);

    // Sort all logs by block number and log index
    const allLogs = [...tableLogs, ...registryLogs, ...vaultLogs].sort((a, b) => {
      const blockDiff = Number(a.blockNumber! - b.blockNumber!);
      if (blockDiff !== 0) return blockDiff;
      return a.logIndex! - b.logIndex!;
    });

    // Process in order
    for (const log of allLogs) {
      await this.processLog(log);
    }
  }

  private async fetchPokerTableLogs(fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    return this.client.getLogs({
      address: this.config.pokerTableAddress,
      fromBlock,
      toBlock,
    });
  }

  private async fetchRegistryLogs(fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    return this.client.getLogs({
      address: this.config.playerRegistryAddress,
      fromBlock,
      toBlock,
    });
  }

  private async fetchVaultLogs(fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    const vaultAddresses = Array.from(this.trackedVaultAddresses);
    if (vaultAddresses.length === 0) return [];
    return this.client.getLogs({
      address: vaultAddresses.length === 1 ? vaultAddresses[0] : vaultAddresses,
      fromBlock,
      toBlock,
    });
  }

  private async processLog(log: Log): Promise<void> {
    const address = log.address.toLowerCase();

    if (address === this.config.pokerTableAddress.toLowerCase()) {
      await this.processPokerTableLog(log);
    } else if (address === this.config.playerRegistryAddress.toLowerCase()) {
      await this.processRegistryLog(log);
    } else if (this.trackedVaultAddresses.has(address as Address)) {
      await this.processVaultLog(log);
    }
  }

  private async processPokerTableLog(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: pokerTableAbi,
        data: log.data,
        topics: log.topics,
      });

      switch (decoded.eventName) {
        case "SeatUpdated":
          await handlers.handleSeatUpdated(
            log,
            decoded.args as any,
            this.tableContext
          );
          break;
        case "HandStarted":
          await handlers.handleHandStarted(
            log,
            decoded.args as any,
            this.tableContext
          );
          break;
        case "ActionTaken":
          await handlers.handleActionTaken(
            log,
            decoded.args as any,
            this.tableContext
          );
          break;
        case "PotUpdated":
          await handlers.handlePotUpdated(
            log,
            decoded.args as any,
            this.tableContext
          );
          break;
        case "BettingRoundComplete":
          await handlers.handleBettingRoundComplete(
            log,
            decoded.args as any,
            this.tableContext
          );
          break;
        case "VRFRequested":
          await handlers.handleVRFRequested(
            log,
            decoded.args as any,
            this.tableContext
          );
          break;
        case "CommunityCardsDealt":
          await handlers.handleCommunityCardsDealt(
            log,
            decoded.args as any,
            this.tableContext
          );
          break;
        case "HandSettled":
          await handlers.handleHandSettled(
            log,
            decoded.args as any,
            this.tableContext
          );
          break;
        case "ForceTimeout":
          await handlers.handleForceTimeout(
            log,
            decoded.args as any,
            this.tableContext
          );
          break;
      }
    } catch (error) {
      console.error("Error decoding poker table log:", error);
    }
  }

  private async processRegistryLog(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: playerRegistryAbi,
        data: log.data,
        topics: log.topics,
      });

      switch (decoded.eventName) {
        case "AgentRegistered":
          this.trackVaultAddress((decoded.args as any).vault);
          await handlers.handleAgentRegistered(log, decoded.args as any);
          break;
        case "OperatorUpdated":
          await handlers.handleOperatorUpdated(log, decoded.args as any);
          break;
        case "OwnerUpdated":
          await handlers.handleOwnerUpdated(log, decoded.args as any);
          break;
        case "VaultUpdated":
          this.trackVaultAddress((decoded.args as any).newVault);
          await handlers.handleVaultUpdated(log, decoded.args as any);
          break;
        case "TableUpdated":
          await handlers.handleTableUpdated(log, decoded.args as any);
          break;
        case "MetaURIUpdated":
          await handlers.handleMetaURIUpdated(log, decoded.args as any);
          break;
      }
    } catch (error) {
      console.error("Error decoding registry log:", error);
    }
  }

  private async processVaultLog(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: playerVaultAbi,
        data: log.data,
        topics: log.topics,
      });

      switch (decoded.eventName) {
        case "VaultSnapshot":
          await handlers.handleVaultSnapshot(
            log,
            decoded.args as any,
            log.address
          );
          break;
      }
    } catch (error) {
      console.error("Error decoding vault log:", error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private trackVaultAddress(address?: string): void {
    if (!address) return;
    const normalized = address.toLowerCase() as Address;
    if (normalized === EventListener.ZERO_ADDRESS) return;
    this.trackedVaultAddresses.add(normalized);
  }

  private async loadTrackedVaultAddresses(): Promise<void> {
    const agents = await getAllAgents();
    for (const agent of agents) {
      this.trackVaultAddress(agent.vault_address || undefined);
    }
  }

  private discoverVaultAddressesFromRegistryLogs(logs: Log[]): void {
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: playerRegistryAbi,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === "AgentRegistered") {
          this.trackVaultAddress((decoded.args as any).vault);
        } else if (decoded.eventName === "VaultUpdated") {
          this.trackVaultAddress((decoded.args as any).newVault);
        }
      } catch {
        // Ignore decode failures in discovery pass; processRegistryLog handles reporting.
      }
    }
  }

  private async seedSeatsFromChain(): Promise<void> {
    const tableReadAbi = [
      {
        type: "function",
        name: "tableId",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "function",
        name: "smallBlind",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "function",
        name: "bigBlind",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "function",
        name: "MAX_SEATS",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint8" }],
      },
      {
        type: "function",
        name: "getSeat",
        stateMutability: "view",
        inputs: [{ name: "seatIndex", type: "uint8" }],
        outputs: [
          {
            type: "tuple",
            components: [
              { name: "owner", type: "address" },
              { name: "operator", type: "address" },
              { name: "stack", type: "uint256" },
              { name: "isActive", type: "bool" },
              { name: "currentBet", type: "uint256" },
            ],
          },
        ],
      },
    ] as const;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    try {
      const [tableId, smallBlind, bigBlind, maxSeatsRaw] = await Promise.all([
        this.client.readContract({
          address: this.config.pokerTableAddress,
          abi: tableReadAbi,
          functionName: "tableId",
        }),
        this.client.readContract({
          address: this.config.pokerTableAddress,
          abi: tableReadAbi,
          functionName: "smallBlind",
        }),
        this.client.readContract({
          address: this.config.pokerTableAddress,
          abi: tableReadAbi,
          functionName: "bigBlind",
        }),
        this.client.readContract({
          address: this.config.pokerTableAddress,
          abi: tableReadAbi,
          functionName: "MAX_SEATS",
        }),
      ]);

      this.tableContext = {
        tableId: tableId as bigint,
        contractAddress: this.config.pokerTableAddress,
        smallBlind: smallBlind as bigint,
        bigBlind: bigBlind as bigint,
      };

      await upsertTable(
        this.tableContext.tableId,
        this.tableContext.contractAddress,
        this.tableContext.smallBlind,
        this.tableContext.bigBlind
      );

      const maxSeats = Number(maxSeatsRaw);
      const seatResults = await Promise.all(
        Array.from({ length: maxSeats }, (_, seatIndex) =>
          this.client.readContract({
            address: this.config.pokerTableAddress,
            abi: tableReadAbi,
            functionName: "getSeat",
            args: [seatIndex],
          })
        )
      );

      let occupiedSeats = 0;
      for (let seatIndex = 0; seatIndex < seatResults.length; seatIndex++) {
        const seat = seatResults[seatIndex] as {
          owner: Address;
          operator: Address;
          stack: bigint;
          isActive: boolean;
          currentBet: bigint;
        };
        if (seat.owner.toLowerCase() === ZERO_ADDRESS) continue;
        await upsertSeat(
          this.tableContext.tableId,
          seatIndex,
          seat.owner,
          seat.operator,
          seat.stack,
          seat.isActive,
          seat.currentBet
        );
        occupiedSeats += 1;
      }

      console.log(
        `Seeded seat snapshot from chain: ${occupiedSeats}/${maxSeats} occupied seats for table ${this.tableContext.tableId}`
      );
    } catch (error) {
      console.error("Failed to seed seat snapshot from chain (continuing with log replay):", error);
    }
  }
}
