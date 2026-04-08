// Main Agent Bot implementation

import { ChainClient, GameState, type TableState } from "./chain/client.js";
import { OwnerViewClient, type HoleCardsResponse } from "./auth/ownerviewClient.js";
import { SimpleStrategy, type Strategy, Decision, type DecisionContext, type HoleCards } from "./strategy/index.js";
import { signMessage } from "viem/accounts";
import { keccak256, encodeAbiParameters, createWalletClient, http } from "viem";
import type { Chain } from "viem";
import { deriveEncryptionKeyPair } from "./auth/encryptionKey.js";
import { CircuitBreaker, CircuitOpenError, createLogger, PLAYER_REGISTRY_ABI } from "@playerco/shared";
import type { VectorStore } from "./rag/vectorStore.js";
import { embedHand } from "./rag/embedder.js";
import type { HandSummary } from "./rag/types.js";
import { randomBytes } from "node:crypto";

const logger = createLogger({ service: "agent-bot" });

export interface AgentBotConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  pokerTableAddress: `0x${string}`;
  ownerviewUrl: string;
  chainId?: number;
  pollIntervalMs?: number;
  turnActionDelayMs?: number;
  strategy?: Strategy;
  vectorStore?: VectorStore;
  /** PlayerRegistry contract address for on-chain strategy registration. */
  playerRegistryAddress?: `0x${string}`;
}

export interface BotStats {
  handsPlayed: number;
  handsWon: number;
  totalProfit: bigint;
  actionsSubmitted: number;
  errors: number;
  /** Breakdown of error categories for observability. */
  rpcErrors: number;
  apiErrors: number;
  txErrors: number;
  /** Epoch ms of last successful on-chain action, or 0 if none yet. */
  lastActionTime: number;
}

export class AgentBot {
  private chainClient: ChainClient;
  private ownerviewClient: OwnerViewClient | null = null;
  private strategy: Strategy;
  private config: AgentBotConfig;
  private running: boolean = false;
  private stats: BotStats = {
    handsPlayed: 0,
    handsWon: 0,
    totalProfit: 0n,
    actionsSubmitted: 0,
    errors: 0,
    rpcErrors: 0,
    apiErrors: 0,
    txErrors: 0,
    lastActionTime: 0,
  };

  // Circuit breakers for external services
  private ownerViewCircuit = new CircuitBreaker({ name: "OwnerView", failureThreshold: 5, recoveryTimeoutMs: 30_000 });
  private rpcCircuit = new CircuitBreaker({ name: "RPC", failureThreshold: 5, recoveryTimeoutMs: 30_000 });

  // RAG: per-hand tracking for VectorStore recording
  private vectorStore: VectorStore | undefined;
  private currentHandActions: string[] = [];
  private currentHandOpponentActions: string[] = [];
  private currentHandHoleCards: string = "unknown";
  private currentHandReasoning: string | undefined = undefined;
  private currentHandCommunityCards: string = "";
  private currentHandPosition: string = "unknown";

  // T-R3-02: Escalating logging for persistent hole card failures
  /** Whether we've already emitted the first circuit-open WARN (suppresses duplicates). */
  private circuitOpenWarnLogged: boolean = false;
  /** Number of consecutive hands where hole cards could not be fetched (circuit open). */
  private consecutiveCircuitOpenHands: number = 0;
  /** Number of consecutive circuit-open hands after which we escalate to CRITICAL. */
  private static readonly FOLD_ONLY_THRESHOLD = 10;
  /** Log CRITICAL every this many cumulative apiErrors. */
  private static readonly CRITICAL_API_ERROR_INTERVAL = 10;

  // AI Decision Commitment: tracks the last committed decision awaiting on-chain reveal
  private pendingReveal: {
    handId: bigint;
    seatIndex: number;
    action: string;
    reasoning: string;
    salt: `0x${string}`;
  } | null = null;
  private lastRevealedHandId: bigint = 0n;

