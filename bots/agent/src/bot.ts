// Main Agent Bot implementation

import { ChainClient, GameState, type TableState } from "./chain/client.js";
import { OwnerViewClient, type HoleCardsResponse } from "./auth/ownerviewClient.js";
import { SimpleStrategy, type Strategy, Decision, type DecisionContext, type HoleCards } from "./strategy/index.js";
import { signMessage } from "viem/accounts";

export interface AgentBotConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  pokerTableAddress: `0x${string}`;
  ownerviewUrl: string;
  chainId?: number;
  pollIntervalMs?: number;
  turnActionDelayMs?: number;
  strategy?: Strategy;
}

export interface BotStats {
  handsPlayed: number;
  handsWon: number;
  totalProfit: bigint;
  actionsSubmitted: number;
  errors: number;
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
  };

  // Track last known hand for detecting new hands
  private lastHandId: bigint = 0n;
  private lastStack: bigint | null = null;
  private mySeatIndex: number | null = null;
  private waitingTurnKey: string | null = null;

  constructor(config: AgentBotConfig) {
    this.config = config;
    this.chainClient = new ChainClient({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      pokerTableAddress: config.pokerTableAddress,
      chainId: config.chainId,
    });

    this.strategy = config.strategy || new SimpleStrategy(0.3);

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

  /**
   * Run the bot for a specified number of hands (or indefinitely if 0)
   */
  async run(maxHands: number = 0): Promise<void> {
    this.running = true;
    const pollInterval = this.config.pollIntervalMs || 1000;

    console.log(`[AgentBot] Starting bot for address: ${this.address}`);
    console.log(`[AgentBot] Table: ${this.config.pokerTableAddress}`);
    console.log(`[AgentBot] Max hands: ${maxHands || "unlimited"}`);

    // Authenticate with OwnerView if available
    if (this.ownerviewClient) {
      try {
        await this.ownerviewClient.authenticate();
        console.log("[AgentBot] Authenticated with OwnerView service");
      } catch (error) {
        console.warn("[AgentBot] Failed to authenticate with OwnerView:", error);
      }
    }

    while (this.running) {
      try {
        await this.tick();

        // Check if we've reached max hands
        if (maxHands > 0 && this.stats.handsPlayed >= maxHands) {
          console.log(`[AgentBot] Reached ${maxHands} hands, stopping`);
          break;
        }
      } catch (error) {
        console.error("[AgentBot] Error in tick:", error);
        this.stats.errors++;
      }

      await this.sleep(pollInterval);
    }

    console.log("[AgentBot] Bot stopped");
    console.log("[AgentBot] Stats:", {
      ...this.stats,
      totalProfit: this.stats.totalProfit.toString(),
    });
  }

  /**
   * Stop the bot
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Single tick of the bot loop
   */
  private async tick(): Promise<void> {
    // Get current table state
    const state = await this.chainClient.getTableState();

    // Find our seat
    if (this.mySeatIndex === null) {
      this.mySeatIndex = this.chainClient.findMySeat(state);
      if (this.mySeatIndex !== null) {
        console.log(`[AgentBot] Found my seat: ${this.mySeatIndex}`);
        this.lastStack = state.seats[this.mySeatIndex].stack;
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
        if (this.lastStack !== null) {
          const profit = currentStack - this.lastStack;
          this.stats.totalProfit += profit;
          if (profit > 0n) {
            this.stats.handsWon++;
          }
        }
        this.lastStack = currentStack;
        console.log(
          `[AgentBot] Hand ${this.lastHandId} complete. Hands: ${this.stats.handsPlayed}, Won: ${this.stats.handsWon}`
        );
      }
      this.lastHandId = state.currentHandId;
    }

    // Handle different game states
    if (state.gameState === GameState.SETTLED || state.gameState === GameState.WAITING_FOR_SEATS) {
      // Try to start a new hand if settled
      if (state.gameState === GameState.SETTLED) {
        try {
          console.log("[AgentBot] Attempting to start new hand...");
          await this.chainClient.startHand();
          console.log("[AgentBot] Started new hand");
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
          console.log(
            `[AgentBot] My turn started. Waiting ${turnActionDelayMs}ms before action (eligible at ${actionEligibleAt}).`
          );
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

    // Get hole cards if available
    let holeCards: HoleCards | null = null;
    if (this.ownerviewClient) {
      try {
        const response = await this.ownerviewClient.getHoleCards(
          String(state.tableId),
          String(state.currentHandId)
        );
        if (response.holeCards && response.holeCards.length >= 2) {
          holeCards = {
            card1: response.holeCards[0].card,
            card2: response.holeCards[1].card,
          };
        }
      } catch (error) {
        console.warn("[AgentBot] Failed to get hole cards:", error);
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

    // Get decision from strategy
    const decision = await this.strategy.decide(context);
    console.log(
      `[AgentBot] Hand ${state.currentHandId}, deciding: ${decision.action}` +
        (decision.raiseAmount ? ` to ${decision.raiseAmount}` : "")
    );

    // Submit action
    try {
      switch (decision.action) {
        case Decision.FOLD:
          await this.chainClient.fold(seatIndex);
          break;
        case Decision.CHECK:
          await this.chainClient.check(seatIndex);
          break;
        case Decision.CALL:
          await this.chainClient.call(seatIndex);
          break;
        case Decision.RAISE:
          await this.chainClient.raise(seatIndex, decision.raiseAmount!);
          break;
      }
      this.stats.actionsSubmitted++;
      console.log(`[AgentBot] Action ${decision.action} submitted successfully`);
    } catch (error) {
      console.error(`[AgentBot] Failed to submit ${decision.action}:`, error);
      this.stats.errors++;

      // Fail-safe: try to fold if other actions fail
      if (decision.action !== Decision.FOLD) {
        try {
          console.log("[AgentBot] Fail-safe: attempting fold");
          await this.chainClient.fold(seatIndex);
          this.stats.actionsSubmitted++;
        } catch (foldError) {
          console.error("[AgentBot] Fail-safe fold also failed:", foldError);
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
