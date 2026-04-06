import {
  createPublicClient,
  http,
  type PublicClient,
  type Log,
  parseAbiItem,
  decodeEventLog,
} from "viem";
import type { Address } from "@playerco/shared";
import { DealerService } from "./dealerService.js";
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
        console.error("[DealerEventListener] Watch error:", error.message);
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
            console.error(
              `[DealerIntegrity] VIOLATION detected! table=${this.tableId} hand=${args.handId} ` +
              `seat=${args.seatIndex} card=${args.card} communityIndex=${args.communityIndex} — ` +
              `dealer dealt a hole card that duplicates a community card`
            );
          } catch (_e) { /* ignore decode errors */ }
        }
      },
      onError: (error) => {
        console.error("[DealerIntegrity] Watch error:", error.message);
      },
    }));

    console.log(
      `[DealerEventListener] Started watching HandStarted events for table ${this.tableId} at ${this.pokerTableAddress} ` +
      `[trustless-dealer: ${this.trustlessDealerEnabled ? "ENABLED" : "DISABLED"}]`
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
    console.log("[DealerEventListener] Stopped");
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
        console.error(
          "[DealerEventListener] Failed to process log:",
          error instanceof Error ? error.message : String(error)
        );
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
      console.log(
        `[DealerEventListener] Trustless dealer disabled (TRUSTLESS_DEALER_ENABLED=false). ` +
        `Skipping automatic deal for hand ${handIdStr}. Use /dealer API to deal manually.`
      );
      return;
    }

    // Check if already dealt (idempotency)
    if (await this.dealerService.isHandDealt(this.tableId, handIdStr)) {
      console.log(
        `[DealerEventListener] Hand ${handIdStr} already dealt, skipping`
      );
      return;
    }

    try {
      const seatIndexes = await this.getOccupiedSeatIndexes();

      // Fetch per-seat encryption keys from on-chain
      const encryptionKeys = await this.getEncryptionKeys(seatIndexes);
      if (encryptionKeys.size === 0) {
        console.warn(
          `[DealerEventListener] No encryption keys registered for hand ${handIdStr} — skipping deal`
        );
        return;
      }

      // Fetch hole card VRF randomness from on-chain (stored by fulfillVRF callback)
      const vrfRandomness = await this.getHoleCardVRFRandomness(handIdStr);
      if (vrfRandomness === 0n) {
        console.warn(
          `[DealerEventListener] Hole card VRF not fulfilled yet for hand ${handIdStr} — skipping`
        );
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

      console.log(
        `[DealerEventListener] Dealt cards for hand ${handIdStr}: ${result.seats.length} seats, commit=${result.dealerSeedCommit}`
      );

      // Invoke callback if set
      if (this.onHandStarted) {
        this.onHandStarted(this.tableId, event);
      }
    } catch (error) {
      console.error(
        `[DealerEventListener] Failed to deal hand ${handIdStr}:`,
        error instanceof Error ? error.message : String(error)
      );
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
      abi: PokerTableABI,
      functionName: "holeCardVRFRandomness",
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
