// @playerco/agent-bot - Poker-playing agent bot
// Entry point that reads configuration from environment variables

import { AgentBot } from "./bot.js";
import { GeminiStrategy, SimpleStrategy, type Strategy } from "./strategy/index.js";

const VERSION = "0.0.1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function parseBoundedFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) return fallback;
  return value;
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
    console.warn("[AgentBot] AGENT_DECISION_ENGINE=gemini but GEMINI_API_KEY is missing. Using simple strategy.");
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
  console.log(`Agent bot v${VERSION}`);
  const aggressionFactor = parseBoundedFloat("AGGRESSION_FACTOR", 0.3);
  const turnActionDelayMs = parsePositiveInt("TURN_ACTION_DELAY_MS", 60 * 1000);
  const { strategy, engine, geminiModel } = createStrategy(aggressionFactor);

  // Load configuration from environment
  const config = {
    rpcUrl: requireEnv("RPC_URL"),
    privateKey: requireEnv("OPERATOR_PRIVATE_KEY") as `0x${string}`,
    pokerTableAddress: requireEnv("POKER_TABLE_ADDRESS") as `0x${string}`,
    ownerviewUrl: optionalEnv("OWNERVIEW_URL", "http://localhost:3001"),
    chainId: parseInt(optionalEnv("CHAIN_ID", "31337")),
    pollIntervalMs: parseInt(optionalEnv("POLL_INTERVAL_MS", "1000")),
    turnActionDelayMs,
    strategy,
  };

  const maxHands = parseInt(optionalEnv("MAX_HANDS", "0"));

  console.log("Configuration:");
  console.log(`  RPC URL: ${config.rpcUrl}`);
  console.log(`  Table: ${config.pokerTableAddress}`);
  console.log(`  OwnerView: ${config.ownerviewUrl}`);
  console.log(`  Chain ID: ${config.chainId}`);
  console.log(`  Poll interval: ${config.pollIntervalMs}ms`);
  console.log(`  Turn action delay: ${turnActionDelayMs}ms`);
  console.log(`  Aggression: ${aggressionFactor.toFixed(2)}`);
  console.log(`  Decision engine: ${engine}`);
  if (geminiModel) {
    console.log(`  Gemini model: ${geminiModel}`);
  }
  console.log(`  Max hands: ${maxHands || "unlimited"}`);

  // Create and run bot
  const bot = new AgentBot(config);

  // Handle shutdown
  let shutdownRequested = false;
  const shutdown = () => {
    if (shutdownRequested) {
      console.log("\nForce shutdown");
      process.exit(1);
    }
    shutdownRequested = true;
    console.log("\nShutdown requested, stopping bot...");
    bot.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Run the bot
  await bot.run(maxHands);

  // Print final stats
  const stats = bot.getStats();
  console.log("\nFinal Statistics:");
  console.log(`  Hands played: ${stats.handsPlayed}`);
  console.log(`  Hands won: ${stats.handsWon}`);
  console.log(`  Win rate: ${stats.handsPlayed > 0 ? ((stats.handsWon / stats.handsPlayed) * 100).toFixed(1) : 0}%`);
  console.log(`  Total profit: ${stats.totalProfit}`);
  console.log(`  Actions submitted: ${stats.actionsSubmitted}`);
  console.log(`  Errors: ${stats.errors}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

// Export for programmatic use
export { AgentBot } from "./bot.js";
export * from "./chain/index.js";
export * from "./auth/index.js";
export * from "./strategy/index.js";
