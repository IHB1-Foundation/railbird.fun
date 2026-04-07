// @playerco/keeper-bot - Liveness keeper bot
// Entry point that reads configuration from environment variables

import { KeeperBot } from "./bot.js";
import {
  startHealthServer,
  validateChainIdWithRpc,
  validatePrivateKey,
  parseTableAddresses,
  parsePositiveInt,
  optionalEnv,
  requireEnv,
} from "@playerco/shared";

const VERSION = "0.0.1";

async function main() {
  console.log(`Keeper bot v${VERSION}`);
  const rpcUrl = requireEnv("RPC_URL");
  const defaultPollIntervalMs = 2000;

  const allTableAddresses = parseTableAddresses();
  const actionJitterMs = parsePositiveInt("KEEPER_ACTION_JITTER_MS", 0);

  // Table sharding: when running multiple keeper processes, each can own a
  // subset of tables. Set KEEPER_SHARD_ID (0-indexed) and KEEPER_TOTAL_SHARDS.
  // Example: 2 processes → process 0 gets even-indexed tables, process 1 gets odd.
  const totalShards = parsePositiveInt("KEEPER_TOTAL_SHARDS", 1);
  const shardId = parsePositiveInt("KEEPER_SHARD_ID", 0);
  const tableAddresses = totalShards > 1
    ? allTableAddresses.filter((_, i) => i % totalShards === shardId)
    : allTableAddresses;

  if (tableAddresses.length === 0) {
    console.log(`[KeeperBot] No tables assigned to shard ${shardId}/${totalShards}. Exiting.`);
    return;
  }

  const keeperKey = validatePrivateKey("KEEPER_PRIVATE_KEY");

  const baseConfig = {
    rpcUrl,
    privateKey: keeperKey,
    ownerviewUrl: process.env.OWNERVIEW_URL,
    dealerApiKey: process.env.DEALER_API_KEY,
    chainId: parseInt(optionalEnv("CHAIN_ID", "133")),
    pollIntervalMs: parsePositiveInt("POLL_INTERVAL_MS", defaultPollIntervalMs),
    actionJitterMs,
    vaultAddress: process.env.VAULT_ADDRESS as `0x${string}` | undefined,
  };

  // Validate that RPC_URL returns the expected chain ID before proceeding.
  await validateChainIdWithRpc(baseConfig.rpcUrl, baseConfig.chainId).catch((err: unknown) => {
    console.error(`[KeeperBot] Chain ID validation failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });

  console.log("Configuration:");
  console.log(`  RPC URL: ${baseConfig.rpcUrl}`);
  console.log(`  Tables: ${tableAddresses.join(", ")}`);
  console.log(`  Chain ID: ${baseConfig.chainId}`);
  console.log(`  Poll interval: ${baseConfig.pollIntervalMs}ms`);
  console.log(`  Action jitter: ${actionJitterMs}ms`);
  if (totalShards > 1) {
    console.log(`  Shard: ${shardId}/${totalShards} (${tableAddresses.length}/${allTableAddresses.length} tables)`);
  }
  console.log(`  Dealer integration: ${baseConfig.ownerviewUrl && baseConfig.dealerApiKey ? "enabled" : "disabled"}`);

  // Create one KeeperBot per table
  const bots = tableAddresses.map(
    (pokerTableAddress) => new KeeperBot({ ...baseConfig, pokerTableAddress })
  );

  const healthPort = parseInt(process.env.HEALTH_PORT || "9101", 10);
  const health = startHealthServer({ service: "keeper-bot", port: healthPort });
  console.log(`  Health endpoint: http://0.0.0.0:${healthPort}/health`);

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
    void health.close();
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
    console.log(`  Coordination skips: ${stats.coordinationSkips}`);
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
