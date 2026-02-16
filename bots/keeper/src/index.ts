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

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) return fallback;
  return value;
}

async function main() {
  console.log(`Keeper bot v${VERSION}`);
  const rpcUrl = requireEnv("RPC_URL");
  const defaultPollIntervalMs = rpcUrl.includes("monad.xyz") ? 3000 : 2000;

  // Load configuration from environment
  const config = {
    rpcUrl,
    privateKey: requireEnv("KEEPER_PRIVATE_KEY") as `0x${string}`,
    pokerTableAddress: requireEnv("POKER_TABLE_ADDRESS") as `0x${string}`,
    playerVaultAddress: process.env.PLAYER_VAULT_ADDRESS as `0x${string}` | undefined,
    ownerviewUrl: process.env.OWNERVIEW_URL,
    dealerApiKey: process.env.DEALER_API_KEY,
    chainId: parseInt(optionalEnv("CHAIN_ID", "31337")),
    pollIntervalMs: parsePositiveInt("POLL_INTERVAL_MS", defaultPollIntervalMs),
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
  console.log(`  Dealer integration: ${config.ownerviewUrl && config.dealerApiKey ? "enabled" : "disabled"}`);

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
