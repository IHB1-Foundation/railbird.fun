import {
  createPublicClient,
  http,
  type PublicClient,
  type Log,
  type Abi,
  parseAbiItem,
  decodeEventLog,
} from "viem";
import { type Address, createLogger } from "@playerco/shared";
import { DealerService } from "./dealerService.js";

const logger = createLogger({ service: "ownerview:dealer" });
import type { HandStartedEvent } from "./types.js";
import { PokerTableABI } from "../chain/pokerTableAbi.js";

/**
 * Configuration for the event listener
 */
export interface EventListenerConfig {
  rpcUrl: string;
  pokerTableAddress: Address;
  /** Polling interval in milliseconds (default: 2000) */
  pollInterval?: number;
  /**
   * Enable the trustless dealer protocol (verifiable shuffle + ECIES encryption).
   *
   * - `true`:  New protocol — VRF-seeded shuffle, per-seat ECIES encryption,
   *            on-chain dealer seed commit, showdown verification.
   * - `false` (default): Legacy mode — automatic dealing is disabled.
   *            Operators must submit deals manually via the /dealer API.
   *            Use this during migration or as a rollback mechanism.
   *
   * Controlled by TRUSTLESS_DEALER_ENABLED env var.
   */
  trustlessDealerEnabled?: boolean;
}

/**
 * HandStarted event ABI
 */
const HandStartedEventAbi = parseAbiItem(
  "event HandStarted(uint256 indexed handId, uint256 smallBlind, uint256 bigBlind, uint8 buttonSeat)"
);
const CardIntegrityViolationAbi = parseAbiItem(
  "event CardIntegrityViolation(uint256 indexed handId, uint8 indexed seatIndex, uint8 card, uint8 communityIndex)"
);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Callback type for hand started events
 */
export type OnHandStartedCallback = (tableId: string, event: HandStartedEvent) => void;

/**
 * Event listener that watches for HandStarted events and triggers dealing
 *
 * Note: For MVP, this uses polling. In production, consider using WebSocket
 * subscriptions for lower latency.
 */
export class HandStartedEventListener {
  private client: PublicClient;
  private pokerTableAddress: Address;
  private dealerService: DealerService;
  private pollInterval: number;
  private trustlessDealerEnabled: boolean;
  private isRunning: boolean = false;
  private unwatchers: Array<() => void> = [];
  private tableId: string;
  private onHandStarted?: OnHandStartedCallback;

  constructor(
    config: EventListenerConfig,
    dealerService: DealerService,
    tableId: string
  ) {
    this.client = createPublicClient({
      transport: http(config.rpcUrl),
    });
    this.pokerTableAddress = config.pokerTableAddress;
    this.dealerService = dealerService;
    this.pollInterval = config.pollInterval ?? 2000;
    this.trustlessDealerEnabled = config.trustlessDealerEnabled ?? false;
    this.tableId = tableId;
  }

  /**
   * Set callback for when hands are dealt
   */
  setOnHandStarted(callback: OnHandStartedCallback): void {
    this.onHandStarted = callback;
  }

