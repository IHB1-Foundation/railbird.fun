// Event listener - subscribes to chain events and dispatches to handlers

import { createPublicClient, http, type Log, decodeEventLog, type Address } from "viem";
import { createLogger, getChainConfig } from "@playerco/shared";
import { eventsProcessedTotal } from "../metrics.js";

const logger = createLogger({ service: "indexer" });
import { pokerTableAbi, playerRegistryAbi, playerVaultAbi, gameStateToString } from "./abis.js";
import * as handlers from "./handlers.js";
import type {
  SeatUpdatedArgs,
  HandStartedArgs,
  ActionTakenArgs,
  PotUpdatedArgs,
  BettingRoundCompleteArgs,
  VRFRequestedArgs,
  CommunityCardsDealtArgs,
  HandSettledArgs,
  ShowdownTimedOutArgs,
  ForceTimeoutArgs,
  TournamentWinnerArgs,
  CardIntegrityViolationArgs,
  HoleCardsRevealedArgs,
  DecisionRevealedArgs,
  AgentRegisteredArgs,
  OperatorUpdatedArgs,
  OwnerUpdatedArgs,
  VaultUpdatedArgs,
  TableUpdatedArgs,
  MetaURIUpdatedArgs,
  StrategyUpdatedArgs,
  VaultSnapshotArgs,
  RebalanceBuyArgs,
  RebalanceSellArgs,
} from "./eventArgs.js";
import {
  getAllAgents,
  getIndexerState,
  updateIndexerState,
  upsertSeat,
  upsertTable,
  updateTableState,
  insertHand,
  updateHand,
} from "../db/index.js";

export interface ListenerConfig {
  pokerTableAddresses: Address[];
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
  private tableContextMap = new Map<string, handlers.EventContext>();
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

