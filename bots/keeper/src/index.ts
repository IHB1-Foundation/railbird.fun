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

function parseTableAddresses(): `0x${string}`[] {
  // Support both POKER_TABLE_ADDRESSES (comma-separated, preferred) and POKER_TABLE_ADDRESS (single)
  const multi = process.env.POKER_TABLE_ADDRESSES;
  if (multi) {
    const addresses = multi
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as `0x${string}`[];
    if (addresses.length === 0) {
      throw new Error("POKER_TABLE_ADDRESSES is set but contains no valid addresses");
    }
    return addresses;
  }
  const single = process.env.POKER_TABLE_ADDRESS;
  if (single) {
    return [single as `0x${string}`];
  }
  throw new Error("Missing required environment variable: POKER_TABLE_ADDRESSES (or POKER_TABLE_ADDRESS)");
}

async function main() {
  console.log(`Keeper bot v${VERSION}`);
  const rpcUrl = requireEnv("RPC_URL");
  const defaultPollIntervalMs = 2000;

  const tableAddresses = parseTableAddresses();
  const baseConfig = {
    rpcUrl,
    privateKey: requireEnv("KEEPER_PRIVATE_KEY") as `0x${string}`,
    ownerviewUrl: process.env.OWNERVIEW_URL,
    dealerApiKey: process.env.DEALER_API_KEY,
    chainId: parseInt(optionalEnv("CHAIN_ID", "133")),
    pollIntervalMs: parsePositiveInt("POLL_INTERVAL_MS", defaultPollIntervalMs),
  };

  console.log("Configuration:");
  console.log(`  RPC URL: ${baseConfig.rpcUrl}`);
  console.log(`  Tables: ${tableAddresses.join(", ")}`);
  console.log(`  Chain ID: ${baseConfig.chainId}`);
  console.log(`  Poll interval: ${baseConfig.pollIntervalMs}ms`);
  console.log(`  Dealer integration: ${baseConfig.ownerviewUrl && baseConfig.dealerApiKey ? "enabled" : "disabled"}`);

  // Create one KeeperBot per table
  const bots = tableAddresses.map(
    (pokerTableAddress) => new KeeperBot({ ...baseConfig, pokerTableAddress })
  );

  // Handle shutdown
  let shutdownRequested = false;
  const shutdown = () => {
    if (shutdownRequested) {
      console.log("\nForce shutdown");
      process.exit(1);
    }
    shutdownRequested = true;
    console.log("\nShutdown requested, stopping keeper(s)...");
    for (const bot of bots) {
      bot.stop();
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Run all bots concurrently
  await Promise.all(bots.map((bot) => bot.run()));

  // Print final stats for each bot
  for (let i = 0; i < bots.length; i++) {
    const stats = bots[i].getStats();
    console.log(`\nFinal Statistics (Table ${tableAddresses[i]}):`);
    console.log(`  Timeouts forced: ${stats.timeoutsForced}`);
    console.log(`  Hands started: ${stats.handsStarted}`);
    console.log(`  Showdowns settled: ${stats.showdownsSettled}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  Last action: ${stats.lastAction} at ${new Date(stats.lastActionTime).toISOString()}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

// Export for programmatic use
export { KeeperBot } from "./bot.js";
export * from "./chain/index.js";