  // Track last known hand for detecting new hands
  private lastHandId: bigint = 0n;
  private lastStack: bigint | null = null;
  private mySeatIndex: number | null = null;
  private waitingTurnKey: string | null = null;
  private currentBackoffMs: number = 0;
  private encryptionPrivKey: Uint8Array | null = null;
  // 'unregistered' → 'registering' → 'registered' prevents double-registration
  // when consecutive ticks overlap while a tx is in-flight.
  private encryptionKeyState: "unregistered" | "registering" | "registered" = "unregistered";
  /** Timestamp (ms) when we entered 'registering' state; used to detect stuck registration. */
  private encryptionKeyRegistrationStartedAt: number | null = null;
  private static readonly ENCRYPTION_KEY_REGISTRATION_TIMEOUT_MS = 2 * 60_000; // 2 minutes

  constructor(config: AgentBotConfig) {
    this.config = config;
    this.chainClient = new ChainClient({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      pokerTableAddress: config.pokerTableAddress,
      chainId: config.chainId,
    });

    this.strategy = config.strategy || new SimpleStrategy(0.3);
    this.vectorStore = config.vectorStore;

    // Setup OwnerView client if URL provided
    if (config.ownerviewUrl) {
      this.ownerviewClient = new OwnerViewClient({
        baseUrl: config.ownerviewUrl,
        address: this.chainClient.address,
        signMessage: async (message: string) => {
          return signMessage({
            message,
            privateKey: config.privateKey,
          });
        },
      });
    }
  }

  get address() {
    return this.chainClient.address;
  }

  getStats(): BotStats {
    return { ...this.stats };
  }

  getRpcCircuitState(): string {
    return this.rpcCircuit.circuitState;
  }

  getOwnerViewCircuitState(): string {
    return this.ownerViewCircuit.circuitState;
  }

  getVectorStoreSize(): number {
    return this.vectorStore?.size ?? 0;
  }

  /**
   * T-1102: Register current strategy on the PlayerRegistry contract.
   * Called at startup and after each evolution update.
   * Fails silently — must not block game play.
   */
  async registerStrategyOnChain(overrideParams?: { aggressionBps: number; tightnessBps: number; bluffFreqBps: number; personaId: string }): Promise<void> {
    const registryAddress = this.config.playerRegistryAddress;
    if (!registryAddress) return;

    const strat = this.strategy as unknown as { persona?: { id: string; aggression: number; tightness: number; bluffFrequency: number } };
    const persona = strat.persona;
    const personaId = overrideParams?.personaId ?? persona?.id ?? "unknown";
    const aggressionBps = overrideParams?.aggressionBps ?? Math.round((persona?.aggression ?? 0.5) * 10000);
    const tightnessBps = overrideParams?.tightnessBps ?? Math.round((persona?.tightness ?? 0.5) * 10000);
    const bluffFreqBps = overrideParams?.bluffFreqBps ?? Math.round((persona?.bluffFrequency ?? 0.3) * 10000);

    const configData = JSON.stringify({ personaId, aggressionBps, tightnessBps, bluffFreqBps });
    const configHash = keccak256(new TextEncoder().encode(configData) as unknown as `0x${string}`);

    const chain: Chain = {
      id: this.config.chainId || 133,
      name: "HashKey Chain Testnet",
      nativeCurrency: { name: "HashKey", symbol: "HSK", decimals: 18 },
      rpcUrls: { default: { http: [this.config.rpcUrl] } },
    };

    const account = (await import("viem/accounts")).privateKeyToAccount(this.config.privateKey);
    const walletClient = createWalletClient({ account, chain, transport: http(this.config.rpcUrl) });

    await walletClient.writeContract({
      address: registryAddress,
      abi: PLAYER_REGISTRY_ABI,
      functionName: "updateStrategy",
      args: [
        account.address,
        configHash as `0x${string}`,
        personaId,
        aggressionBps,
        tightnessBps,
        bluffFreqBps,
      ],
    });

    logger.info({ personaId, aggressionBps, tightnessBps, bluffFreqBps }, "Strategy registered on-chain");
  }

