import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { localhost } from "viem/chains";
import { privateKeyToAccount, signMessage } from "viem/accounts";
import { deriveEncryptionKeyPair } from "../src/auth/encryptionKey.js";
import { OwnerViewClient } from "../src/auth/ownerviewClient.js";

const AGENT_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
] as const;

const AGENT_ADDRS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const rpcUrl = requireEnv("RPC_URL");
  const ownerviewUrl = requireEnv("OWNERVIEW_URL");
  const tableAddress = requireEnv("TABLE_ADDR") as `0x${string}`;
  const chainId = Number.parseInt(process.env.CHAIN_ID || "31337", 10);
  const numSeats = Number.parseInt(process.env.NUM_SEATS || "2", 10);

  if (!Number.isInteger(numSeats) || numSeats <= 0 || numSeats > AGENT_KEYS.length) {
    throw new Error(`NUM_SEATS must be between 1 and ${AGENT_KEYS.length}; got ${numSeats}`);
  }

  const chain = {
    ...localhost,
    id: chainId,
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  };

  for (let seatIndex = 0; seatIndex < numSeats; seatIndex++) {
    const privateKey = AGENT_KEYS[seatIndex];
    const address = AGENT_ADDRS[seatIndex];
    const { pubKey } = await deriveEncryptionKeyPair(privateKey);

    const ownerViewClient = new OwnerViewClient({
      baseUrl: ownerviewUrl,
      address,
      signMessage: (message) => signMessage({ message, privateKey }),
      requestTimeoutMs: 5_000,
    });
    await ownerViewClient.registerEncryptionKey(pubKey);

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
    const encryptionAbi = [
      {
        name: "getEncryptionKey",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "seatIndex", type: "uint8" }],
        outputs: [{ type: "bytes" }],
      },
      {
        name: "registerEncryptionKey",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "seatIndex", type: "uint8" },
          { name: "pubKey", type: "bytes" },
        ],
        outputs: [],
      },
    ] as const;
    const newKeyHex = toHex(pubKey);
    const existing = (await publicClient.readContract({
      address: tableAddress,
      abi: encryptionAbi,
      functionName: "getEncryptionKey",
      args: [seatIndex],
    })) as `0x${string}`;

    if (!existing || existing.toLowerCase() !== newKeyHex.toLowerCase()) {
      const hash = await walletClient.writeContract({
        account,
        chain,
        address: tableAddress,
        abi: encryptionAbi,
        functionName: "registerEncryptionKey",
        args: [seatIndex, newKeyHex],
      });
      await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    }

    console.log(`seeded seat ${seatIndex} ${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
