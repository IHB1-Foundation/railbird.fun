// @playerco/keeper-bot - Liveness keeper bot
// Entry point that reads configuration from environment variables

import { KeeperBot } from "./bot.js";

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
  console.log(`Keeper bot v${VERSION}`);

  // Load configuration from environment
  const config = {
    rpcUrl: requireEnv("RPC_URL"),
    privateKey: requireEnv("KEEPER_PRIVATE_KEY") as `0x${string}`,
    pokerTableAddress: requireEnv("POKER_TABLE_ADDRESS") as `0x${string}`,
    playerVaultAddress: process.env.PLAYER_VAULT_ADDRESS as `0x${string}` | undefined,
    chainId: parseInt(optionalEnv("CHAIN_ID", "31337")),
    pollIntervalMs: parseInt(optionalEnv("POLL_INTERVAL_MS", "2000")),
    enableRebalancing: optionalEnv("ENABLE_REBALANCING", "false") === "true",
    rebalanceBuyAmountMon: process.env.REBALANCE_BUY_AMOUNT_MON
      ? BigInt(process.env.REBALANCE_BUY_AMOUNT_MON)
      : 0n,
    rebalanceSellAmountTokens: process.env.REBALANCE_SELL_AMOUNT_TOKENS
      ? BigInt(process.env.REBALANCE_SELL_AMOUNT_TOKENS)
      : 0n,
  };

  console.log("Configuration:");
  console.log(`  RPC URL: ${config.rpcUrl}`);
  console.log(`  Table: ${config.pokerTableAddress}`);
  console.log(`  Vault: ${config.playerVaultAddress || "not configured"}`);
  console.log(`  Chain ID: ${config.chainId}`);
  console.log(`  Poll interval: ${config.pollIntervalMs}ms`);
  console.log(`  Rebalancing: ${config.enableRebalancing ? "enabled" : "disabled"}`);

  // Create and run bot
  const bot = new KeeperBot(config);

  // Handle shutdown
  let shutdownRequested = false;
  const shutdown = () => {
    if (shutdownRequested) {
      console.log("\nForce shutdown");
      process.exit(1);
    }
    shutdownRequested = true;
    console.log("\nShutdown requested, stopping keeper...");
    bot.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Run the keeper
  await bot.run();

  // Print final stats
  const stats = bot.getStats();
  console.log("\nFinal Statistics:");
  console.log(`  Timeouts forced: ${stats.timeoutsForced}`);
  console.log(`  Hands started: ${stats.handsStarted}`);
  console.log(`  Showdowns settled: ${stats.showdownsSettled}`);
  console.log(`  Rebalances triggered: ${stats.rebalancesTriggered}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log(`  Last action: ${stats.lastAction} at ${new Date(stats.lastActionTime).toISOString()}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

// Export for programmatic use
export { KeeperBot } from "./bot.js";
export * from "./chain/index.js";
