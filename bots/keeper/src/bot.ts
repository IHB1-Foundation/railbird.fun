// KeeperBot - Ensures liveness of poker table by handling timeouts,
// starting hands, settling showdowns, and triggering rebalancing

import { ChainClient, GameState, type TableState, type RebalanceStatus } from "./chain/client.js";

export interface KeeperBotConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  pokerTableAddress: `0x${string}`;
  playerVaultAddress?: `0x${string}`;
  chainId?: number;
  pollIntervalMs?: number;
  // Rebalancing config (optional)
  enableRebalancing?: boolean;
  rebalanceBuyAmountMon?: bigint;
  rebalanceSellAmountTokens?: bigint;
}

export interface KeeperStats {
  timeoutsForced: number;
  handsStarted: number;
  showdownsSettled: number;
  rebalancesTriggered: number;
  errors: number;
  lastAction: string;
  lastActionTime: number;
}

export class KeeperBot {
  private chainClient: ChainClient;
  private config: KeeperBotConfig;
  private running: boolean = false;
  private stats: KeeperStats = {
    timeoutsForced: 0,
    handsStarted: 0,
    showdownsSettled: 0,
    rebalancesTriggered: 0,
    errors: 0,
    lastAction: "none",
    lastActionTime: 0,
  };

  // Track last state to detect changes
  private lastHandId: bigint = 0n;
  private lastGameState: GameState = GameState.WAITING_FOR_SEATS;

  constructor(config: KeeperBotConfig) {
    this.config = config;
    this.chainClient = new ChainClient({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      pokerTableAddress: config.pokerTableAddress,
      playerVaultAddress: config.playerVaultAddress,
      chainId: config.chainId,
    });
  }

  get address() {
    return this.chainClient.address;
  }

  getStats(): KeeperStats {
    return { ...this.stats };
  }

  async run(): Promise<void> {
    this.running = true;
    const pollInterval = this.config.pollIntervalMs || 2000;

    console.log(`[KeeperBot] Starting keeper for address: ${this.address}`);
    console.log(`[KeeperBot] Table: ${this.config.pokerTableAddress}`);
    if (this.config.playerVaultAddress) {
      console.log(`[KeeperBot] Vault: ${this.config.playerVaultAddress}`);
    }
    console.log(`[KeeperBot] Poll interval: ${pollInterval}ms`);

    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        console.error("[KeeperBot] Error in tick:", error);
        this.stats.errors++;
      }