  /**
   * Run the bot for a specified number of hands (or indefinitely if 0)
   */
  async run(maxHands: number = 0): Promise<void> {
    this.running = true;
    const pollInterval = Math.max(200, this.config.pollIntervalMs || 1000);
    this.currentBackoffMs = pollInterval;

    logger.info({ address: this.address, table: this.config.pokerTableAddress, maxHands: maxHands || "unlimited" }, "AgentBot starting");

    // Authenticate with OwnerView if available
    if (this.ownerviewClient) {
      try {
        await this.ownerviewClient.authenticate();
        logger.info("Authenticated with OwnerView service");
      } catch (error) {
        logger.warn({ error }, "Failed to authenticate with OwnerView");
      }
    }

    // Derive encryption key pair (once per run) and inject into ownerviewClient
    try {
      const { privKey } = await deriveEncryptionKeyPair(this.config.privateKey);
      this.encryptionPrivKey = privKey;
      logger.info("Encryption key pair derived");
      if (this.ownerviewClient) {
        this.ownerviewClient.setEncryptionPrivKey(privKey);
      }
    } catch (error) {
      logger.warn({ error }, "Failed to derive encryption key pair");
    }

    // Register current strategy on-chain (T-1102)
    await this.registerStrategyOnChain().catch((err: unknown) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Strategy on-chain registration failed (non-fatal)");
    });