  /**
   * Start listening for HandStarted and CardIntegrityViolation events
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Watch for new HandStarted events
    this.unwatchers.push(this.client.watchContractEvent({
      address: this.pokerTableAddress,
      abi: [HandStartedEventAbi],
      eventName: "HandStarted",
      pollingInterval: this.pollInterval,
      onLogs: (logs) => {
        void this.handleLogs(logs);
      },
      onError: (error) => {
        logger.error({ tableId: this.tableId, err: error.message }, 'DealerEventListener watch error');
      },
    }));

    // Watch for CardIntegrityViolation events (dealer integrity monitoring)
    this.unwatchers.push(this.client.watchContractEvent({
      address: this.pokerTableAddress,
      abi: [CardIntegrityViolationAbi],
      eventName: "CardIntegrityViolation",
      pollingInterval: this.pollInterval,
      onLogs: (logs) => {
        for (const log of logs) {
          try {
            const decoded = decodeEventLog({
              abi: [CardIntegrityViolationAbi],
              data: log.data,
              topics: log.topics,
            });
            const args = decoded.args as {
              handId: bigint;
              seatIndex: number;
              card: number;
              communityIndex: number;
            };
            logger.error(
              { tableId: this.tableId, handId: args.handId.toString(), seatIndex: args.seatIndex, card: args.card, communityIndex: args.communityIndex },
              'DealerIntegrity VIOLATION: dealer dealt a hole card that duplicates a community card'
            );
          } catch (_e) { /* ignore decode errors */ }
        }
      },
      onError: (error) => {
        logger.error({ tableId: this.tableId, err: error.message }, 'DealerIntegrity watch error');
      },
    }));

    logger.info(
      { tableId: this.tableId, pokerTableAddress: this.pokerTableAddress, trustlessDealer: this.trustlessDealerEnabled },
      'DealerEventListener started watching HandStarted events'
    );
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    for (const unwatch of this.unwatchers) {
      unwatch();
    }
    this.unwatchers = [];
    this.isRunning = false;
    logger.info({ tableId: this.tableId }, 'DealerEventListener stopped');
  }

  /**
   * Handle incoming HandStarted logs
   */
  private async handleLogs(logs: Log[]): Promise<void> {
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: [HandStartedEventAbi],
          data: log.data,
          topics: log.topics,
        });
        const args = decoded.args as {
          handId: bigint;
          smallBlind: bigint;
          bigBlind: bigint;
          buttonSeat: number;
        };

        const event: HandStartedEvent = {
          handId: args.handId,
          smallBlind: args.smallBlind,
          bigBlind: args.bigBlind,
          buttonSeat: args.buttonSeat,
        };

        await this.handleHandStarted(event);
      } catch (error) {
        logger.error({ tableId: this.tableId, err: error instanceof Error ? error.message : String(error) }, 'DealerEventListener failed to process log');
      }
    }
  }

  /**
   * Handle a HandStarted event
   */
  private async handleHandStarted(event: HandStartedEvent): Promise<void> {
    const handIdStr = event.handId.toString();

    // Feature flag: skip automatic dealing in legacy mode
    if (!this.trustlessDealerEnabled) {
      logger.info({ tableId: this.tableId, handId: handIdStr }, 'Trustless dealer disabled, skipping automatic deal — use /dealer API to deal manually');
      return;
    }

    // Check if already dealt (idempotency)
    if (await this.dealerService.isHandDealt(this.tableId, handIdStr)) {
      logger.info({ tableId: this.tableId, handId: handIdStr }, 'Hand already dealt, skipping');
      return;
    }

    try {
      const seatIndexes = await this.getOccupiedSeatIndexes();

      // Fetch per-seat encryption keys from on-chain
      const encryptionKeys = await this.getEncryptionKeys(seatIndexes);
      if (encryptionKeys.size === 0) {
        logger.warn({ tableId: this.tableId, handId: handIdStr }, 'No encryption keys registered — skipping deal');
        return;
      }

      // Fetch hole card VRF randomness from on-chain (stored by fulfillVRF callback)
      const vrfRandomness = await this.getHoleCardVRFRandomness(handIdStr);
      if (vrfRandomness === 0n) {
        logger.warn({ tableId: this.tableId, handId: handIdStr }, 'Hole card VRF not fulfilled yet — skipping');
        return;
      }

      // Generate dealer seed and deal
      const dealerSeed = DealerService.generateDealerSeed();

      const result = await this.dealerService.deal({
        tableId: this.tableId,
        handId: handIdStr,
        vrfRandomness,
        dealerSeed,
        encryptionKeys,
      });

      logger.info({ tableId: this.tableId, handId: handIdStr, seats: result.seats.length, commit: result.dealerSeedCommit }, 'Dealt cards for hand');

      // Invoke callback if set
      if (this.onHandStarted) {
        this.onHandStarted(this.tableId, event);
      }
    } catch (error) {
      logger.error({ tableId: this.tableId, handId: handIdStr, err: error instanceof Error ? error.message : String(error) }, 'Failed to deal hand');
    }
  }

  /**
   * Manually trigger dealing for a hand (for testing/recovery)
   */
  dealHand(handId: string): void {
    void this.handleHandStarted({
      handId: BigInt(handId),
      smallBlind: 0n,
      bigBlind: 0n,
      buttonSeat: 0,
    });
  }

  /**
   * Check if listener is running
   */
  isListening(): boolean {
    return this.isRunning;
  }

  private async getOccupiedSeatIndexes(): Promise<number[]> {
    const maxSeatsRaw = await this.client.readContract({
      address: this.pokerTableAddress,
      abi: PokerTableABI,
      functionName: "MAX_SEATS",
    });
    const maxSeats = Number(maxSeatsRaw);

    const seats = await Promise.all(
      Array.from({ length: maxSeats }, (_, i) =>
        this.client.readContract({
          address: this.pokerTableAddress,
          abi: PokerTableABI,
          functionName: "getSeat",
          args: [i],
        })
      )
    );

    const occupied: number[] = [];
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i] as { owner: Address };
      if (seat.owner.toLowerCase() !== ZERO_ADDRESS) {
        occupied.push(i);
      }
    }
    return occupied;
  }

  /**
   * Fetch the hole card VRF randomness for a hand from on-chain.
   * Returns 0n if VRF has not been fulfilled yet.
   */
  private async getHoleCardVRFRandomness(handId: string): Promise<bigint> {
    const randomness = await this.client.readContract({
      address: this.pokerTableAddress,
      abi: PokerTableABI as Abi,
      functionName: "holeCardVRFRandomnessHash",
      args: [BigInt(handId)],
    });
    return randomness as bigint;
  }

  /**
   * Fetch registered ECIES encryption keys for each seat from on-chain.
   * Returns a map of seatIndex → compressed public key (33 bytes).
   */
  private async getEncryptionKeys(seatIndexes: number[]): Promise<Map<number, Uint8Array>> {
    const keys = new Map<number, Uint8Array>();

    await Promise.all(
      seatIndexes.map(async (seatIndex) => {
        const keyHex = await this.client.readContract({
          address: this.pokerTableAddress,
          abi: PokerTableABI,
          functionName: "getEncryptionKey",
          args: [seatIndex],
        }) as `0x${string}`;

        if (keyHex && keyHex !== "0x") {
          const hex = keyHex.replace(/^0x/, "");
          if (hex.length > 0) {
            keys.set(seatIndex, Uint8Array.from(Buffer.from(hex, "hex")));
          }
        }
      })
    );

    return keys;
  }
}
