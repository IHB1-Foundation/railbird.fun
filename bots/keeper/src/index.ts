// @playerco/keeper-bot - Liveness keeper bot
// Entry point that reads configuration from environment variables

import { KeeperBot } from "./bot.js";
import { TreasuryAdvisor } from "./treasury/advisor.js";
import {
  startHealthServer,
  validateChainIdWithRpc,
  validatePrivateKey,
  parseTableAddresses,
  parsePositiveInt,
  optionalEnv,
  requireEnv,
  createLogger,
} from "@playerco/shared";

const logger = createLogger({ service: "keeper-bot" });

const VERSION = "0.0.1";

async function main() {
  logger.info({ version: VERSION }, 'Keeper bot starting');
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
    logger.info({ shardId, totalShards }, 'No tables assigned to shard, exiting');
    return;
  }

  const keeperKey = validatePrivateKey("KEEPER_PRIVATE_KEY");

  // Optional AI treasury advisor (enabled via TREASURY_ADVISOR_ENABLED=true)
  const treasuryAdvisorEnabled = process.env.TREASURY_ADVISOR_ENABLED?.toLowerCase() === "true";
  let treasuryAdvisor: TreasuryAdvisor | undefined;
  if (treasuryAdvisorEnabled) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      logger.warn({}, "TREASURY_ADVISOR_ENABLED=true but GEMINI_API_KEY missing — AI advisor disabled");
    } else {
      treasuryAdvisor = new TreasuryAdvisor({
        apiKey: geminiApiKey,
        model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      });
      logger.info({ model: process.env.GEMINI_MODEL || "gemini-2.0-flash" }, "AI treasury advisor enabled");
    }
  }

  const baseConfig = {
    rpcUrl,
    privateKey: keeperKey,
    ownerviewUrl: process.env.OWNERVIEW_URL,
    dealerApiKey: process.env.DEALER_API_KEY,
    chainId: parseInt(optionalEnv("CHAIN_ID", "133")),
    pollIntervalMs: parsePositiveInt("POLL_INTERVAL_MS", defaultPollIntervalMs),
    actionJitterMs,
    vaultAddress: process.env.VAULT_ADDRESS as `0x${string}` | undefined,
    treasuryAdvisor,
  };

  // Validate that RPC_URL returns the expected chain ID before proceeding.
  await validateChainIdWithRpc(baseConfig.rpcUrl, baseConfig.chainId).catch((err: unknown) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Chain ID validation failed');
    process.exit(1);
  });

  logger.info({
    rpcUrl: baseConfig.rpcUrl,
    tables: tableAddresses,
    chainId: baseConfig.chainId,
    pollIntervalMs: baseConfig.pollIntervalMs,
    actionJitterMs,
    ...(totalShards > 1 ? { shardId, totalShards, assignedTables: tableAddresses.length, totalTables: allTableAddresses.length } : {}),
    dealerIntegration: !!(baseConfig.ownerviewUrl && baseConfig.dealerApiKey),
  }, 'Configuration');

  // Create one KeeperBot per table
  const bots = tableAddresses.map(
    (pokerTableAddress) => new KeeperBot({ ...baseConfig, pokerTableAddress })
  );

  const healthPort = parseInt(process.env.HEALTH_PORT || "9101", 10);
  const health = startHealthServer({
    service: "keeper-bot",
    port: healthPort,
    getExtras: () => {
      const primary = bots[0];
      const allStats = bots.map((b) => b.getStats());
      const totalStats = allStats.reduce(
        (acc, s) => ({
          timeoutsForced: acc.timeoutsForced + s.timeoutsForced,
          handsStarted: acc.handsStarted + s.handsStarted,
          showdownsSettled: acc.showdownsSettled + s.showdownsSettled,
          vrfReRequests: acc.vrfReRequests + s.vrfReRequests,
          errors: acc.errors + s.errors,
          rebalancesTriggered: acc.rebalancesTriggered + s.rebalancesTriggered,
          coordinationSkips: acc.coordinationSkips + s.coordinationSkips,
          rpcErrors: acc.rpcErrors + s.rpcErrors,
          apiErrors: acc.apiErrors + s.apiErrors,
          txErrors: acc.txErrors + s.txErrors,
        }),
        { timeoutsForced: 0, handsStarted: 0, showdownsSettled: 0, vrfReRequests: 0, errors: 0, rebalancesTriggered: 0, coordinationSkips: 0, rpcErrors: 0, apiErrors: 0, txErrors: 0 }
      );
      // Last activity: latest across all bots
      const lastActivityMs = Math.max(...allStats.map((s) => s.lastActionTime ?? 0));
      return {
        stats: totalStats,
        circuits: {
          rpc: primary?.getRpcCircuitState().toLowerCase() ?? "closed",
          dealer: primary?.getDealerCircuitState().toLowerCase() ?? "closed",
        },
        lastActivity: lastActivityMs > 0 ? new Date(lastActivityMs).toISOString() : null,
        tables: tableAddresses,
        treasuryAdvisor: {
          enabled: treasuryAdvisorEnabled,
          active: !!treasuryAdvisor,
        },
      };
    },
  });
  logger.info({ healthEndpoint: `http://0.0.0.0:${healthPort}/health` }, 'Health server started');

  // Handle shutdown
  let shutdownRequested = false;
  const shutdown = () => {
    if (shutdownRequested) {
      logger.info({}, 'Force shutdown');
      process.exit(1);
    }
    shutdownRequested = true;
    logger.info({}, 'Shutdown requested, stopping keepers');
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
    logger.info({
      table: tableAddresses[i],
      timeoutsForced: stats.timeoutsForced,
      handsStarted: stats.handsStarted,
      showdownsSettled: stats.showdownsSettled,
      errors: stats.errors,
      coordinationSkips: stats.coordinationSkips,
      lastAction: stats.lastAction,
      lastActionTime: new Date(stats.lastActionTime).toISOString(),
    }, 'Final statistics');
  }
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, 'Fatal error');
  process.exit(1);
});

// Export for programmatic use
export { KeeperBot } from "./bot.js";
export * from "./chain/index.js";
