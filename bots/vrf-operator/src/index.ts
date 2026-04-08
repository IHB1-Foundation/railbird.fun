import { ENV_VARS, createLogger, startHealthServer, parsePositiveInt, validateChainIdWithRpc } from "@playerco/shared";
import { VrfOperatorBot } from "./bot.js";

const log = createLogger({ service: "vrf-operator" });

const VERSION = "0.0.1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseOptionalBigInt(name: string): bigint | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  try {
    return BigInt(raw);
  } catch {
    throw new Error(`Invalid bigint environment variable: ${name}=${raw}`);
  }
}

async function main(): Promise<void> {
  log.info({ version: VERSION }, "VRF operator bot starting");

  // Support POKER_TABLE_ADDRESSES (comma-separated, preferred) or POKER_TABLE_ADDRESS (single)
  // The VRF operator processes all requests on the adapter regardless of source table.
  // Table addresses are used only for startup adapter-address validation.
  const tableAddressesRaw = process.env[ENV_VARS.POKER_TABLE_ADDRESSES] || process.env.POKER_TABLE_ADDRESS;
  const pokerTableAddresses = tableAddressesRaw
    ? (tableAddressesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as `0x${string}`[])
    : [];

  const config = {
    rpcUrl: requireEnv(ENV_VARS.RPC_URL),
    privateKey: requireEnv("VRF_OPERATOR_PRIVATE_KEY") as `0x${string}`,
    vrfAdapterAddress: requireEnv(ENV_VARS.VRF_ADAPTER_ADDRESS) as `0x${string}`,
    pokerTableAddresses,
    chainId: parsePositiveInt("CHAIN_ID", 133),
    pollIntervalMs: parsePositiveInt("VRF_OPERATOR_POLL_INTERVAL_MS", 1500),
    minConfirmations: parsePositiveInt("VRF_OPERATOR_MIN_CONFIRMATIONS", 1),
    rescanWindow: parsePositiveInt("VRF_OPERATOR_RESCAN_WINDOW", 256),
    rescanFromRequestId: process.env.VRF_OPERATOR_RESCAN_FROM_REQUEST_ID
      ? BigInt(process.env.VRF_OPERATOR_RESCAN_FROM_REQUEST_ID)
      : undefined,
    randomSalt: process.env.VRF_OPERATOR_RANDOM_SALT || "railbird-vrf-operator",
    fixedRandomness: parseOptionalBigInt("VRF_OPERATOR_FIXED_RANDOMNESS"),
  };

  // Validate that RPC_URL returns the expected chain ID before proceeding.
  await validateChainIdWithRpc(config.rpcUrl, config.chainId).catch((err: unknown) => {
    log.error({ err }, "Chain ID validation failed");
    process.exit(1);
  });
  log.info({ chainId: config.chainId }, "Chain ID validated");

  const bot = new VrfOperatorBot(config);

  const healthPort = parseInt(process.env.HEALTH_PORT || "9102", 10);
  const health = startHealthServer({
    service: "vrf-operator",
    port: healthPort,
    getExtras: () => {
      const s = bot.getStats();
      return {
        stats: {
          scannedRequests: s.scannedRequests,
          fulfilledRequests: s.fulfilledRequests,
          skippedNotReady: s.skippedNotReady,
          errors: s.errors,
        },
        circuits: {
          rpc: bot.getRpcCircuitState().toLowerCase(),
        },
        lastActivity: s.lastActivityTime > 0 ? new Date(s.lastActivityTime).toISOString() : null,
        tables: pokerTableAddresses,
      };
    },
  });
  log.info({ port: healthPort }, "Health endpoint listening");

  const shutdown = (): void => {
    log.info("Shutdown requested");
    bot.stop();
    void health.close();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await bot.run();
}

main().catch((error) => {
  log.error({ err: error }, "Fatal error");
  process.exit(1);
});

export { VrfOperatorBot } from "./bot.js";
