// @playerco/agent-bot - Poker-playing agent bot
// Entry point that reads configuration from environment variables

import { AgentBot } from "./bot.js";

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

async function main() {
  console.log(`Agent bot v${VERSION}`);

  // Load configuration from environment
  const config = {
    rpcUrl: requireEnv("RPC_URL"),
    privateKey: requireEnv("OPERATOR_PRIVATE_KEY") as `0x${string}`,
    pokerTableAddress: requireEnv("POKER_TABLE_ADDRESS") as `0x${string}`,
    ownerviewUrl: optionalEnv("OWNERVIEW_URL", "http://localhost:3001"),
    chainId: parseInt(optionalEnv("CHAIN_ID", "31337")),
    pollIntervalMs: parseInt(optionalEnv("POLL_INTERVAL_MS", "1000")),
  };

  const maxHands = parseInt(optionalEnv("MAX_HANDS", "0"));

  console.log("Configuration:");
  console.log(`  RPC URL: ${config.rpcUrl}`);
  console.log(`  Table: ${config.pokerTableAddress}`);
  console.log(`  OwnerView: ${config.ownerviewUrl}`);
  console.log(`  Chain ID: ${config.chainId}`);
  console.log(`  Poll interval: ${config.pollIntervalMs}ms`);
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
