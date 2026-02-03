import type { Address } from "@playerco/shared";

/**
 * Seat information from PokerTable contract
 */
export interface SeatInfo {
  owner: Address;
  operator: Address;
  stack: bigint;
  isActive: boolean;
  currentBet: bigint;
}

/**
 * Configuration for chain service
 */
export interface ChainServiceConfig {
  rpcUrl: string;
  pokerTableAddress: Address;
}
