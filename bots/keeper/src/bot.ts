// KeeperBot - Ensures liveness of poker table by handling timeouts,
// starting hands, settling showdowns, and triggering rebalancing

import { ChainClient, GameState, type TableState, type RebalanceStatus } from "./chain/client.js";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

export interface KeeperBotConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  pokerTableAddress: `0x${string}`;
  playerVaultAddress?: `0x${string}`;
  ownerviewUrl?: string;
  dealerApiKey?: string;
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
  vrfReRequests: number;
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
    vrfReRequests: 0,
    errors: 0,
    lastAction: "none",
    lastActionTime: 0,
  };

  // Track last state to detect changes
  private lastHandId: bigint = 0n;
  private lastGameState: GameState = GameState.WAITING_FOR_SEATS;
  private currentBackoffMs: number = 0;
  private tableId: bigint | null = null;
  private commitSyncedHands: Set<bigint> = new Set();

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
    const pollInterval = Math.max(200, this.config.pollIntervalMs || 2000);
    this.currentBackoffMs = pollInterval;
    if (this.hasDealerIntegration()) {
      this.tableId = await this.chainClient.getTableId();
    }

    console.log(`[KeeperBot] Starting keeper for address: ${this.address}`);
    console.log(`[KeeperBot] Table: ${this.config.pokerTableAddress}`);
    if (this.config.playerVaultAddress) {
      console.log(`[KeeperBot] Vault: ${this.config.playerVaultAddress}`);
    }
    console.log(`[KeeperBot] Poll interval: ${pollInterval}ms`);
    console.log(`[KeeperBot] Dealer integration: ${this.hasDealerIntegration() ? "enabled" : "disabled"}`);

    while (this.running) {
      try {
        await this.tick();
        this.currentBackoffMs = pollInterval;
      } catch (error) {
        console.error("[KeeperBot] Error in tick:", error);
        this.stats.errors++;
        if (this.isRateLimitError(error)) {
          this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, 15000);
          console.warn(`[KeeperBot] RPC rate-limited. Backing off to ${this.currentBackoffMs}ms`);
        }
      }

      await this.sleep(this.currentBackoffMs);
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
    await this.checkAndSubmitHoleCommits(state);
    await this.checkAndHandleTimeout(state, currentTimestamp, currentBlock);
    await this.checkAndReRequestVRF(state, currentTimestamp);
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
   * Check if VRF fulfillment is delayed and re-request if timeout exceeded.
   * VRF timeout is 5 minutes (on-chain constant VRF_TIMEOUT).
   */
  private async checkAndReRequestVRF(
    state: TableState,
    currentTimestamp: bigint
  ): Promise<void> {
    if (!this.chainClient.isVRFWaitingState(state.gameState)) {
      return;
    }

    // VRF request timestamp of 0 means no request tracked yet
    if (state.vrfRequestTimestamp === 0n) {
      return;
    }

    // VRF_TIMEOUT is 5 minutes = 300 seconds
    const vrfTimeout = 300n;
    if (currentTimestamp <= state.vrfRequestTimestamp + vrfTimeout) {
      return;
    }

    console.log(
      `[KeeperBot] VRF fulfillment delayed! Request timestamp: ${state.vrfRequestTimestamp}, ` +
        `Current: ${currentTimestamp}, Requesting new VRF...`
    );

    try {
      const hash = await this.chainClient.reRequestVRF();
      this.stats.vrfReRequests++;
      this.recordAction("reRequestVRF");
      console.log(`[KeeperBot] Re-requested VRF, tx: ${hash}`);
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("VRF timeout not reached")) {
        // Race condition: someone else already re-requested
        console.log("[KeeperBot] VRF already re-requested by another keeper");
      } else {
        console.error("[KeeperBot] Failed to re-request VRF:", error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Check if table is ready for a new hand and start it
   */
  private async checkAndStartHand(state: TableState): Promise<void> {
    if (state.gameState !== GameState.SETTLED && state.gameState !== GameState.WAITING_FOR_SEATS) {
      return;
    }

    if (!state.canStartHand) {
      return;
    }

    console.log("[KeeperBot] Table is ready, starting new hand...");

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
      await this.checkAndRevealHoleCards(state.currentHandId);
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

  private hasDealerIntegration(): boolean {
    return Boolean(this.config.ownerviewUrl && this.config.dealerApiKey);
  }

  private async checkAndSubmitHoleCommits(state: TableState): Promise<void> {
    if (!this.hasDealerIntegration() || this.tableId === null) {
      return;
    }
    if (state.currentHandId === 0n) {
      return;
    }
    if (state.gameState === GameState.WAITING_FOR_SEATS || state.gameState === GameState.SETTLED) {
      return;
    }
    if (this.commitSyncedHands.has(state.currentHandId)) {
      return;
    }

    const commitments = await this.getDealerCommitments(state.currentHandId);
    let submitted = 0;
    for (const { seatIndex, commitment } of commitments) {
      const existing = await this.chainClient.getHoleCommit(state.currentHandId, seatIndex);
      if (existing.toLowerCase() !== ZERO_BYTES32) {
        continue;
      }

      try {
        const hash = await this.chainClient.submitHoleCommit(state.currentHandId, seatIndex, commitment);
        submitted++;
        console.log(
          `[KeeperBot] Submitted hole commit hand=${state.currentHandId} seat=${seatIndex}, tx: ${hash}`
        );
      } catch (error) {
        const errorMsg = String(error);
        if (!errorMsg.includes("Commitment already exists")) {
          throw error;
        }
      }
    }

    this.commitSyncedHands.add(state.currentHandId);
    if (submitted > 0) {
      this.recordAction("submitHoleCommit");
    }
  }

  private async checkAndRevealHoleCards(handId: bigint): Promise<void> {
    if (!this.hasDealerIntegration() || this.tableId === null) {
      return;
    }

    const commitments = await this.getDealerCommitments(handId);
    let revealedCount = 0;
    for (const { seatIndex, commitment } of commitments) {
      const onChainCommit = await this.chainClient.getHoleCommit(handId, seatIndex);
      if (onChainCommit.toLowerCase() !== commitment.toLowerCase()) {
        continue;
      }

      const alreadyRevealed = await this.chainClient.isHoleCardsRevealed(handId, seatIndex);
      if (alreadyRevealed) {
        continue;
      }

      const reveal = await this.getDealerReveal(handId, seatIndex);
      try {
        const hash = await this.chainClient.revealHoleCards(
          handId,
          seatIndex,
          reveal.cards[0],
          reveal.cards[1],
          reveal.salt
        );
        revealedCount++;
        console.log(
          `[KeeperBot] Revealed hole cards hand=${handId} seat=${seatIndex}, tx: ${hash}`
        );
      } catch (error) {
        const errorMsg = String(error);
        if (
          !errorMsg.includes("Already revealed") &&
          !errorMsg.includes("No commitment found") &&
          !errorMsg.includes("Invalid reveal")
        ) {
          throw error;
        }
      }
    }

    if (revealedCount > 0) {
      this.recordAction("revealHoleCards");
    }
  }

  private async getDealerCommitments(
    handId: bigint
  ): Promise<Array<{ seatIndex: number; commitment: `0x${string}` }>> {
    const baseUrl = this.config.ownerviewUrl!.replace(/\/$/, "");
    const tableId = this.tableId!.toString();
    const handIdStr = handId.toString();
    const authHeader = { Authorization: `Bearer ${this.config.dealerApiKey!}` };

    const dealRes = await fetch(`${baseUrl}/dealer/deal`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({ tableId, handId: handIdStr }),
    });
    if (!dealRes.ok && dealRes.status !== 409) {
      const body = await dealRes.text().catch(() => "");
      throw new Error(`dealer/deal failed (${dealRes.status}): ${body}`);
    }

    const commitmentsRes = await fetch(
      `${baseUrl}/dealer/commitments?tableId=${encodeURIComponent(tableId)}&handId=${encodeURIComponent(handIdStr)}`,
      { headers: authHeader }
    );
    if (!commitmentsRes.ok) {
      const body = await commitmentsRes.text().catch(() => "");
      throw new Error(`dealer/commitments failed (${commitmentsRes.status}): ${body}`);
    }

    const payload = (await commitmentsRes.json()) as {
      commitments: Array<{ seatIndex: number; commitment: `0x${string}` }>;
    };
    return payload.commitments || [];
  }

  private async getDealerReveal(
    handId: bigint,
    seatIndex: number
  ): Promise<{ cards: [number, number]; salt: `0x${string}` }> {
    const baseUrl = this.config.ownerviewUrl!.replace(/\/$/, "");
    const tableId = this.tableId!.toString();
    const handIdStr = handId.toString();
    const authHeader = { Authorization: `Bearer ${this.config.dealerApiKey!}` };

    const res = await fetch(
      `${baseUrl}/dealer/reveal?tableId=${encodeURIComponent(tableId)}&handId=${encodeURIComponent(handIdStr)}&seatIndex=${seatIndex}`,
      { headers: authHeader }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`dealer/reveal failed (${res.status}): ${body}`);
    }

    const payload = (await res.json()) as {
      cards: [number, number];
      salt: `0x${string}`;
    };
    return payload;
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

  private isRateLimitError(error: unknown): boolean {
    const message = String(error).toLowerCase();
    return (
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("requests limited")
    );
  }
}
