import { VrfOperatorBot } from "./bot.js";

const VERSION = "0.0.1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) return fallback;
  return value;
}

async function main(): Promise<void> {
  console.log(`VRF operator bot v${VERSION}`);

  const config = {
    rpcUrl: requireEnv("RPC_URL"),
    privateKey: requireEnv("VRF_OPERATOR_PRIVATE_KEY") as `0x${string}`,
    vrfAdapterAddress: requireEnv("VRF_ADAPTER_ADDRESS") as `0x${string}`,
    chainId: parsePositiveInt("CHAIN_ID", 10143),
    pollIntervalMs: parsePositiveInt("VRF_OPERATOR_POLL_INTERVAL_MS", 1500),
    minConfirmations: parsePositiveInt("VRF_OPERATOR_MIN_CONFIRMATIONS", 1),
    rescanWindow: parsePositiveInt("VRF_OPERATOR_RESCAN_WINDOW", 256),
    rescanFromRequestId: process.env.VRF_OPERATOR_RESCAN_FROM_REQUEST_ID
      ? BigInt(process.env.VRF_OPERATOR_RESCAN_FROM_REQUEST_ID)
      : undefined,
    randomSalt: process.env.VRF_OPERATOR_RANDOM_SALT || "railbird-vrf-operator",
  };

  const bot = new VrfOperatorBot(config);

  const shutdown = (): void => {
    console.log("\n[VRFOperator] shutdown requested");
    bot.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await bot.run();
}

main().catch((error) => {
  console.error("[VRFOperator] fatal error:", error);
  process.exit(1);
});

export { VrfOperatorBot } from "./bot.js";
