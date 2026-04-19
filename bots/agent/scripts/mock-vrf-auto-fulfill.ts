import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { localhost } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const vrfAbi = parseAbi([
  "function lastRequestId() view returns (uint256)",
  "function fulfillRandomness(uint256 requestId, uint256 randomness)",
]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const rpcUrl = requireEnv("RPC_URL");
  const vrfAddress = requireEnv("VRF_ADDRESS") as `0x${string}`;
  const privateKey = requireEnv("PRIVATE_KEY") as `0x${string}`;
  const chainId = Number.parseInt(process.env.CHAIN_ID || "31337", 10);
  const pollIntervalMs = Number.parseInt(process.env.POLL_INTERVAL_MS || "300", 10);
  const randomness = BigInt(process.env.RANDOMNESS || "12345678");

  const chain = {
    ...localhost,
    id: chainId,
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  };
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  let lastFulfilledRequestId = 0n;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const requestId = (await publicClient.readContract({
        address: vrfAddress,
        abi: vrfAbi,
        functionName: "lastRequestId",
      })) as bigint;

      if (requestId > 0n && requestId > lastFulfilledRequestId) {
        const hash = await walletClient.writeContract({
          account,
          chain,
          address: vrfAddress,
          abi: vrfAbi,
          functionName: "fulfillRandomness",
          args: [requestId, randomness],
        });
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
        lastFulfilledRequestId = requestId;
        console.log(`fulfilled request ${requestId.toString()} tx=${hash}`);
      }
    } catch (error) {
      console.error(error);
    }

    await sleep(pollIntervalMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