    while (this.running) {
      try {
        await this.rpcCircuit.execute(() => this.tick());
        this.currentBackoffMs = pollInterval;

        // Check if we've reached max hands
        if (maxHands > 0 && this.stats.handsPlayed >= maxHands) {
          logger.info({ maxHands }, "Reached max hands, stopping");
          break;
        }
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          logger.warn({ circuit: "RPC" }, "RPC circuit open — skipping tick");
          await this.sleep(this.currentBackoffMs);
          continue;
        }
        logger.error({ error }, "Error in tick");
        this.stats.errors++;
        if (this.isRateLimitError(error)) {
          this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, 15000);
          logger.warn({ backoffMs: this.currentBackoffMs }, "RPC rate-limited, backing off");
        }
      }

      await this.sleep(this.currentBackoffMs);
    }

    logger.info({ stats: { ...this.stats, totalProfit: this.stats.totalProfit.toString() } }, "AgentBot stopped");
  }

  /**
   * Stop the bot
   */
  stop(): void {
    this.running = false;
  }

  /**
   * T-R3-01: Recover from a stuck 'registering' state.
   * If we've been in 'registering' for > 2 minutes, check on-chain.
   * On-chain registered → advance to 'registered'; otherwise roll back to 'unregistered'.
   */
  private async recoverStuckRegistration(): Promise<void> {
    if (
      this.encryptionKeyState !== "registering" ||
      this.encryptionKeyRegistrationStartedAt === null ||
      Date.now() - this.encryptionKeyRegistrationStartedAt < AgentBot.ENCRYPTION_KEY_REGISTRATION_TIMEOUT_MS
    ) {
      return;
    }

    if (this.mySeatIndex === null || !this.encryptionPrivKey) {
      this.encryptionKeyState = "unregistered";
      this.encryptionKeyRegistrationStartedAt = null;
      return;
    }

    try {
      const { secp256k1 } = await import("@noble/curves/secp256k1.js");
      const pubKey = secp256k1.getPublicKey(this.encryptionPrivKey, true);
      const alreadyRegistered = await this.chainClient.registerEncryptionKey(this.mySeatIndex, pubKey);
      // null return means "same key already on-chain" → treat as registered
      this.encryptionKeyState = "registered";
      this.encryptionKeyRegistrationStartedAt = null;
      logger.info({ status: alreadyRegistered === null ? "already set" : alreadyRegistered }, "Recovered from stuck encryption key registration");
    } catch (error) {
      logger.warn({ error }, "Stuck registration recovery failed, rolling back to unregistered");
      this.encryptionKeyState = "unregistered";
      this.encryptionKeyRegistrationStartedAt = null;
    }
  }

  /**
   * Single tick of the bot loop
   */
  private async tick(): Promise<void> {
    // Recover from a stuck encryption key registration if it has timed out
    await this.recoverStuckRegistration();

    // Get current table state
    const state = await this.chainClient.getTableState(this.mySeatIndex);

    // Find our seat
    if (this.mySeatIndex === null) {
      this.mySeatIndex = this.chainClient.findMySeat(state);
      if (this.mySeatIndex !== null) {
        logger.info({ seatIndex: this.mySeatIndex }, "Found my seat");
        this.lastStack = state.seats[this.mySeatIndex].stack;

        // Auto-register encryption key on-chain (once per session).
        // Guard with 'registering' state to prevent double-submission if a
        // subsequent tick fires while the registration tx is in-flight.
        if (this.encryptionKeyState === "unregistered" && this.encryptionPrivKey) {
          this.encryptionKeyState = "registering";
          const { secp256k1 } = await import("@noble/curves/secp256k1.js");
          const pubKey = secp256k1.getPublicKey(this.encryptionPrivKey, true);
          try {
            // registerEncryptionKey already does an on-chain read and skips
            // if the same key is already set (returns null).
            const txHash = await this.chainClient.registerEncryptionKey(this.mySeatIndex, pubKey);
            if (txHash) {
              logger.info({ txHash }, "Encryption key registered on-chain");
            } else {
              logger.info("Encryption key already registered on-chain, skipping");
            }
            this.encryptionKeyState = "registered";
          } catch (error) {
            // Roll back to unregistered so the next tick can retry.
            this.encryptionKeyState = "unregistered";
            logger.warn({ error }, "Failed to register encryption key");
          }
        }
      }
    }

    if (this.mySeatIndex === null) {
      // Not seated, nothing to do
      return;
    }

    // Track hand changes for stats
    if (state.currentHandId > this.lastHandId) {
      if (this.lastHandId > 0n) {
        // Hand ended, update stats
        this.stats.handsPlayed++;
        const currentStack = state.seats[this.mySeatIndex].stack;
        let profit = 0n;
        if (this.lastStack !== null) {
          profit = currentStack - this.lastStack;
          this.stats.totalProfit += profit;
          if (profit > 0n) {
            this.stats.handsWon++;
          }
        }
        this.lastStack = currentStack;
        logger.info({ handId: String(this.lastHandId), handsPlayed: this.stats.handsPlayed, handsWon: this.stats.handsWon }, "Hand complete");

        // Record hand to VectorStore for RAG
        if (this.vectorStore && this.currentHandActions.length > 0) {
          try {
            const result: "won" | "lost" | "split" = profit > 0n ? "won" : profit === 0n ? "split" : "lost";
            const summary: HandSummary = {
              handId: String(this.lastHandId),
              position: this.currentHandPosition,
              holeCards: this.currentHandHoleCards,
              communityCards: this.currentHandCommunityCards,
              actions: [...this.currentHandActions],
              result,
              pnl: profit,
              boardTexture: inferBoardTexture(this.currentHandCommunityCards),
              opponentActions: [...this.currentHandOpponentActions],
              reasoning: this.currentHandReasoning,
            };
            const embedding = embedHand(summary);
            this.vectorStore.add({ handId: summary.handId, summary, embedding });
            logger.debug({ handId: summary.handId, result, ragSize: this.vectorStore.size }, "Hand recorded to VectorStore");
            // Persist async (non-blocking)
            this.vectorStore.persist().catch((err: unknown) => {
              logger.warn({ err: err instanceof Error ? err.message : String(err) }, "VectorStore persist failed (non-fatal)");
            });
          } catch (err) {
            logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Failed to record hand to VectorStore (non-fatal)");
          }
        }
        // Reset per-hand tracking
        this.currentHandActions = [];
        this.currentHandOpponentActions = [];
        this.currentHandHoleCards = "unknown";
        this.currentHandReasoning = undefined;
        this.currentHandCommunityCards = "";
        this.currentHandPosition = "unknown";
      }
      this.lastHandId = state.currentHandId;
    }

    // Handle different game states
    if (state.gameState === GameState.SETTLED || state.gameState === GameState.WAITING_FOR_SEATS) {
      // Reveal pending AI decision commitment while hand is still SETTLED
      if (
        state.gameState === GameState.SETTLED &&
        this.pendingReveal &&
        this.pendingReveal.handId === state.currentHandId &&
        this.pendingReveal.handId > this.lastRevealedHandId
      ) {
        const rev = this.pendingReveal;
        this.lastRevealedHandId = rev.handId;
        this.chainClient
          .revealDecision(rev.handId, rev.seatIndex, rev.action, rev.reasoning, rev.salt)
          .then((txHash) => {
            logger.info({ handId: String(rev.handId), seatIndex: rev.seatIndex, txHash }, "AI decision revealed on-chain");
          })
          .catch((err: unknown) => {
            logger.warn({ err: err instanceof Error ? err.message : String(err), handId: String(rev.handId) }, "Failed to reveal AI decision (non-fatal)");
          });
      }
      // Try to start a new hand if settled
      if (state.gameState === GameState.SETTLED) {
        try {
          logger.debug("Attempting to start new hand");
          await this.chainClient.startHand();
          logger.info("Started new hand");
        } catch (error) {
          // Another player might have started, or conditions not met
          // This is expected behavior, not an error
        }
      }
      return;
    }

    // Check if it's our turn
    if (!this.chainClient.isBettingState(state.gameState)) {
      // Not in betting state (waiting for VRF or showdown)
      return;
    }

    if (state.hand.actorSeat !== this.mySeatIndex) {
      // Not our turn
      this.waitingTurnKey = null;
      return;
    }

    // Enforce per-turn action delay: act only after N ms from turn start.
    const turnActionDelayMs = this.config.turnActionDelayMs || 0;
    if (turnActionDelayMs > 0) {
      const nowTs = await this.chainClient.getBlockTimestamp();
      const delaySec = BigInt(Math.floor(turnActionDelayMs / 1000));
      const turnStartTs = state.actionDeadline - state.actionTimeout;
      const actionEligibleAt = turnStartTs + delaySec;

      if (nowTs < actionEligibleAt) {
        const turnKey = `${state.currentHandId}:${state.gameState}:${state.hand.actorSeat}:${state.lastActionBlock}`;
        if (this.waitingTurnKey !== turnKey) {
          this.waitingTurnKey = turnKey;
          logger.info({ turnActionDelayMs, eligibleAt: String(actionEligibleAt) }, "My turn started, waiting before action");
        }
        return;
      }
      this.waitingTurnKey = null;
    }

    // Check one-action-per-block
    const currentBlock = await this.chainClient.getBlockNumber();
    if (currentBlock <= state.lastActionBlock) {
      // Must wait for next block
      return;
    }

    // It's our turn - decide and act
    await this.submitAction(state);
  }

  /**
   * Decide and submit an action
   */
  private async submitAction(state: TableState): Promise<void> {
    const seatIndex = this.mySeatIndex!;

    // Get hole cards if available, guarded by circuit breaker
    let holeCards: HoleCards | null = null;
    if (this.ownerviewClient) {
      try {
        const response = await this.ownerViewCircuit.execute(() =>
          this.ownerviewClient!.getHoleCards(
            String(state.tableId),
            String(state.currentHandId)
          )
        );
        if (response.holeCards && response.holeCards.length >= 2) {
          holeCards = {
            card1: response.holeCards[0].card,
            card2: response.holeCards[1].card,
          };
        }
        // T-R3-02: Reset circuit-open tracking on successful fetch
        if (this.consecutiveCircuitOpenHands > 0) {
          logger.info("OwnerView recovered — resuming informed play");
        }
        this.consecutiveCircuitOpenHands = 0;
        this.circuitOpenWarnLogged = false;
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          // T-R3-02: Log WARN on first open; escalate to CRITICAL after sustained outage.
          this.consecutiveCircuitOpenHands++;
          if (!this.circuitOpenWarnLogged) {
            logger.warn("OwnerView circuit breaker is OPEN — playing blind (no hole cards)");
            this.circuitOpenWarnLogged = true;
          }
          if (this.consecutiveCircuitOpenHands >= AgentBot.FOLD_ONLY_THRESHOLD) {
            logger.error(
              { consecutiveHands: this.consecutiveCircuitOpenHands },
              "CRITICAL: OwnerView has been unavailable for extended period; playing blind"
            );
          }
        } else {
          // Hole card failure is non-fatal: bot can still play with heuristics.
          logger.error({ error }, "Failed to get hole cards (playing without)");
          this.stats.apiErrors++;
          // Escalate every CRITICAL_API_ERROR_INTERVAL cumulative errors
          if (this.stats.apiErrors % AgentBot.CRITICAL_API_ERROR_INTERVAL === 0) {
            logger.error({ apiErrors: this.stats.apiErrors }, "CRITICAL: cumulative hole card API errors; OwnerView may be degraded");
          }
        }
      }
    }

    // Get action parameters
    const canCheck = await this.chainClient.canCheck(seatIndex);
    const amountToCall = await this.chainClient.getAmountToCall(seatIndex);

    // Build decision context
    const context: DecisionContext = {
      tableState: state,
      mySeatIndex: seatIndex,
      holeCards,
      canCheck,
      amountToCall,
    };

    // Track position for RAG
    if (this.mySeatIndex !== null) {
      this.currentHandPosition = describePositionSimple(this.mySeatIndex, state.buttonSeat, state.seats.length);
    }
    // Track hole cards for RAG
    if (holeCards) {
      this.currentHandHoleCards = formatHoleCardsSimple(holeCards);
    }
    // Track community cards for RAG
    const commCards = state.communityCards.filter((c: number) => c !== 255).map(formatCardSimple).join(" ");
    if (commCards) {
      this.currentHandCommunityCards = commCards;
    }

    // Get decision from strategy
    const decision = await this.strategy.decide(context);
    logger.info(
      {
        handId: String(state.currentHandId),
        action: decision.action,
        raiseAmount: decision.raiseAmount ? String(decision.raiseAmount) : undefined,
        hasReasoning: !!decision.reasoning,
      },
      "Deciding action"
    );

    if (decision.reasoning) {
      logger.debug({ reasoning: decision.reasoning }, "AI reasoning");
      this.currentHandReasoning = decision.reasoning;
    }

    // Generate AI decision commitment (fire-and-forget, pre-action)
    const actionStr = decision.raiseAmount ? `raise ${String(decision.raiseAmount)}` : decision.action;
    const reasoning = decision.reasoning ?? "";
    const salt = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
    const commitHash = keccak256(
      encodeAbiParameters(
        [
          { name: "handId", type: "uint256" },
          { name: "seatIndex", type: "uint8" },
          { name: "action", type: "string" },
          { name: "reasoning", type: "string" },
          { name: "salt", type: "bytes32" },
        ],
        [state.currentHandId, seatIndex, actionStr, reasoning, salt]
      )
    );
    this.chainClient.commitDecision(seatIndex, commitHash).then((txHash) => {
      logger.debug({ handId: String(state.currentHandId), seatIndex, txHash }, "AI decision committed on-chain");
      // Store for later reveal (overwrites any prior commitment for this hand)
      this.pendingReveal = { handId: state.currentHandId, seatIndex, action: actionStr, reasoning, salt };
    }).catch((err: unknown) => {
      logger.debug({ err: err instanceof Error ? err.message : String(err) }, "commitDecision failed (non-fatal)");
    });

    // Submit action
    let txHash: string | undefined;
    try {
      switch (decision.action) {
        case Decision.FOLD:
          txHash = await this.chainClient.fold(seatIndex);
          break;
        case Decision.CHECK:
          txHash = await this.chainClient.check(seatIndex);
          break;
        case Decision.CALL:
          txHash = await this.chainClient.call(seatIndex);
          break;
        case Decision.RAISE:
          txHash = await this.chainClient.raise(seatIndex, decision.raiseAmount!);
          break;
      }
      this.stats.actionsSubmitted++;
      this.stats.lastActionTime = Date.now();
      logger.info({ action: decision.action, txHash }, "Action submitted successfully");
      // Track action for RAG recording (actionStr already computed above for commitment)
      this.currentHandActions.push(actionStr);

      // Fire-and-forget: send reasoning to OwnerView (non-blocking)
      if (decision.reasoning && this.ownerviewClient) {
        const reasoningParams = {
          tableAddress: this.config.pokerTableAddress,
          handId: String(state.currentHandId),
          seatIndex,
          txHash,
          action: decision.action,
          raiseAmount: decision.raiseAmount ? String(decision.raiseAmount) : undefined,
          reasoning: decision.reasoning,
          factors: decision.factors,
        };
        this.ownerviewClient.submitReasoning(reasoningParams).catch((err: unknown) => {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Failed to submit reasoning (non-fatal)");
        });
      }
    } catch (error) {
      logger.error({ action: decision.action, error }, "Failed to submit action");
      this.stats.errors++;

      // Fail-safe: try to fold if other actions fail
      if (decision.action !== Decision.FOLD) {
        try {
          logger.info("Fail-safe: attempting fold");
          await this.chainClient.fold(seatIndex);
          this.stats.actionsSubmitted++;
        } catch (foldError) {
          logger.error({ error: foldError }, "Fail-safe fold also failed");
        }
      }
    }
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

