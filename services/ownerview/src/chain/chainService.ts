import { createPublicClient, http, type PublicClient } from "viem";
import type { Address } from "@playerco/shared";
import type { SeatInfo, ChainServiceConfig } from "./types.js";
import { PokerTableABI } from "./pokerTableAbi.js";

/**
 * Error thrown when chain operations fail
 */
export class ChainError extends Error {
  constructor(
    message: string,
    public code:
      | "RPC_ERROR"
      | "INVALID_SEAT"
      | "CONTRACT_ERROR"
  ) {
    super(message);
    this.name = "ChainError";
  }
}

/**
 * Service for on-chain data retrieval
 */
export class ChainService {
  private client: PublicClient;
  private pokerTableAddress: Address;
  private maxSeatsCache: number | null = null;

  constructor(config: ChainServiceConfig) {
    this.client = createPublicClient({
      transport: http(config.rpcUrl),
    });
    this.pokerTableAddress = config.pokerTableAddress;
  }

  /**
   * Get seat information from PokerTable contract
   */
  async getSeat(seatIndex: number): Promise<SeatInfo> {
    const maxSeats = await this.getMaxSeats();
    if (seatIndex < 0 || seatIndex >= maxSeats) {
      throw new ChainError(`Invalid seat index (must be 0-${maxSeats - 1})`, "INVALID_SEAT");
    }

    try {
      const result = await this.client.readContract({
        address: this.pokerTableAddress,
        abi: PokerTableABI,
        functionName: "getSeat",
        args: [seatIndex],
      });

      return {
        owner: result.owner as Address,
        operator: result.operator as Address,
        stack: result.stack,
        isActive: result.isActive,
        currentBet: result.currentBet,
      };
    } catch (err) {
      throw new ChainError(
        `Failed to read seat from contract: ${err instanceof Error ? err.message : String(err)}`,
        "CONTRACT_ERROR"
      );
    }
  }

  /**
   * Get current hand ID from PokerTable contract
   */
  async getCurrentHandId(): Promise<bigint> {
    try {
      const result = await this.client.readContract({
        address: this.pokerTableAddress,
        abi: PokerTableABI,
        functionName: "currentHandId",
      });
      return result;
    } catch (err) {
      throw new ChainError(
        `Failed to read currentHandId: ${err instanceof Error ? err.message : String(err)}`,
        "CONTRACT_ERROR"
      );
    }
  }

  /**
   * Find seat index for a given owner address
   * Returns null if address doesn't own any seat
   */
  async findSeatByOwner(ownerAddress: Address): Promise<number | null> {
    const normalizedOwner = ownerAddress.toLowerCase();
    const maxSeats = await this.getMaxSeats();

    for (let i = 0; i < maxSeats; i++) {
      try {
        const seat = await this.getSeat(i);
        if (seat.owner.toLowerCase() === normalizedOwner) {
          return i;
        }
      } catch {
        // Seat might be empty, continue
      }
    }

    return null;
  }

  async getMaxSeats(): Promise<number> {
    if (this.maxSeatsCache !== null) {
      return this.maxSeatsCache;
    }

    try {
      const result = await this.client.readContract({
        address: this.pokerTableAddress,
        abi: PokerTableABI,
        functionName: "MAX_SEATS",
      });
      const maxSeats = Number(result);
      if (!Number.isInteger(maxSeats) || maxSeats <= 0) {
        throw new Error(`Invalid MAX_SEATS value: ${String(result)}`);
      }
      this.maxSeatsCache = maxSeats;
      return maxSeats;
    } catch (err) {
      throw new ChainError(
        `Failed to read MAX_SEATS from contract: ${err instanceof Error ? err.message : String(err)}`,
        "CONTRACT_ERROR"
      );
    }
  }

  /**
   * Check if an address owns a specific seat
   */
  async isSeatOwner(seatIndex: number, address: Address): Promise<boolean> {
    const seat = await this.getSeat(seatIndex);
    return seat.owner.toLowerCase() === address.toLowerCase();
  }
}
