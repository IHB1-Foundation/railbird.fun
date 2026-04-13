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
import type { TreasuryAdvisor } from "./treasury/advisor.js";
import type { RebalanceContext, RebalanceRecommendation } from "./treasury/types.js";

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
  /** AI-driven treasury rebalancing advisor. Only active when provided. */
  treasuryAdvisor?: TreasuryAdvisor;
  /** Indexer base URL for commentary WS broadcast endpoint. */
  indexerUrl?: string;
  /** Optional SideBetPool contract address. When set, keeper settles side bets after hand settlement. */
  sideBetPoolAddress?: `0x${string}`;
  /**
   * When true and autoRefillBuyInAmount is set, the keeper will automatically
   * re-register seats whose stack falls below autoRefillMinStack. Only works
   * when the keeper wallet is the operator address for that seat.
   */
  autoRefillEnabled?: boolean;
  /** RCHIP token address for approve+registerSeat. If not set, read from chipToken(). */
  autoRefillTokenAddress?: `0x${string}`;
  /** Buy-in amount (in token units) to use when refilling. */
  autoRefillBuyInAmount?: bigint;
  /** Refill when stack drops below this value. Defaults to 0 (refill only when evicted). */
  autoRefillMinStack?: bigint;
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
  /** Auto buy-in refills triggered after eviction. */
  autoRefillsTriggered: number;
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
    autoRefillsTriggered: 0,
  };
  /** Track which hands we've already attempted rebalancing to avoid duplicate triggers. */
  private rebalancedHands: Set<bigint> = new Set();
  /** Cache chipToken address to avoid repeated RPC calls. */
  private chipTokenCache: `0x${string}` | null = null;
  /** Seats already refilled this process run to avoid repeated attempts per poll. */
  private refilledSeats: Set<number> = new Set();
  /** Track which hands we've already settled side bets to avoid duplicate triggers. */
  private sideBetSettledHands: Set<bigint> = new Set();
  /** AI treasury advisor (optional, controlled by TREASURY_ADVISOR_ENABLED). */
  private treasuryAdvisor: TreasuryAdvisor | undefined;

  // Circuit breakers
  private dealerCircuit = new CircuitBreaker({
    name: "DealerAPI",
    failureThreshold: 5,
    recoveryTimeoutMs: 30_000,
  });
  private rpcCircuit = new CircuitBreaker({
    name: "RPC",
    failureThreshold: 5,
    recoveryTimeoutMs: 30_000,
  });

  // Track last state to detect changes
  private lastHandId: bigint = 0n;
  private lastGameState: GameState = GameState.WAITING_FOR_SEATS;
  private currentBackoffMs: number = 0;
  private tableId: bigint | null = null;
  private commitSyncedHands: Set<bigint> = new Set();
  // Tracks hands where /dealer/deal has already been POSTed (avoid redundant requests)
  private dealtHands: Set<bigint> = new Set();
  // Commentary: track hand+street combos that already triggered to avoid duplicates
  private commentaryTriggered: Set<string> = new Set();
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
    this.treasuryAdvisor = config.treasuryAdvisor;
  }

  get treasuryAdvisorEnabled(): boolean {
    return this.treasuryAdvisor !== undefined;
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

  getDealerCircuitState(): string {
    return this.dealerCircuit.circuitState;
  }

  async run(): Promise<void> {
    this.running = true;
    const pollInterval = Math.max(200, this.config.pollIntervalMs || 2000);
    this.currentBackoffMs = pollInterval;
    if (this.hasDealerIntegration()) {
      this.tableId = await this.chainClient.getTableId();
    }

    this.log.info(
      {
        address: this.address,
        table: this.config.pokerTableAddress,
        pollIntervalMs: pollInterval,
        dealerEnabled: this.hasDealerIntegration(),
      },
      "KeeperBot starting",
    );

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
      this.log.info(
        { from: GameState[this.lastGameState], to: GameState[state.gameState] },
        "State changed",
      );
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
    // T-1201: Trigger side bet settlement after hand settlement
    await this.checkAndTriggerSideBetSettlement(state);
    // C-1: Auto buy-in for evicted seats
    await this.checkAndAutoRefill();
    await this.checkAndReRequestVRF(state, currentTimestamp);
    await this.checkAndReRequestHoleCardVRF(state, currentTimestamp);
    await this.checkAndStartHand(state);
    await this.checkAndSettleShowdown(state);
    // T-1101: Trigger AI commentary on street transitions / settlement
    this.checkAndTriggerCommentary(state);
  }

  /**
   * T-1101: Fire commentary requests to OwnerView and broadcast via Indexer.
   * Fires on street transitions (flop/turn/river) and hand settlement.
   * Failures are silently ignored — must never block game liveness.
   */
  private checkAndTriggerCommentary(state: TableState): void {
    if (!this.config.ownerviewUrl) return;

    const streetTriggers: Partial<Record<GameState, string>> = {
      [GameState.BETTING_FLOP]: "flop",
      [GameState.BETTING_TURN]: "turn",
      [GameState.BETTING_RIVER]: "river",
      [GameState.SETTLED]: "settlement",
    };

    const street = streetTriggers[state.gameState];
    if (!street) return;

    const key = `${state.currentHandId.toString()}:${street}`;
    if (this.commentaryTriggered.has(key)) return;
    this.commentaryTriggered.add(key);

    // Prune to prevent unbounded growth (keep last 200 entries)
    if (this.commentaryTriggered.size > 200) {
      const first = this.commentaryTriggered.values().next().value;
      if (first !== undefined) this.commentaryTriggered.delete(first);
    }

    const tableAddress = this.config.pokerTableAddress;
    const handId = state.currentHandId.toString();
    const triggerAction = street === "settlement" ? "hand_settled" : "street_started";

    // Fire-and-forget — do not await
    void this.fireCommentary(tableAddress, handId, street, triggerAction);
  }

  private async fireCommentary(
    tableAddress: string,
    handId: string,
    street: string,
    triggerAction: string,
  ): Promise<void> {
    const ownerviewBase = this.config.ownerviewUrl!.replace(/\/$/, "");

    // Step 1: POST to OwnerView for Gemini generation + storage
    let commentary: string | undefined;
    let personaContext: string | undefined;
    try {
      const res = await fetchWithTimeout(
        `${ownerviewBase}/commentary`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tableAddress, handId, street, triggerAction, context: {} }),
        },
        10_000,
      );
      if (res.ok) {
        const payload = (await res.json()) as {
          entry?: { commentary?: string; personaContext?: string };
        };
        commentary = payload.entry?.commentary;
        personaContext = payload.entry?.personaContext;
      }
    } catch (err) {
      this.log.debug(
        { err: err instanceof Error ? err.message : String(err) },
        "Commentary OwnerView call failed (non-fatal)",
      );
      return;
    }

    if (!commentary) return;

    // Step 2: POST to Indexer for WS broadcast
    if (!this.config.indexerUrl) return;
    const indexerBase = this.config.indexerUrl.replace(/\/$/, "");
    const tableId = this.tableId?.toString() ?? tableAddress;
    try {
      await fetchWithTimeout(
        `${indexerBase}/api/tables/${encodeURIComponent(tableId)}/commentary`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handId, street, commentary, personaContext }),
        },
        5_000,
      );
    } catch (err) {
      this.log.debug(
        { err: err instanceof Error ? err.message : String(err) },
        "Commentary Indexer broadcast call failed (non-fatal)",
      );
    }
  }

  /**
   * Check if action deadline has passed and force timeout if needed
   */
  private async checkAndHandleTimeout(
    state: TableState,
    currentTimestamp: bigint,
    currentBlock: bigint,
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

    this.log.info(
      { deadline: state.actionDeadline.toString(), current: currentTimestamp.toString() },
      "Timeout detected",
    );

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
  private async checkAndReRequestVRF(state: TableState, currentTimestamp: bigint): Promise<void> {
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

    this.log.info(
      { vrfRequestTs: state.vrfRequestTimestamp.toString(), current: currentTimestamp.toString() },
      "VRF fulfillment delayed, re-requesting",
    );

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
    currentTimestamp: bigint,
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
      "Hole card VRF delayed, re-requesting (may abort hand if retries exceeded)",
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

  private async ensureDealerAuthority(): Promise<boolean> {
    const [dealer, admin] = await Promise.all([
      this.chainClient.getDealerAddress(),
      this.chainClient.getAdminAddress(),
    ]);

    if (dealer.toLowerCase() === this.address.toLowerCase()) {
      return true;
    }

    if (admin.toLowerCase() !== this.address.toLowerCase()) {
      this.log.warn(
        { dealer, admin, keeper: this.address },
        "Keeper is not the configured dealer and cannot self-heal dealer assignment",
      );
      return false;
    }

    const hash = await this.chainClient.setDealer(this.address);
    this.recordAction("setDealer");
    this.log.info(
      { previousDealer: dealer, newDealer: this.address, tx: hash },
      "Updated table dealer to keeper",
    );
    return true;
  }

  private async checkAndSubmitHoleCommits(state: TableState): Promise<void> {
    if (!this.hasDealerIntegration() || this.tableId === null) {
      return;
    }
    if (state.currentHandId === 0n) {
      return;
    }
    if (state.gameState !== GameState.WAITING_FOR_HOLECARDS) {
      return;
    }
    if (this.commitSyncedHands.has(state.currentHandId)) {
      return;
    }

    const hasDealerAuthority = await this.ensureDealerAuthority();
    if (!hasDealerAuthority) {
      return;
    }

    let commitments: Array<{ seatIndex: number; commitment: `0x${string}` }>;
    try {
      commitments = await this.dealerCircuit.execute(() =>
        this.getDealerCommitments(state.currentHandId),
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
    if (commitments.length === 0) {
      return;
    }

    let submitted = 0;
    for (const { seatIndex, commitment } of commitments) {
      const existing = await this.chainClient.getHoleCommit(state.currentHandId, seatIndex);
      if (existing.toLowerCase() !== ZERO_BYTES32) {
        continue;
      }

      try {
        const hash = await this.chainClient.submitHoleCommit(
          state.currentHandId,
          seatIndex,
          commitment,
        );
        submitted++;
        this.log.info(
          { handId: state.currentHandId.toString(), seatIndex, tx: hash },
          "Submitted hole commit",
        );
      } catch (error) {
        if (!isCommitmentAlreadyExists(error)) {
          throw error;
        }
      }
    }

    if (submitted > 0) {
      this.recordAction("submitHoleCommit");
    }

    try {
      const hash = await this.chainClient.advanceToPreflop();
      this.log.info({ handId: state.currentHandId.toString(), tx: hash }, "Advanced to preflop");
    } catch (error) {
      const errorMsg = String(error);
      if (!errorMsg.includes("HC") && !errorMsg.includes("MC")) {
        throw error;
      }
      if (errorMsg.includes("MC")) {
        return;
      }
    }

    this.commitSyncedHands.add(state.currentHandId);
    // Prune entries to keep only the last 100 hand IDs to prevent unbounded growth
    if (this.commitSyncedHands.size > 100) {
      const oldest = this.commitSyncedHands.values().next().value;
      if (oldest !== undefined) this.commitSyncedHands.delete(oldest);
    }
  }

  private async checkAndRevealHoleCards(handId: bigint): Promise<void> {
    if (!this.hasDealerIntegration() || this.tableId === null) {
      return;
    }

    let commitments: Array<{ seatIndex: number; commitment: `0x${string}` }>;
    try {
      commitments = await this.dealerCircuit.execute(() => this.getDealerCommitments(handId));
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
        reveal = await this.dealerCircuit.execute(() => this.getDealerReveal(handId, seatIndex));
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          return;
        }
        this.log.error(
          { err: error, handId: handId.toString(), seatIndex },
          "Failed to get dealer reveal",
        );
        this.stats.apiErrors++;
        continue;
      }
      try {
        const hash = await this.chainClient.revealHoleCards(
          handId,
          seatIndex,
          reveal.cards[0],
          reveal.cards[1],
          reveal.salt,
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
    handId: bigint,
  ): Promise<Array<{ seatIndex: number; commitment: `0x${string}` }>> {
    const baseUrl = this.config.ownerviewUrl!.replace(/\/$/, "");
    const tableId = this.tableId!.toString();
    const handIdStr = handId.toString();
    const authHeader = { Authorization: `Bearer ${this.config.dealerApiKey!}` };

    // Only POST /dealer/deal for hands that haven't been dealt yet
    if (!this.dealtHands.has(handId)) {
      const vrfRandomness = await this.chainClient.getHoleCardVrfRandomness(handId);
      if (vrfRandomness === 0n) {
        return [];
      }

      const maxSeats = await this.chainClient.getMaxSeats();
      const seatOwners: Record<string, `0x${string}`> = {};
      for (let seatIndex = 0; seatIndex < maxSeats; seatIndex++) {
        const seat = await this.chainClient.getSeat(seatIndex);
        if (seat.owner.toLowerCase() === "0x0000000000000000000000000000000000000000") {
          continue;
        }
        seatOwners[String(seatIndex)] = seat.owner;
      }

      if (Object.keys(seatOwners).length === 0) {
        return [];
      }

      const dealRes = await fetchWithTimeout(
        `${baseUrl}/dealer/deal`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeader },
          body: JSON.stringify({
            tableId,
            handId: handIdStr,
            vrfRandomness: vrfRandomness.toString(),
            seatOwners,
          }),
        },
        DEFAULT_REQUEST_TIMEOUT_MS,
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
      DEFAULT_REQUEST_TIMEOUT_MS,
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
    seatIndex: number,
  ): Promise<{ cards: [number, number]; salt: `0x${string}` }> {
    const baseUrl = this.config.ownerviewUrl!.replace(/\/$/, "");
    const tableId = this.tableId!.toString();
    const handIdStr = handId.toString();
    const authHeader = { Authorization: `Bearer ${this.config.dealerApiKey!}` };

    const res = await fetchWithTimeout(
      `${baseUrl}/dealer/reveal?tableId=${encodeURIComponent(tableId)}&handId=${encodeURIComponent(handIdStr)}&seatIndex=${seatIndex}`,
      { headers: authHeader },
      DEFAULT_REQUEST_TIMEOUT_MS,
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
    this.log.info(
      { context, reason: String(error).split("\n")[0] },
      "Coordination skip — another keeper acted first",
    );
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
   * C-1: Auto buy-in for evicted agents.
   * Detects seats where the keeper wallet is the operator and the stack is below
   * the configured threshold. Calls approve + registerSeat to re-register.
   * Only active when autoRefillEnabled=true and autoRefillBuyInAmount is set.
   */
  private async checkAndAutoRefill(): Promise<void> {
    if (!this.config.autoRefillEnabled) return;
    const buyInAmount = this.config.autoRefillBuyInAmount;
    if (!buyInAmount) return;

    const minStack = this.config.autoRefillMinStack ?? 0n;

    let maxSeats: number;
    try {
      maxSeats = await this.chainClient.getMaxSeats();
    } catch {
      return; // non-fatal
    }

    // Ensure chipToken address is cached
    if (!this.chipTokenCache) {
      try {
        const tokenAddr =
          this.config.autoRefillTokenAddress ?? (await this.chainClient.getChipToken());
        this.chipTokenCache = tokenAddr;
      } catch {
        return;
      }
    }
    const tokenAddress = this.chipTokenCache;

    for (let seatIndex = 0; seatIndex < maxSeats; seatIndex++) {
      let seat;
      try {
        seat = await this.chainClient.getSeat(seatIndex);
      } catch {
        continue;
      }

      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
      const ownerIsZero = seat.owner.toLowerCase() === ZERO_ADDRESS;
      if (ownerIsZero) continue; // never-registered seat, skip

      const needsRefill = !seat.isActive && seat.stack <= minStack;
      if (!needsRefill) continue;

      const keeperIsOperator =
        seat.operator.toLowerCase() === this.chainClient.address.toLowerCase();
      if (!keeperIsOperator) {
        this.log.debug(
          { seatIndex, operator: seat.operator },
          "Auto-refill: seat needs refill but keeper is not operator, skipping",
        );
        continue;
      }

      if (this.refilledSeats.has(seatIndex)) continue;
      this.refilledSeats.add(seatIndex);

      this.log.info(
        { seatIndex, owner: seat.owner, stack: seat.stack.toString() },
        "Auto-refill: seat evicted, attempting re-registration",
      );

      try {
        const approveHash = await this.chainClient.approveChipToken(tokenAddress, buyInAmount);
        this.log.info({ seatIndex, tx: approveHash }, "Auto-refill: approved token spend");

        const registerHash = await this.chainClient.registerSeat(
          seatIndex,
          seat.owner,
          this.chainClient.address,
          buyInAmount,
        );
        this.stats.autoRefillsTriggered++;
        this.recordAction("autoRefill");
        this.log.info(
          { seatIndex, owner: seat.owner, buyIn: buyInAmount.toString(), tx: registerHash },
          "Auto-refill: seat re-registered",
        );

        // Allow re-refill in a future session if evicted again
        this.refilledSeats.delete(seatIndex);
      } catch (error) {
        this.log.warn(
          { err: error, seatIndex },
          "Auto-refill: failed to re-register seat (non-fatal)",
        );
        // Don't delete from refilledSeats — retry next process restart
      }
    }
  }

  /**
   * T-1201: Settle side bets on SideBetPool after hand settlement.
   * Called once per settled hand; uses sideBetSettledHands Set to prevent duplicates.
   */
  private async checkAndTriggerSideBetSettlement(state: TableState): Promise<void> {
    if (!this.config.sideBetPoolAddress) return;
    if (state.gameState !== GameState.SETTLED && state.gameState !== GameState.WAITING_FOR_SEATS)
      return;
    if (state.currentHandId === 0n) return;
    if (this.sideBetSettledHands.has(state.currentHandId)) return;

    this.sideBetSettledHands.add(state.currentHandId);
    if (this.sideBetSettledHands.size > 200) {
      const oldest = this.sideBetSettledHands.values().next().value;
      if (oldest !== undefined) this.sideBetSettledHands.delete(oldest);
    }

    try {
      const hash = await this.chainClient.settleSideBets(
        this.config.sideBetPoolAddress as `0x${string}`,
        state.currentHandId,
      );
      this.log.info({ handId: state.currentHandId.toString(), tx: hash }, "Side bets settled");
    } catch (error) {
      const msg = String(error).toLowerCase();
      if (msg.includes("pool does not exist") || msg.includes("pool already settled")) {
        this.log.debug({ handId: state.currentHandId.toString() }, "No side bet pool to settle");
      } else {
        this.log.warn(
          { err: error, handId: state.currentHandId.toString() },
          "Failed to settle side bets (non-fatal)",
        );
      }
    }
  }

  /**
   * T-R3-03: Trigger vault rebalancing after hand settlement.
   * Only runs when a vault address is configured and the hand is newly settled.
   * Respects the contract-enforced randomized delay (rebalanceEligibleBlock) and
   * size limits (rebalanceMaxMonBps / rebalanceMaxTokenBps).
   */
  private async checkAndTriggerRebalancing(state: TableState, currentBlock: bigint): Promise<void> {
    if (!this.chainClient.hasVault()) return;
    if (state.gameState !== GameState.SETTLED && state.gameState !== GameState.WAITING_FOR_SEATS)
      return;
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
      if (
        status.currentHandId === state.currentHandId &&
        status.lastRebalancedHandId === state.currentHandId
      ) {
        this.rebalancedHands.add(state.currentHandId);
      }
      return;
    }

    // Respect the on-chain randomized delay (set by vault after settlement)
    if (currentBlock < status.rebalanceEligibleBlock) {
      this.log.debug(
        {
          blocksRemaining: status.blocksRemaining.toString(),
          eligibleBlock: status.rebalanceEligibleBlock.toString(),
        },
        "Rebalance not yet eligible, waiting for delay",
      );
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

    // AI advisory path (TREASURY_ADVISOR_ENABLED=true)
    if (this.treasuryAdvisor) {
      await this.runAdvisedRebalancing(
        status.currentHandId,
        externalAssets,
        treasuryShares,
        maxMonBps,
        maxTokenBps,
      );
      return;
    }

    // Default rule-based path (unchanged behavior)
    await this.runDefaultRebalancing(
      status.currentHandId,
      externalAssets,
      treasuryShares,
      maxMonBps,
      maxTokenBps,
    );
  }

  /**
   * AI-advised rebalancing: call TreasuryAdvisor.recommend(), then execute.
   * If advisor fails, skip rebalancing (fail-safe).
   */
  private async runAdvisedRebalancing(
    handId: bigint,
    externalAssets: bigint,
    treasuryShares: bigint,
    maxMonBps: bigint,
    maxTokenBps: bigint,
  ): Promise<void> {
    const ctx: RebalanceContext = {
      navPerShare: 0n, // No oracle available in MVP; advisor uses rule-based fallback
      externalAssets,
      treasuryShares,
      outstandingShares: 0n, // Not queried for MVP
      tokenMarketPrice: 0n, // No market price oracle in MVP
      recentPnl: 0n, // Not tracked at keeper level
      cumulativePnl: 0n,
      tokenStage: "bonding", // Default; could be enhanced later
      rebalanceMaxMonBps: Number(maxMonBps),
      rebalanceMaxTokenBps: Number(maxTokenBps),
    };

    let rec;
    try {
      rec = await this.treasuryAdvisor!.recommend(ctx);
    } catch (err) {
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "TreasuryAdvisor error — skipping rebalancing (fail-safe)",
      );
      return;
    }

    this.log.info(
      {
        action: rec.action,
        amountBps: rec.amountBps,
        confidence: rec.confidence,
        reasoning: rec.reasoning,
      },
      "AI treasury recommendation",
    );

    if (rec.action === "skip" || rec.amountBps === 0) {
      this.log.info(
        { handId: handId.toString(), reasoning: rec.reasoning },
        "TreasuryAdvisor: skip rebalancing",
      );
      return;
    }

    if (rec.action === "buy" && externalAssets > 0n && maxMonBps > 0n) {
      const cappedBps = BigInt(Math.min(rec.amountBps, Number(maxMonBps)));
      const monAmount = (externalAssets * cappedBps) / 10000n;
      if (monAmount > 0n) {
        try {
          await this.coordinationJitter();
          const hash = await this.chainClient.rebalanceBuy(handId, monAmount, 0n);
          this.stats.rebalancesTriggered++;
          this.recordAction("rebalanceBuy");
          this.log.info(
            {
              tx: hash,
              monAmount: monAmount.toString(),
              handId: handId.toString(),
              reasoning: rec.reasoning,
            },
            "AI-advised Vault rebalanceBuy triggered",
          );
          this.submitTreasuryReasoning(handId, rec, hash);
        } catch (error) {
          this.log.info(
            { err: String(error).split("\n")[0], handId: handId.toString() },
            "AI-advised rebalanceBuy failed (accretive constraint or error)",
          );
        }
      }
      return;
    }

    if (rec.action === "sell" && treasuryShares > 0n && maxTokenBps > 0n) {
      const cappedBps = BigInt(Math.min(rec.amountBps, Number(maxTokenBps)));
      const tokenAmount = (treasuryShares * cappedBps) / 10000n;
      if (tokenAmount > 0n) {
        try {
          await this.coordinationJitter();
          const hash = await this.chainClient.rebalanceSell(handId, tokenAmount, 0n);
          this.stats.rebalancesTriggered++;
          this.recordAction("rebalanceSell");
          this.log.info(
            {
              tx: hash,
              tokenAmount: tokenAmount.toString(),
              handId: handId.toString(),
              reasoning: rec.reasoning,
            },
            "AI-advised Vault rebalanceSell triggered",
          );
          this.submitTreasuryReasoning(handId, rec, hash);
        } catch (error) {
          this.log.info(
            { err: String(error).split("\n")[0], handId: handId.toString() },
            "AI-advised rebalanceSell failed (accretive constraint or error)",
          );
        }
      }
    }
  }

  /** Fire-and-forget: POST treasury reasoning to OwnerView (non-blocking). */
  private submitTreasuryReasoning(
    handId: bigint,
    rec: RebalanceRecommendation,
    txHash?: string,
  ): void {
    if (!this.config.ownerviewUrl || !this.config.vaultAddress) return;
    const url = `${this.config.ownerviewUrl.replace(/\/$/, "")}/treasury-reasoning`;
    const body = JSON.stringify({
      vaultAddress: this.config.vaultAddress,
      handId: handId.toString(),
      action: rec.action,
      amountBps: rec.amountBps,
      reasoning: rec.reasoning,
      confidence: rec.confidence,
      factors: rec.factors,
      txHash,
    });
    fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      },
      DEFAULT_REQUEST_TIMEOUT_MS,
    ).catch((err: unknown) => {
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Failed to submit treasury reasoning (non-fatal)",
      );
    });
  }

  /**
   * Default rule-based rebalancing (original logic, unchanged).
   */
  private async runDefaultRebalancing(
    handId: bigint,
    externalAssets: bigint,
    treasuryShares: bigint,
    maxMonBps: bigint,
    maxTokenBps: bigint,
  ): Promise<void> {
    // Try rebalanceBuy first (uses external assets to buy treasury shares)
    if (externalAssets > 0n && maxMonBps > 0n) {
      const monAmount = (externalAssets * maxMonBps) / 10000n;
      if (monAmount > 0n) {
        try {
          await this.coordinationJitter();
          const hash = await this.chainClient.rebalanceBuy(handId, monAmount, 0n);
          this.stats.rebalancesTriggered++;
          this.recordAction("rebalanceBuy");
          this.log.info(
            { tx: hash, monAmount: monAmount.toString(), handId: handId.toString() },
            "Vault rebalanceBuy triggered",
          );
          return;
        } catch (error) {
          // Accretive constraint not satisfied (price too high) or other error — try sell
          this.log.info(
            { err: String(error).split("\n")[0], handId: handId.toString() },
            "rebalanceBuy skipped (accretive constraint or error), trying sell",
          );
        }
      }
    }

    // Try rebalanceSell (sells treasury shares for external assets)
    if (treasuryShares > 0n && maxTokenBps > 0n) {
      const tokenAmount = (treasuryShares * maxTokenBps) / 10000n;
      if (tokenAmount > 0n) {
        try {
          await this.coordinationJitter();
          const hash = await this.chainClient.rebalanceSell(handId, tokenAmount, 0n);
          this.stats.rebalancesTriggered++;
          this.recordAction("rebalanceSell");
          this.log.info(
            { tx: hash, tokenAmount: tokenAmount.toString(), handId: handId.toString() },
            "Vault rebalanceSell triggered",
          );
        } catch (error) {
          this.log.info(
            { err: String(error).split("\n")[0], handId: handId.toString() },
            "rebalanceSell skipped (accretive constraint or error)",
          );
        }
      }
    }
  }
}
