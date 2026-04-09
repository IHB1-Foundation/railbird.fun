// Operator Wallet Pool — T-1202
// Manages a pool of pre-funded operator wallets for fleet agents.

import { createLogger } from "@playerco/shared";
import type { WalletEntry } from "./types.js";

const logger = createLogger({ service: "fleet:pool" });

function deriveAddress(privateKey: string): string {
  // Simple hex-to-address derivation for display purposes.
  // Full derivation would use viem's privateKeyToAccount.
  // For now, return a placeholder derived from the key's last 20 bytes.
  const clean = privateKey.replace(/^0x/, "").toLowerCase();
  return `0x${clean.slice(-40)}`;
}

export class WalletPool {
  private wallets: WalletEntry[] = [];

  constructor(privateKeys: string[]) {
    this.wallets = privateKeys.map((key) => ({
      privateKey: key.startsWith("0x") ? key : `0x${key}`,
      address: deriveAddress(key),
      inUse: false,
    }));
    logger.info({ total: this.wallets.length }, "Wallet pool initialized");
  }

  /** Assign a free wallet to an agent. Returns the wallet or null if none available. */
  acquire(agentId: string): WalletEntry | null {
    const wallet = this.wallets.find((w) => !w.inUse);
    if (!wallet) return null;
    wallet.inUse = true;
    wallet.assignedAgentId = agentId;
    logger.info({ agentId, address: wallet.address }, "Wallet assigned");
    return wallet;
  }

  /** Release a wallet back to the pool. */
  release(agentId: string): void {
    const wallet = this.wallets.find((w) => w.assignedAgentId === agentId);
    if (!wallet) return;
    wallet.inUse = false;
    wallet.assignedAgentId = undefined;
    logger.info({ agentId, address: wallet.address }, "Wallet released");
  }

  availableCount(): number {
    return this.wallets.filter((w) => !w.inUse).length;
  }

  totalCount(): number {
    return this.wallets.length;
  }
}

/** Parse FLEET_OPERATOR_KEYS environment variable (comma-separated private keys). */
export function parseOperatorKeys(): string[] {
  const raw = process.env.FLEET_OPERATOR_KEYS ?? "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}