    // Default table contexts - will be updated when we read table info
    for (const addr of config.pokerTableAddresses) {
      this.tableContextMap.set(addr.toLowerCase(), {
        tableId: 0n,
        contractAddress: addr,
        smallBlind: 0n,
        bigBlind: 0n,
      });
    }
  }

  private getTableContext(address: string): handlers.EventContext | undefined {
    return this.tableContextMap.get(address.toLowerCase());
  }

  private isTableAddress(address: string): boolean {
    return this.tableContextMap.has(address.toLowerCase());
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    logger.info({ logBlockRange: this.config.logBlockRange, tableCount: this.config.pokerTableAddresses.length }, "Starting event listener...");
    for (const addr of this.config.pokerTableAddresses) {
      await this.seedTableStateFromChain(addr);
    }
    await this.loadTrackedVaultAddresses();
    logger.info({ vaultCount: this.trackedVaultAddresses.size }, "Vault addresses loaded");

    // Get last processed block from DB
    const state = await getIndexerState();
    const configuredStartBlock = this.config.startBlock ?? 0n;
    let fromBlock = configuredStartBlock;

    if (state) {
      const stateBlock = BigInt(state.last_processed_block);
      if (this.config.replayOnStart) {
        fromBlock = configuredStartBlock;
        logger.info({ configuredStartBlock: configuredStartBlock.toString(), cursor: stateBlock.toString() }, "Replay mode enabled: starting from configured START_BLOCK");
      } else if (stateBlock > fromBlock) {
        fromBlock = stateBlock;
      }
    }

    logger.info({ fromBlock: fromBlock.toString() }, "Resuming from block");

    const CIRCUIT_BREAKER_THRESHOLD = 10;
    const BACKOFF_BASE_MS = 5_000;
    const BACKOFF_MAX_MS = 5 * 60_000; // 5 minutes
    let consecutiveErrors = 0;
    let backoffMs = BACKOFF_BASE_MS;

    while (this.running) {
      try {
        const latestBlock = await this.client.getBlockNumber();
        let processedAny = false;

        while (this.running && fromBlock <= latestBlock) {
          // Process in RPC-safe chunks. Public RPCs may reject large eth_getLogs ranges.
          const range = BigInt(this.config.logBlockRange! - 1);
          const toBlock = fromBlock + range < latestBlock ? fromBlock + range : latestBlock;

          await this.processBlockRange(fromBlock, toBlock);

          fromBlock = toBlock + 1n;
          await updateIndexerState(fromBlock, 0);
          processedAny = true;
        }

        // Successful iteration — reset error tracking
        consecutiveErrors = 0;
        backoffMs = BACKOFF_BASE_MS;

        // Wait before next poll only when caught up.
        if (!processedAny) {
          await this.sleep(this.config.pollIntervalMs!);
        }
      } catch (error) {
        consecutiveErrors++;
        logger.error(
          { consecutiveErrors, backoffMs, err: error },
          "Error in event listener"
        );

        if (consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
          logger.error(
            { consecutiveErrors, maxBackoffMs: BACKOFF_MAX_MS },
            "CIRCUIT BREAKER: event listener exceeded consecutive error threshold — manual investigation required"
          );
        }

        await this.sleep(backoffMs);
        // Exponential backoff capped at BACKOFF_MAX_MS
        backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private async processBlockRange(fromBlock: bigint, toBlock: bigint): Promise<void> {
    logger.debug({ fromBlock: fromBlock.toString(), toBlock: toBlock.toString() }, "Processing block range");

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
    const addrs = this.config.pokerTableAddresses;
    return this.client.getLogs({
      address: addrs.length === 1 ? addrs[0] : addrs,
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

    if (this.isTableAddress(address)) {
      await this.processPokerTableLog(log);
    } else if (address === this.config.playerRegistryAddress.toLowerCase()) {
      await this.processRegistryLog(log);
    } else if (this.trackedVaultAddresses.has(address as Address)) {
      await this.processVaultLog(log);
    }
  }

  private async processPokerTableLog(log: Log): Promise<void> {
    const tableContext = this.getTableContext(log.address);
    if (!tableContext) return;

    try {
      const decoded = decodeEventLog({
        abi: pokerTableAbi,
        data: log.data,
        topics: log.topics,
      });
      eventsProcessedTotal.inc({ event_type: decoded.eventName as string });

      switch (decoded.eventName as string) {
        case "SeatUpdated":
          await handlers.handleSeatUpdated(
            log,
            decoded.args as unknown as SeatUpdatedArgs,
            tableContext
          );
          break;
        case "HandStarted":
          await handlers.handleHandStarted(
            log,
            decoded.args as unknown as HandStartedArgs,
            tableContext
          );
          break;
        case "ActionTaken":
          await handlers.handleActionTaken(
            log,
            decoded.args as unknown as ActionTakenArgs,
            tableContext
          );
          break;
        case "PotUpdated":
          await handlers.handlePotUpdated(
            log,
            decoded.args as unknown as PotUpdatedArgs,
            tableContext
          );
          break;
        case "BettingRoundComplete":
          await handlers.handleBettingRoundComplete(
            log,
            decoded.args as unknown as BettingRoundCompleteArgs,
            tableContext
          );
          break;
        case "VRFRequested":
          await handlers.handleVRFRequested(
            log,
            decoded.args as unknown as VRFRequestedArgs,
            tableContext
          );
          break;
        case "CommunityCardsDealt":
          await handlers.handleCommunityCardsDealt(
            log,
            decoded.args as unknown as CommunityCardsDealtArgs,
            tableContext
          );
          break;
        case "HandSettled":
          await handlers.handleHandSettled(
            log,
            decoded.args as unknown as HandSettledArgs,
            tableContext
          );
          break;
        case "ShowdownTimedOut":
          await handlers.handleShowdownTimedOut(
            log,
            decoded.args as unknown as ShowdownTimedOutArgs
          );
          break;
        case "ForceTimeout":
          await handlers.handleForceTimeout(
            log,
            decoded.args as unknown as ForceTimeoutArgs,
            tableContext
          );
          break;
        case "TournamentWinner":
          await handlers.handleTournamentWinner(
            log,
            decoded.args as unknown as TournamentWinnerArgs,
            tableContext
          );
          break;
        case "CardIntegrityViolation":
          await handlers.handleCardIntegrityViolation(
            log,
            decoded.args as unknown as CardIntegrityViolationArgs,
            tableContext
          );
          break;
        case "HoleCardsRevealed":
          await handlers.handleHoleCardsRevealed(
            log,
            decoded.args as unknown as HoleCardsRevealedArgs,
            tableContext
          );
          break;
        case "DecisionRevealed":
          await handlers.handleDecisionRevealed(
            log,
            decoded.args as unknown as DecisionRevealedArgs,
            tableContext
          );
          break;
      }
    } catch (error) {
      logger.error({ err: error, blockNumber: log.blockNumber?.toString() }, "Error decoding poker table log");
    }
  }

  private async processRegistryLog(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: playerRegistryAbi,
        data: log.data,
        topics: log.topics,
      });
      eventsProcessedTotal.inc({ event_type: decoded.eventName as string });

      switch (decoded.eventName) {
        case "AgentRegistered": {
          const agentArgs = decoded.args as unknown as AgentRegisteredArgs;
          this.trackVaultAddress(agentArgs.vault);
          await handlers.handleAgentRegistered(log, agentArgs);
          break;
        }
        case "OperatorUpdated":
          await handlers.handleOperatorUpdated(log, decoded.args as unknown as OperatorUpdatedArgs);
          break;
        case "OwnerUpdated":
          await handlers.handleOwnerUpdated(log, decoded.args as unknown as OwnerUpdatedArgs);
          break;
        case "VaultUpdated": {
          const vaultArgs = decoded.args as unknown as VaultUpdatedArgs;
          this.trackVaultAddress(vaultArgs.newVault);
          await handlers.handleVaultUpdated(log, vaultArgs);
          break;
        }
        case "TableUpdated":
          await handlers.handleTableUpdated(log, decoded.args as unknown as TableUpdatedArgs);
          break;
        case "MetaURIUpdated":
          await handlers.handleMetaURIUpdated(log, decoded.args as unknown as MetaURIUpdatedArgs);
          break;
        case "StrategyUpdated":
          await handlers.handleStrategyUpdated(log, decoded.args as unknown as StrategyUpdatedArgs);
          break;
      }
    } catch (error) {
      logger.error({ err: error, blockNumber: log.blockNumber?.toString() }, "Error decoding registry log");
    }
  }

  private async processVaultLog(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: playerVaultAbi,
        data: log.data,
        topics: log.topics,
      });
      eventsProcessedTotal.inc({ event_type: decoded.eventName as string });

      switch (decoded.eventName) {
        case "VaultSnapshot":
          await handlers.handleVaultSnapshot(
            log,
            decoded.args as unknown as VaultSnapshotArgs,
            log.address
          );
          break;
        case "RebalanceBuy":
          await handlers.handleRebalanceBuy(
            log,
            decoded.args as unknown as RebalanceBuyArgs,
            log.address
          );
          break;
        case "RebalanceSell":
          await handlers.handleRebalanceSell(
            log,
            decoded.args as unknown as RebalanceSellArgs,
            log.address
          );
          break;
      }
    } catch (error) {
      logger.error({ err: error, blockNumber: log.blockNumber?.toString() }, "Error decoding vault log");
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
          this.trackVaultAddress((decoded.args as unknown as AgentRegisteredArgs).vault);
        } else if (decoded.eventName === "VaultUpdated") {
          this.trackVaultAddress((decoded.args as unknown as VaultUpdatedArgs).newVault);
        }
      } catch {
        // Ignore decode failures in discovery pass; processRegistryLog handles reporting.
      }
    }
  }

  private async seedTableStateFromChain(tableAddress: Address): Promise<void> {
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
        name: "gameState",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint8" }],
      },
      {
        type: "function",
        name: "currentHandId",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "function",
        name: "buttonSeat",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint8" }],
      },
      {
        type: "function",
        name: "actionDeadline",
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
      {
        type: "function",
        name: "getHandInfo",
        stateMutability: "view",
        inputs: [],
        outputs: [
          { name: "handId", type: "uint256" },
          { name: "pot", type: "uint256" },
          { name: "currentBetAmount", type: "uint256" },
          { name: "actorSeat", type: "uint8" },
          { name: "state", type: "uint8" },
        ],
      },
      {
        type: "function",
        name: "getCommunityCards",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint8[5]" }],
      },
    ] as const;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    try {
      const [
        tableId,
        smallBlind,
        bigBlind,
        gameStateRaw,
        currentHandId,
        buttonSeatRaw,
        actionDeadlineRaw,
        maxSeatsRaw,
        handInfoRaw,
        communityCardsRaw,
      ] = await Promise.all([
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "tableId",
        }),
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "smallBlind",
        }),
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "bigBlind",
        }),
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "gameState",
        }),
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "currentHandId",
        }),
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "buttonSeat",
        }),
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "actionDeadline",
        }),
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "MAX_SEATS",
        }),
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "getHandInfo",
        }),
        this.client.readContract({
          address: tableAddress,
          abi: tableReadAbi,
          functionName: "getCommunityCards",
        }),
      ]);

      const ctx: handlers.EventContext = {
        tableId: tableId as bigint,
        contractAddress: tableAddress,
        smallBlind: smallBlind as bigint,
        bigBlind: bigBlind as bigint,
      };
      this.tableContextMap.set(tableAddress.toLowerCase(), ctx);

      await upsertTable(
        ctx.tableId,
        ctx.contractAddress,
        ctx.smallBlind,
        ctx.bigBlind
      );

      const gameState = Number(gameStateRaw);
      const currentHandIdValue = currentHandId as bigint;
      const buttonSeat = Number(buttonSeatRaw);
      const actionDeadline = actionDeadlineRaw as bigint;
      const gameStateString = gameStateToString(gameState);
      const actionDeadlineDate = actionDeadline > 0n ? new Date(Number(actionDeadline) * 1000) : null;

      await updateTableState(
        ctx.tableId,
        gameStateString,
        currentHandIdValue,
        buttonSeat,
        actionDeadlineDate
      );

      const handInfo = handInfoRaw as readonly [bigint, bigint, bigint, number, number];
      const handId = handInfo[0];
      const pot = handInfo[1];
      const currentBet = handInfo[2];
      const actorSeat = Number(handInfo[3]);
      const handStateString = gameStateToString(Number(handInfo[4]));
      const communityCards = (communityCardsRaw as readonly number[]).filter((card) => card !== 255);

      if (handId > 0n || currentHandIdValue > 0n) {
        const effectiveHandId = currentHandIdValue > 0n ? currentHandIdValue : handId;
        await insertHand(
          ctx.tableId,
          effectiveHandId,
          pot,
          buttonSeat,
          ctx.smallBlind,
          ctx.bigBlind,
          handStateString
        );
        await updateHand(ctx.tableId, effectiveHandId, {
          pot,
          currentBet,
          actorSeat,
          gameState: handStateString,
          communityCards,
        });
      }

      const maxSeats = Number(maxSeatsRaw);
      const seatResults = await Promise.all(
        Array.from({ length: maxSeats }, (_, seatIndex) =>
          this.client.readContract({
            address: tableAddress,
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
        await upsertSeat(
          ctx.tableId,
          seatIndex,
          seat.owner,
          seat.operator,
          seat.stack,
          seat.isActive,
          seat.currentBet
        );
        if (seat.owner.toLowerCase() !== ZERO_ADDRESS) occupiedSeats += 1;
      }

      logger.info(
        { tableId: ctx.tableId.toString(), state: gameStateString, hand: currentHandIdValue.toString(), occupiedSeats, maxSeats },
        "Seeded table snapshot from chain"
      );
    } catch (error) {
      logger.error({ err: error }, "Failed to seed table snapshot from chain (continuing with log replay)");
    }
  }
}
