// KeeperBot - Ensures liveness of poker table by handling timeouts,
// starting hands, settling showdowns, and triggering rebalancing

import { ChainClient, GameState, type TableState } from "./chain/client.js";
import {
  isVrfAlreadyReRequested,
  isCannotStartHand,
  isSettleShowdownRetriable,
  isCommitmentAlreadyExists,
  isDuplicateKeeperAction,
} from "./contractErrors.js";
import { CircuitBreaker, CircuitOpenError, fetchWithTimeout, createLogger } from "@playerco/shared";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DEFAULT_REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || "10000", 10);

export interface KeeperBotConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  pokerTableAddress: `0x${string}`;
  ownerviewUrl?: string;
  dealerApiKey?: string;
  chainId?: number;
  pollIntervalMs?: number;
  /**
   * Max random delay (ms) added before each on-chain action to reduce
   * collision probability when multiple keeper instances run in parallel.
   * Default: 0 (no jitter). Set via KEEPER_ACTION_JITTER_MS.
   */
  actionJitterMs?: number;
  /** Optional vault address. When set, keeper triggers post-settlement rebalancing. */
  vaultAddress?: `0x${string}`;
}

export interface KeeperStats {
  timeoutsForced: number;
  handsStarted: number;
  showdownsSettled: number;
  vrfReRequests: number;
  errors: number;
  lastAction: string;
  lastActionTime: number;
  /** Breakdown of error categories for observability. */
  rpcErrors: number;
  apiErrors: number;
  txErrors: number;
  /** Duplicate/race actions skipped due to multi-keeper coordination. */
  coordinationSkips: number;
  /** Vault rebalancing attempts triggered after settlement. */
  rebalancesTriggered: number;
}

export class KeeperBot {
  private chainClient: ChainClient;
  private config: KeeperBotConfig;
  private running: boolean = false;
  private stats: KeeperStats = {
    timeoutsForced: 0,
    handsStarted: 0,
    showdownsSettled: 0,
    vrfReRequests: 0,
    errors: 0,
    lastAction: "none",
    lastActionTime: 0,
    rpcErrors: 0,
    apiErrors: 0,
    txErrors: 0,
    coordinationSkips: 0,
    rebalancesTriggered: 0,
  };
  /** Track which hands we've already attempted rebalancing to avoid duplicate triggers. */
  private rebalancedHands: Set<bigint> = new Set();

  // Circuit breakers
  private dealerCircuit = new CircuitBreaker({ name: "DealerAPI", failureThreshold: 5, recoveryTimeoutMs: 30_000 });
  private rpcCircuit = new CircuitBreaker({ name: "RPC", failureThreshold: 5, recoveryTimeoutMs: 30_000 });

  // Track last state to detect changes
  private lastHandId: bigint = 0n;
  private lastGameState: GameState = GameState.WAITING_FOR_SEATS;
  private currentBackoffMs: number = 0;
  private tableId: bigint | null = null;
  private commitSyncedHands: Set<bigint> = new Set();
  // Tracks hands where /dealer/deal has already been POSTed (avoid redundant requests)
  private dealtHands: Set<bigint> = new Set();
  private readonly log = createLogger({ service: "keeper" });

  constructor(config: KeeperBotConfig) {
    this.config = config;
    this.chainClient = new ChainClient({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      pokerTableAddress: config.pokerTableAddress,
      vaultAddress: config.vaultAddress,
      chainId: config.chainId,
    });
  }

  get address() {
    return this.chainClient.address;
  }

  getStats(): KeeperStats {
    return { ...this.stats };
  }

  getRpcCircuitState(): string {
    return this.rpcCircuit.circuitState;
  }

