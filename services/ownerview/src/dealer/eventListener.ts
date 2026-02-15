import { createPublicClient, http, type PublicClient, type Log, parseAbiItem } from "viem";
import type { Address } from "@playerco/shared";
import type { DealerService } from "./dealerService.js";
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
}

/**
 * HandStarted event ABI
 */
const HandStartedEventAbi = parseAbiItem(
  "event HandStarted(uint256 indexed handId, uint256 smallBlind, uint256 bigBlind, uint8 buttonSeat)"
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
  private isRunning: boolean = false;
  private unwatch: (() => void) | null = null;
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
    this.tableId = tableId;
  }

  /**
   * Set callback for when hands are dealt
   */
  setOnHandStarted(callback: OnHandStartedCallback): void {
    this.onHandStarted = callback;
  }

  /**
   * Start listening for HandStarted events
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Watch for new HandStarted events
    this.unwatch = this.client.watchContractEvent({
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
    });

    console.log(
      `[DealerEventListener] Started watching HandStarted events for table ${this.tableId} at ${this.pokerTableAddress}`
    );
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }
    this.isRunning = false;
    console.log("[DealerEventListener] Stopped");
  }

  /**
   * Handle incoming HandStarted logs
   */
  private async handleLogs(logs: Log[]): Promise<void> {
    for (const log of logs) {
      try {
        // Parse event args
        // topics[1] is indexed handId
        const handId = log.topics[1]
          ? BigInt(log.topics[1])
          : 0n;

        // data contains non-indexed params (smallBlind, bigBlind, buttonSeat)
        // For simplicity in MVP, we'll just use the handId
        const event: HandStartedEvent = {
          handId,
          smallBlind: 0n, // Would parse from data
          bigBlind: 0n,
          buttonSeat: 0,
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

    // Check if already dealt (idempotency)
    if (this.dealerService.isHandDealt(this.tableId, handIdStr)) {
      console.log(
        `[DealerEventListener] Hand ${handIdStr} already dealt, skipping`
      );
      return;
    }

    try {
      const seatIndexes = await this.getOccupiedSeatIndexes();

      // Deal hole cards
      const result = this.dealerService.deal({
        tableId: this.tableId,
        handId: handIdStr,
        seatIndexes,
      });

      console.log(
        `[DealerEventListener] Dealt cards for hand ${handIdStr}: ${result.seats.length} occupied seats`
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
}
