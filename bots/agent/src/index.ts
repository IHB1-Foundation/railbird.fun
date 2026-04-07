// @playerco/agent-bot - Poker-playing agent bot
// Entry point that reads configuration from environment variables

import { AgentBot } from "./bot.js";
import { GeminiStrategy, SimpleStrategy, type Strategy } from "./strategy/index.js";
import {
  startHealthServer,
  validateChainIdWithRpc,
  validatePrivateKey,
  parsePositiveInt,
  optionalEnv,
  requireEnv,
  createLogger,
} from "@playerco/shared";

const logger = createLogger({ service: "agent-bot" });

const VERSION = "0.0.1";

function parseBoundedFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

type DecisionEngine = "simple" | "gemini";

function parseDecisionEngine(): DecisionEngine {
  const raw = (process.env.AGENT_DECISION_ENGINE || "simple").trim().toLowerCase();
  if (raw === "gemini") {
    return "gemini";
  }
  return "simple";
}

function createStrategy(aggressionFactor: number): {
  strategy: Strategy;
  engine: DecisionEngine;
  geminiModel: string | null;
} {
  const fallback = new SimpleStrategy(aggressionFactor);
  const engine = parseDecisionEngine();

  if (engine !== "gemini") {
    return { strategy: fallback, engine: "simple", geminiModel: null };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn({}, 'AGENT_DECISION_ENGINE=gemini but GEMINI_API_KEY is missing — using simple strategy');
    return { strategy: fallback, engine: "simple", geminiModel: null };
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const temperature = parseBoundedFloat("GEMINI_TEMPERATURE", 0.2);
  const timeoutMs = parsePositiveInt("GEMINI_TIMEOUT_MS", 8000);

  const strategy = new GeminiStrategy({
    apiKey,
    model,
    temperature,
    timeoutMs,
    fallbackStrategy: fallback,
  });

  return { strategy, engine: "gemini", geminiModel: model };
}

async function main() {
  logger.info({ version: VERSION }, 'Agent bot starting');
  const rpcUrl = requireEnv("RPC_URL");
  const defaultTurnActionDelayMs = 0;
  const defaultPollIntervalMs = 1000;
  const aggressionFactor = parseBoundedFloat("AGGRESSION_FACTOR", 0.3);
  const turnActionDelayMs = parsePositiveInt("TURN_ACTION_DELAY_MS", defaultTurnActionDelayMs);
  const { strategy, engine, geminiModel } = createStrategy(aggressionFactor);

  // AGENT_TABLE_ADDRESS is deprecated — use POKER_TABLE_ADDRESS instead
  if (process.env.AGENT_TABLE_ADDRESS) {
    logger.warn({}, 'AGENT_TABLE_ADDRESS is deprecated — use POKER_TABLE_ADDRESS instead');
  }
  const tableAddress = process.env.POKER_TABLE_ADDRESS || process.env.AGENT_TABLE_ADDRESS;
  if (!tableAddress) {
    throw new Error("Missing required environment variable: POKER_TABLE_ADDRESS");
  }

  const operatorKey = validatePrivateKey("OPERATOR_PRIVATE_KEY");

  // Load configuration from environment
  const config = {
    rpcUrl,
    privateKey: operatorKey,
    pokerTableAddress: tableAddress as `0x${string}`,
    ownerviewUrl: optionalEnv("OWNERVIEW_URL", "http://localhost:3001"),
    chainId: parseInt(optionalEnv("CHAIN_ID", "31337")),
    pollIntervalMs: parsePositiveInt("POLL_INTERVAL_MS", defaultPollIntervalMs),
    turnActionDelayMs,
    strategy,
  };

  const maxHands = parseInt(optionalEnv("MAX_HANDS", "0"));

  // Validate that RPC_URL returns the expected chain ID before proceeding.
  await validateChainIdWithRpc(config.rpcUrl, config.chainId).catch((err: unknown) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Chain ID validation failed');
    process.exit(1);
  });

  logger.info({
    rpcUrl: config.rpcUrl,
    table: config.pokerTableAddress,
    ownerviewUrl: config.ownerviewUrl,
    chainId: config.chainId,
    pollIntervalMs: config.pollIntervalMs,
    turnActionDelayMs,
    aggression: aggressionFactor.toFixed(2),
    decisionEngine: engine,
    ...(geminiModel ? { geminiModel } : {}),
    maxHands: maxHands || "unlimited",
  }, 'Configuration');

  // Create and run bot
  const bot = new AgentBot(config);
  const healthPort = parseInt(process.env.HEALTH_PORT || "9100", 10);
  const health = startHealthServer({ service: "agent-bot", port: healthPort });
  logger.info({ healthEndpoint: `http://0.0.0.0:${healthPort}/health` }, 'Health server started');

  // Handle shutdown
  let shutdownRequested = false;
  const shutdown = () => {
    if (shutdownRequested) {
      logger.info({}, 'Force shutdown');
      process.exit(1);
    }
    shutdownRequested = true;
    logger.info({}, 'Shutdown requested, stopping bot');
    bot.stop();
    void health.close();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Run the bot
  await bot.run(maxHands);

  // Print final stats
  const stats = bot.getStats();
  logger.info({
    handsPlayed: stats.handsPlayed,
    handsWon: stats.handsWon,
    winRate: stats.handsPlayed > 0 ? ((stats.handsWon / stats.handsPlayed) * 100).toFixed(1) + "%" : "0%",
    totalProfit: stats.totalProfit.toString(),
    actionsSubmitted: stats.actionsSubmitted,
    errors: stats.errors,
  }, 'Final statistics');
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, 'Fatal error');
  process.exit(1);
});

// Export for programmatic use
export { AgentBot } from "./bot.js";
export * from "./chain/index.js";
export * from "./auth/index.js";
export * from "./strategy/index.js";