  async run(): Promise<void> {
    this.running = true;
    const pollInterval = Math.max(200, this.config.pollIntervalMs || 2000);
    this.currentBackoffMs = pollInterval;
    if (this.hasDealerIntegration()) {
      this.tableId = await this.chainClient.getTableId();
    }

    this.log.info({ address: this.address, table: this.config.pokerTableAddress, pollIntervalMs: pollInterval, dealerEnabled: this.hasDealerIntegration() }, "KeeperBot starting");

    while (this.running) {
      try {
        await this.rpcCircuit.execute(() => this.tick());
        this.currentBackoffMs = pollInterval;
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          this.log.warn({ circuit: "RPC" }, "RPC circuit open — skipping tick");
          await this.sleep(this.currentBackoffMs);
          continue;
        }
        this.log.error({ err: error }, "Error in tick");
        this.stats.errors++;
        if (this.isRateLimitError(error)) {
          this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, 15000);
          this.log.warn({ backoffMs: this.currentBackoffMs }, "RPC rate-limited, backing off");
        }
      }

      await this.sleep(this.currentBackoffMs);
    }

    this.log.info({ stats: this.stats }, "KeeperBot stopped");
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
      this.log.info({ handId: state.currentHandId.toString() }, "New hand detected");
      this.lastHandId = state.currentHandId;
    }

    if (state.gameState !== this.lastGameState) {
      this.log.info({ from: GameState[this.lastGameState], to: GameState[state.gameState] }, "State changed");
      this.lastGameState = state.gameState;
    }

    // Tournament over: log and stop looping
    if (state.gameState === GameState.TOURNAMENT_OVER) {
      this.log.info("TOURNAMENT_OVER — tournament has ended. Keeper stopping.");
      this.running = false;
      return;
    }

    // Check for keeper actions needed
    await this.checkAndSubmitHoleCommits(state);
    await this.checkAndHandleTimeout(state, currentTimestamp, currentBlock);
    // T-R3-03: Trigger vault rebalancing after settlement
    await this.checkAndTriggerRebalancing(state, currentBlock);
    await this.checkAndReRequestVRF(state, currentTimestamp);
    await this.checkAndReRequestHoleCardVRF(state, currentTimestamp);
    await this.checkAndStartHand(state);
    await this.checkAndSettleShowdown(state);
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

    this.log.info({ deadline: state.actionDeadline.toString(), current: currentTimestamp.toString() }, "Timeout detected");

    // Jitter before acting to reduce collision with other keeper instances
    await this.coordinationJitter();

    try {
      const hash = await this.chainClient.forceTimeout();
      this.stats.timeoutsForced++;
      this.recordAction("forceTimeout");
      this.log.info({ tx: hash }, "Forced timeout");
    } catch (error) {
      if (isDuplicateKeeperAction(error)) {
        this.handleCoordinationRace("forceTimeout", error);
      } else {
        this.log.error({ err: error }, "Failed to force timeout");
        this.stats.errors++;
      }
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

    this.log.info({ vrfRequestTs: state.vrfRequestTimestamp.toString(), current: currentTimestamp.toString() }, "VRF fulfillment delayed, re-requesting");

    // Jitter before acting to reduce collision with other keeper instances
    await this.coordinationJitter();

    try {
      const hash = await this.chainClient.reRequestVRF();
      this.stats.vrfReRequests++;
      this.recordAction("reRequestVRF");
      this.log.info({ tx: hash }, "Re-requested VRF");
    } catch (error) {
      if (isVrfAlreadyReRequested(error)) {
        // Race condition: someone else already re-requested
        this.handleCoordinationRace("reRequestVRF", error);
      } else {
        this.log.error({ err: error }, "Failed to re-request VRF");
        this.stats.errors++;
      }
    }
  }

  /**
   * Check if hole card VRF fulfillment is delayed and re-request if timeout exceeded.
   * Also handles auto-abort after MAX_HOLE_CARD_VRF_RETRIES on-chain.
   */
  private async checkAndReRequestHoleCardVRF(
    state: TableState,
    currentTimestamp: bigint
  ): Promise<void> {
    if (!this.chainClient.isHoleCardVRFWaitingState(state.gameState)) {
      return;
    }

    if (state.vrfRequestTimestamp === 0n) {
      return;
    }

    // VRF_TIMEOUT is 5 minutes = 300 seconds
    const vrfTimeout = 300n;
    if (currentTimestamp <= state.vrfRequestTimestamp + vrfTimeout) {
      return;
    }

    this.log.info(
      { vrfRequestTs: state.vrfRequestTimestamp.toString(), current: currentTimestamp.toString() },
      "Hole card VRF delayed, re-requesting (may abort hand if retries exceeded)"
    );

    await this.coordinationJitter();

    try {
      const hash = await this.chainClient.reRequestHoleCardVRF();
      this.stats.vrfReRequests++;
      this.recordAction("reRequestHoleCardVRF");
      this.log.info({ tx: hash }, "Re-requested hole card VRF");
    } catch (error) {
      if (isVrfAlreadyReRequested(error)) {
        this.handleCoordinationRace("reRequestHoleCardVRF", error);
      } else {
        this.log.error({ err: error }, "Failed to re-request hole card VRF");
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

    this.log.info("Table is ready, starting new hand");

    // Jitter before acting to reduce collision with other keeper instances
    await this.coordinationJitter();

    try {
      const hash = await this.chainClient.startHand();
      this.stats.handsStarted++;
      this.recordAction("startHand");
      this.log.info({ tx: hash }, "Started new hand");
    } catch (error) {
      if (isCannotStartHand(error)) {
        this.handleCoordinationRace("startHand", error);
      } else {
        this.log.error({ err: error }, "Failed to start hand");
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

    this.log.info("Showdown detected, triggering card-based settlement");

    // Jitter before acting to reduce collision with other keeper instances
    await this.coordinationJitter();

    try {
      await this.checkAndRevealHoleCards(state.currentHandId);
      const hash = await this.chainClient.settleShowdown();
      this.stats.showdownsSettled++;
      this.recordAction("settleShowdown");
      this.log.info({ tx: hash }, "Settled showdown (winner by card evaluation)");
    } catch (error) {
      if (isSettleShowdownRetriable(error)) {
        // Reveal window still open or no reveals yet: retry later.
        this.log.info("Waiting for hole card reveals before settlement");
      } else if (isDuplicateKeeperAction(error)) {
        this.handleCoordinationRace("settleShowdown", error);
      } else {
        this.log.error({ err: error }, "Failed to settle showdown");
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

    let commitments: Array<{ seatIndex: number; commitment: `0x${string}` }>;
    try {
      commitments = await this.dealerCircuit.execute(() =>
        this.getDealerCommitments(state.currentHandId)
      );
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        // Dealer API unavailable; skip silently
        return;
      }
      this.log.error({ err: error }, "Failed to get dealer commitments");
      this.stats.apiErrors++;
      return;
    }
    let submitted = 0;
    for (const { seatIndex, commitment } of commitments) {
      const existing = await this.chainClient.getHoleCommit(state.currentHandId, seatIndex);
      if (existing.toLowerCase() !== ZERO_BYTES32) {
        continue;
      }

      try {
        const hash = await this.chainClient.submitHoleCommit(state.currentHandId, seatIndex, commitment);
        submitted++;
        this.log.info({ handId: state.currentHandId.toString(), seatIndex, tx: hash }, "Submitted hole commit");
      } catch (error) {
        if (!isCommitmentAlreadyExists(error)) {
          throw error;
        }
      }
    }

    this.commitSyncedHands.add(state.currentHandId);
    // Prune entries to keep only the last 100 hand IDs to prevent unbounded growth
    if (this.commitSyncedHands.size > 100) {
      const oldest = this.commitSyncedHands.values().next().value;
      if (oldest !== undefined) this.commitSyncedHands.delete(oldest);
    }
    if (submitted > 0) {
      this.recordAction("submitHoleCommit");
    }
  }

  private async checkAndRevealHoleCards(handId: bigint): Promise<void> {
    if (!this.hasDealerIntegration() || this.tableId === null) {
      return;
    }

    let commitments: Array<{ seatIndex: number; commitment: `0x${string}` }>;
    try {
      commitments = await this.dealerCircuit.execute(() =>
        this.getDealerCommitments(handId)
      );
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        return;
      }
      this.log.error({ err: error }, "Failed to get dealer commitments for reveal");
      this.stats.apiErrors++;
      return;
    }
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

      let reveal: { cards: [number, number]; salt: `0x${string}` };
      try {
        reveal = await this.dealerCircuit.execute(() =>
          this.getDealerReveal(handId, seatIndex)
        );
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          return;
        }
        this.log.error({ err: error, handId: handId.toString(), seatIndex }, "Failed to get dealer reveal");
        this.stats.apiErrors++;
        continue;
      }
      try {
        const hash = await this.chainClient.revealHoleCards(
          handId,
          seatIndex,
          reveal.cards[0],
          reveal.cards[1],
          reveal.salt
        );
        revealedCount++;
        this.log.info({ handId: handId.toString(), seatIndex, tx: hash }, "Revealed hole cards");
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

    // Only POST /dealer/deal for hands that haven't been dealt yet
    if (!this.dealtHands.has(handId)) {
      const dealRes = await fetchWithTimeout(
        `${baseUrl}/dealer/deal`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeader },
          body: JSON.stringify({ tableId, handId: handIdStr }),
        },
        DEFAULT_REQUEST_TIMEOUT_MS
      );
      if (!dealRes.ok && dealRes.status !== 409) {
        const body = await dealRes.text().catch(() => "");
        throw new Error(`dealer/deal failed (${dealRes.status}): ${body}`);
      }
      this.dealtHands.add(handId);
      // Prune dealtHands to the last 100 entries
      if (this.dealtHands.size > 100) {
        const oldest = this.dealtHands.values().next().value;
        if (oldest !== undefined) this.dealtHands.delete(oldest);
      }
    }

    const commitmentsRes = await fetchWithTimeout(
      `${baseUrl}/dealer/commitments?tableId=${encodeURIComponent(tableId)}&handId=${encodeURIComponent(handIdStr)}`,
      { headers: authHeader },
      DEFAULT_REQUEST_TIMEOUT_MS
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

    const res = await fetchWithTimeout(
      `${baseUrl}/dealer/reveal?tableId=${encodeURIComponent(tableId)}&handId=${encodeURIComponent(handIdStr)}&seatIndex=${seatIndex}`,
      { headers: authHeader },
      DEFAULT_REQUEST_TIMEOUT_MS
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

  private recordAction(action: string): void {
    this.stats.lastAction = action;
    this.stats.lastActionTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Random jitter before on-chain actions when multiple keeper instances run.
   * Each keeper sleeps a random [0, actionJitterMs] ms so they act at different
   * times, reducing the chance two keepers submit the same transaction.
   */
  private async coordinationJitter(): Promise<void> {
    const maxJitter = this.config.actionJitterMs ?? 0;
    if (maxJitter <= 0) return;
    const delay = Math.floor(Math.random() * maxJitter);
    if (delay > 0) await this.sleep(delay);
  }

  /**
   * Handle errors that indicate another keeper instance already acted.
   * These are not real errors but expected coordination races.
   */
  private handleCoordinationRace(context: string, error: unknown): void {
    this.stats.coordinationSkips++;
    this.log.info({ context, reason: String(error).split("\n")[0] }, "Coordination skip — another keeper acted first");
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

  /**
   * T-R3-03: Trigger vault rebalancing after hand settlement.
   * Only runs when a vault address is configured and the hand is newly settled.
   * Respects the contract-enforced randomized delay (rebalanceEligibleBlock) and
   * size limits (rebalanceMaxMonBps / rebalanceMaxTokenBps).
   */
  private async checkAndTriggerRebalancing(state: TableState, currentBlock: bigint): Promise<void> {
    if (!this.chainClient.hasVault()) return;
    if (state.gameState !== GameState.SETTLED && state.gameState !== GameState.WAITING_FOR_SEATS) return;
    if (state.currentHandId === 0n) return;

    // Avoid retrying the same hand within this process run
    if (this.rebalancedHands.has(state.currentHandId)) return;

    let status;
    try {
      status = await this.chainClient.getRebalanceStatus();
    } catch (error) {
      this.log.warn({ err: error }, "Failed to read vault rebalance status");
      return;
    }

    if (!status.canRebalance) {
      // Not yet eligible (same hand or wrong state); mark to avoid repeated checks
      if (status.currentHandId === state.currentHandId &&
          status.lastRebalancedHandId === state.currentHandId) {
        this.rebalancedHands.add(state.currentHandId);
      }
      return;
    }

    // Respect the on-chain randomized delay (set by vault after settlement)
    if (currentBlock < status.rebalanceEligibleBlock) {
      this.log.debug({
        blocksRemaining: status.blocksRemaining.toString(),
        eligibleBlock: status.rebalanceEligibleBlock.toString(),
      }, "Rebalance not yet eligible, waiting for delay");
      return;
    }

    // Mark as attempted for this hand regardless of outcome
    this.rebalancedHands.add(state.currentHandId);

    // Read vault state to determine amount within BPS limits
    let externalAssets: bigint;
    let treasuryShares: bigint;
    let maxMonBps: bigint;
    let maxTokenBps: bigint;
    try {
      [externalAssets, treasuryShares, maxMonBps, maxTokenBps] = await Promise.all([
        this.chainClient.getVaultExternalAssets(),
        this.chainClient.getVaultTreasuryShares(),
        this.chainClient.getVaultRebalanceMaxMonBps(),
        this.chainClient.getVaultRebalanceMaxTokenBps(),
      ]);
    } catch (error) {
      this.log.warn({ err: error }, "Failed to read vault state for rebalancing");
      return;
    }

    // Try rebalanceBuy first (uses external assets to buy treasury shares)
    if (externalAssets > 0n && maxMonBps > 0n) {
      const monAmount = externalAssets * maxMonBps / 10000n;
      if (monAmount > 0n) {
        try {
          await this.coordinationJitter();
          const hash = await this.chainClient.rebalanceBuy(status.currentHandId, monAmount, 0n);
          this.stats.rebalancesTriggered++;
          this.recordAction("rebalanceBuy");
          this.log.info({ tx: hash, monAmount: monAmount.toString(), handId: state.currentHandId.toString() }, "Vault rebalanceBuy triggered");
          return;
        } catch (error) {
          // Accretive constraint not satisfied (price too high) or other error — try sell
          this.log.info({ err: String(error).split("\n")[0], handId: state.currentHandId.toString() }, "rebalanceBuy skipped (accretive constraint or error), trying sell");
        }
      }
    }

    // Try rebalanceSell (sells treasury shares for external assets)
    if (treasuryShares > 0n && maxTokenBps > 0n) {
      const tokenAmount = treasuryShares * maxTokenBps / 10000n;
      if (tokenAmount > 0n) {
        try {
          await this.coordinationJitter();
          const hash = await this.chainClient.rebalanceSell(status.currentHandId, tokenAmount, 0n);
          this.stats.rebalancesTriggered++;
          this.recordAction("rebalanceSell");
          this.log.info({ tx: hash, tokenAmount: tokenAmount.toString(), handId: state.currentHandId.toString() }, "Vault rebalanceSell triggered");
        } catch (error) {
          this.log.info({ err: String(error).split("\n")[0], handId: state.currentHandId.toString() }, "rebalanceSell skipped (accretive constraint or error)");
        }
      }
    }
  }
}