// ─── RAG helpers (module-level, no import needed) ─────────────────────────────

const SUIT_SYMBOLS: Record<number, string> = { 0: "c", 1: "d", 2: "h", 3: "s" };
const RANK_SYMBOLS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

function formatCardSimple(card: number): string {
  const rank = RANK_SYMBOLS[card % 13] ?? "?";
  const suit = SUIT_SYMBOLS[Math.floor(card / 13)] ?? "?";
  return `${rank}${suit}`;
}

function formatHoleCardsSimple(holeCards: { card1: number; card2: number }): string {
  return `${formatCardSimple(holeCards.card1)} ${formatCardSimple(holeCards.card2)}`;
}

function describePositionSimple(seatIndex: number, buttonSeat: number, totalSeats: number): string {
  const offset = (seatIndex - buttonSeat + totalSeats) % totalSeats;
  if (offset === 0) return "BTN";
  if (offset === 1) return "SB";
  if (offset === 2) return "BB";
  if (offset === totalSeats - 1) return "CO";
  return "MP";
}

function inferBoardTexture(communityCards: string): string {
  if (!communityCards) return "preflop";
  const cards = communityCards.split(" ").filter(Boolean);
  if (cards.length === 0) return "preflop";
  const suits = cards.map((c) => c[c.length - 1]);
  const uniqueSuits = new Set(suits).size;
  const ranks = cards.map((c) => {
    const r = "23456789TJQKA".indexOf(c[0]);
    return r >= 0 ? r : 0;
  }).sort((a, b) => a - b);
  const gaps = ranks.slice(1).map((r, i) => r - ranks[i]);
  const isConnected = gaps.every((g) => g <= 2);
  if (uniqueSuits === 1) return "flush draw";
  if (uniqueSuits === 2 && cards.length >= 3) return "two tone";
  if (isConnected && cards.length >= 3) return "low connected";
  return "dry rainbow";
}