      await this.sleep(pollInterval);
    }

    console.log("[KeeperBot] Keeper stopped");
    console.log(`[KeeperBot] Stats: ${JSON.stringify(this.stats)}`);
  }

  stop(): void {
    this.running = false;
  }

  private async tick(): Promise<void> {
    const state = await this.chainClient.getTableState();
    const currentBlock = await this.chainClient.getBlockNumber();
    const currentTimestamp = await this.chainClient.getBlockTimestamp();

    // Track state changes
    if (state.currentHandId !== this.lastHandId) {
      console.log(`[KeeperBot] New hand detected: ${state.currentHandId}`);
      this.lastHandId = state.currentHandId;
    }

    if (state.gameState !== this.lastGameState) {
      console.log(`[KeeperBot] State changed: ${GameState[this.lastGameState]} -> ${GameState[state.gameState]}`);
      this.lastGameState = state.gameState;
    }

    // Check for keeper actions needed
    await this.checkAndHandleTimeout(state, currentTimestamp, currentBlock);
    await this.checkAndStartHand(state);
    await this.checkAndSettleShowdown(state);
    await this.checkAndRebalance();
  }

  /**
   * Check if action deadline has passed and force timeout if needed
   */
  private async checkAndHandleTimeout(
    state: TableState,
    currentTimestamp: bigint,
    currentBlock: bigint
  ): Promise<void> {
    // Only in betting states
    if (!this.chainClient.isBettingState(state.gameState)) {
      return;
    }

    // Check if deadline has passed
    if (currentTimestamp <= state.actionDeadline) {
      return;
    }

    // Check one-action-per-block
    if (currentBlock <= state.lastActionBlock) {
      return;
    }

    console.log(
      `[KeeperBot] Timeout detected! Deadline: ${state.actionDeadline}, Current: ${currentTimestamp}`
    );

    try {
      const hash = await this.chainClient.forceTimeout();
      this.stats.timeoutsForced++;
      this.recordAction("forceTimeout");
      console.log(`[KeeperBot] Forced timeout, tx: ${hash}`);
    } catch (error) {
      console.error("[KeeperBot] Failed to force timeout:", error);
      this.stats.errors++;
    }
  }

  /**
   * Check if table is ready for a new hand and start it
   */
  private async checkAndStartHand(state: TableState): Promise<void> {
    if (state.gameState !== GameState.SETTLED) {
      return;
    }

    if (!state.allSeatsFilled) {
      return;
    }

    // Check all seats have enough for blinds (minimal check)
    const hasEnoughStack = state.seats.every((s) => s.stack >= 10n);
    if (!hasEnoughStack) {
      return;
    }

    console.log("[KeeperBot] Table is SETTLED with all seats filled, starting new hand...");

    try {
      const hash = await this.chainClient.startHand();
      this.stats.handsStarted++;
      this.recordAction("startHand");
      console.log(`[KeeperBot] Started new hand, tx: ${hash}`);
    } catch (error) {
      const errorMsg = String(error);
      if (!errorMsg.includes("Cannot start hand now")) {
        console.error("[KeeperBot] Failed to start hand:", error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Check if showdown needs to be settled.
   * Settlement now uses on-chain hand evaluation of revealed hole cards.
   * Keeper just triggers settleShowdown(); the contract determines the winner.
   */
  private async checkAndSettleShowdown(state: TableState): Promise<void> {
    if (state.gameState !== GameState.SHOWDOWN) {
      return;
    }

    console.log("[KeeperBot] Showdown detected, triggering card-based settlement...");

    try {
      const hash = await this.chainClient.settleShowdown();
      this.stats.showdownsSettled++;
      this.recordAction("settleShowdown");
      console.log(`[KeeperBot] Settled showdown (winner determined by card evaluation), tx: ${hash}`);
    } catch (error) {
      const errorMsg = String(error);
      // "No revealed hole cards" means reveals haven't been submitted yet; retry later
      if (errorMsg.includes("No revealed hole cards")) {
        console.log("[KeeperBot] Waiting for hole card reveals before settlement...");
      } else {
        console.error("[KeeperBot] Failed to settle showdown:", error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Check if rebalancing is eligible and trigger it
   */
  private async checkAndRebalance(): Promise<void> {
    if (!this.config.enableRebalancing || !this.config.playerVaultAddress) {
      return;
    }

    const status = await this.chainClient.getRebalanceStatus();
    if (!status || !status.canRebalance) {
      return;
    }

    console.log(`[KeeperBot] Rebalance eligible for hand ${status.currentHandId}`);

    // Get vault stats to decide buy or sell
    const vaultStats = await this.chainClient.getVaultStats();
    if (!vaultStats) return;

    // Simple rebalancing logic:
    // If external assets > treasury shares value, buy tokens
    // If treasury shares > some threshold, sell tokens
    // For MVP, we'll just do a small buy if enabled

    const buyAmount = this.config.rebalanceBuyAmountMon || 0n;
    const sellAmount = this.config.rebalanceSellAmountTokens || 0n;

    if (buyAmount > 0n) {
      try {
        // Set minTokenOut to 0 for MVP (no slippage protection)
        // In production, would calculate based on NAV
        const hash = await this.chainClient.rebalanceBuy(buyAmount, 0n);
        this.stats.rebalancesTriggered++;
        this.recordAction("rebalanceBuy");
        console.log(`[KeeperBot] Executed rebalance buy: ${buyAmount}, tx: ${hash}`);
      } catch (error) {
        console.error("[KeeperBot] Failed to rebalance buy:", error);
        this.stats.errors++;
      }
    } else if (sellAmount > 0n) {
      try {
        const hash = await this.chainClient.rebalanceSell(sellAmount, 0n);
        this.stats.rebalancesTriggered++;
        this.recordAction("rebalanceSell");
        console.log(`[KeeperBot] Executed rebalance sell: ${sellAmount}, tx: ${hash}`);
      } catch (error) {
        console.error("[KeeperBot] Failed to rebalance sell:", error);
        this.stats.errors++;
      }
    }
  }

  private recordAction(action: string): void {
    this.stats.lastAction = action;
    this.stats.lastActionTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
