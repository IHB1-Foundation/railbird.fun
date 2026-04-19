// @vitest-environment jsdom
/**
 * Unit test for the Initia branch of pokerTableClient.
 * Asserts that on initia-testnet, sendTransaction routes through the EVM
 * provider (getEvmProvider) rather than the EIP-1193 injected provider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockWriteContract = vi.fn().mockResolvedValue("0xabc123" as `0x${string}`);
const mockWaitForTransactionReceipt = vi.fn().mockResolvedValue({});
const mockGetAddresses = vi.fn().mockResolvedValue(["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"]);

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createWalletClient: vi.fn().mockReturnValue({
      writeContract: mockWriteContract,
      getAddresses: mockGetAddresses,
    }),
    createPublicClient: vi.fn().mockReturnValue({
      readContract: vi.fn().mockResolvedValue(9n),
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
    }),
  };
});

const mockProvider = { request: vi.fn().mockResolvedValue("0x1") };

describe("pokerTableClient — Initia branch", () => {
  let originalChainEnv: string | undefined;

  beforeEach(() => {
    originalChainEnv = process.env.NEXT_PUBLIC_CHAIN_ENV;
    process.env.NEXT_PUBLIC_CHAIN_ENV = "initia-testnet";
    process.env.NEXT_PUBLIC_CHAIN_ID = "12345";
    process.env.NEXT_PUBLIC_RPC_URL = "https://rpc.example.com";
    // Set window.ethereum to the mock provider
    Object.defineProperty(window, "ethereum", {
      value: mockProvider,
      configurable: true,
    });
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_CHAIN_ENV = originalChainEnv;
    delete process.env.NEXT_PUBLIC_CHAIN_ID;
    delete process.env.NEXT_PUBLIC_RPC_URL;
  });

  it("getEvmProvider returns the injected provider on initia-testnet", async () => {
    const { getEvmProvider } = await import("@/lib/wallet/interwoven");
    const provider = getEvmProvider();
    expect(provider).toBe(mockProvider);
  });

  it("getInjectedProvider returns null on initia-testnet (event-listener path is IWK)", async () => {
    const { getInjectedProvider } = await import("@/lib/wallet/interwoven");
    const provider = getInjectedProvider();
    expect(provider).toBeNull();
  });

  it("registerSeat dispatches via EVM provider, not via null provider.request", async () => {
    const { createWalletClient } = await import("viem");
    const { registerSeat } = await import("@/lib/pokerTableClient");

    await registerSeat({
      tableAddress: "0x1111111111111111111111111111111111111111",
      seatIndex: 0,
      buyInKaia: "1.0",
    });

    // createWalletClient was called (EVM path wired), not null
    expect(createWalletClient).toHaveBeenCalled();
    expect(mockWriteContract).toHaveBeenCalled();
  });
});
