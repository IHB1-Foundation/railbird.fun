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
import { CircuitBreaker, CircuitOpenError } from "@playerco/shared";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DEFAULT_REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || "10000", 10);

/**
 * Fetch wrapper with AbortController timeout.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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
  };

  // Circuit breaker for the dealer API
  private dealerCircuit = new CircuitBreaker({ name: "DealerAPI", failureThreshold: 5, recoveryTimeoutMs: 30_000 });

  // Track last state to detect changes
  private lastHandId: bigint = 0n;
  private lastGameState: GameState = GameState.WAITING_FOR_SEATS;
  private currentBackoffMs: number = 0;
  private tableId: bigint | null = null;
  private commitSyncedHands: Set<bigint> = new Set();
  // Tracks hands where /dealer/deal has already been POSTed (avoid redundant requests)
  private dealtHands: Set<bigint> = new Set();

  constructor(config: KeeperBotConfig) {
    this.config = config;
    this.chainClient = new ChainClient({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      pokerTableAddress: config.pokerTableAddress,
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

    // Tournament over: log and stop looping
    if (state.gameState === GameState.TOURNAMENT_OVER) {
      console.log(`[KeeperBot] TOURNAMENT_OVER — tournament has ended. Keeper stopping.`);
      this.running = false;
      return;
    }

    // Check for keeper actions needed
    await this.checkAndSubmitHoleCommits(state);
    await this.checkAndHandleTimeout(state, currentTimestamp, currentBlock);
    await this.checkAndReRequestVRF(state, currentTimestamp);
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

    console.log(
      `[KeeperBot] Timeout detected! Deadline: ${state.actionDeadline}, Current: ${currentTimestamp}`
    );

    // Jitter before acting to reduce collision with other keeper instances
    await this.coordinationJitter();

    try {
      const hash = await this.chainClient.forceTimeout();
      this.stats.timeoutsForced++;
      this.recordAction("forceTimeout");
      console.log(`[KeeperBot] Forced timeout, tx: ${hash}`);
    } catch (error) {
      if (isDuplicateKeeperAction(error)) {
        this.handleCoordinationRace("forceTimeout", error);
      } else {
        console.error("[KeeperBot] Failed to force timeout:", error);
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

    console.log(
      `[KeeperBot] VRF fulfillment delayed! Request timestamp: ${state.vrfRequestTimestamp}, ` +
        `Current: ${currentTimestamp}, Requesting new VRF...`
    );

    // Jitter before acting to reduce collision with other keeper instances
    await this.coordinationJitter();

    try {
      const hash = await this.chainClient.reRequestVRF();
      this.stats.vrfReRequests++;
      this.recordAction("reRequestVRF");
      console.log(`[KeeperBot] Re-requested VRF, tx: ${hash}`);
    } catch (error) {
      if (isVrfAlreadyReRequested(error)) {
        // Race condition: someone else already re-requested
        this.handleCoordinationRace("reRequestVRF", error);
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

    // Jitter before acting to reduce collision with other keeper instances
    await this.coordinationJitter();

    try {
      const hash = await this.chainClient.startHand();
      this.stats.handsStarted++;
      this.recordAction("startHand");
      console.log(`[KeeperBot] Started new hand, tx: ${hash}`);
    } catch (error) {
      if (isCannotStartHand(error)) {
        this.handleCoordinationRace("startHand", error);
      } else {
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

    // Jitter before acting to reduce collision with other keeper instances
    await this.coordinationJitter();

    try {
      await this.checkAndRevealHoleCards(state.currentHandId);
      const hash = await this.chainClient.settleShowdown();
      this.stats.showdownsSettled++;
      this.recordAction("settleShowdown");
      console.log(`[KeeperBot] Settled showdown (winner determined by card evaluation), tx: ${hash}`);
    } catch (error) {
      if (isSettleShowdownRetriable(error)) {
        // Reveal window still open or no reveals yet: retry later.
        console.log("[KeeperBot] Waiting for hole card reveals before settlement...");
      } else if (isDuplicateKeeperAction(error)) {
        this.handleCoordinationRace("settleShowdown", error);
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
      console.error("[KeeperBot] Failed to get dealer commitments:", error);
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
        console.log(
          `[KeeperBot] Submitted hole commit hand=${state.currentHandId} seat=${seatIndex}, tx: ${hash}`
        );
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
      console.error("[KeeperBot] Failed to get dealer commitments for reveal:", error);
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
        console.error(`[KeeperBot] Failed to get dealer reveal hand=${handId} seat=${seatIndex}:`, error);
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

    // Only POST /dealer/deal for hands that haven't been dealt yet
    if (!this.dealtHands.has(handId)) {
      const dealRes = await fetchWithTimeout(
        `${baseUrl}/dealer/deal`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeader },
          body: JSON.stringify({ tableId, handId: handIdStr }),
        }
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

    const res = await fetchWithTimeout(
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
    console.info(`[KeeperBot] Coordination skip in ${context} (another keeper acted first):`, String(error).split("\n")[0]);
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
