// @vitest-environment jsdom
/**
 * Component tests for WalletButton, BettingPanel, TableViewer, and AuthContext.
 *
 * Covers T-M4-04.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { useWebSocket } from "@/lib/useWebSocket";
import type { TableResponse } from "../types";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const _ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const OWNER_ADDR = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

function makeSeat(seatIndex: number, ownerAddress: string, stack: string, isActive = true) {
  return {
    seatIndex,
    ownerAddress,
    operatorAddress: ownerAddress,
    stack,
    isActive,
    currentBet: "0",
    tokenAddress: null,
  };
}

function makeTable(overrides: Partial<TableResponse> = {}): TableResponse {
  return {
    tableId: "1",
    contractAddress: "0xABC",
    gameState: "WAITING_FOR_SEATS",
    seats: [
      makeSeat(0, OWNER_ADDR, "1000000000000000000000"),
      makeSeat(1, "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "1000000000000000000000"),
    ],
    smallBlind: "10000000000000000000",
    bigBlind: "20000000000000000000",
    currentHandId: "0",
    buttonSeat: 0,
    actionDeadline: null,
    currentHand: null,
    ...overrides,
  };
}

// ─── Mock: Next.js ───────────────────────────────────────────────────────────

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    React.createElement("a", { href }, children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Mock: viem / pokerTableClient ───────────────────────────────────────────

vi.mock("@/lib/pokerTableClient", () => ({
  getPokerTableMaxSeats: vi.fn().mockResolvedValue(9),
  registerSeat: vi.fn().mockResolvedValue("0xdeadhash"),
}));

vi.mock("@/lib/api", () => ({
  getRevealedHolecards: vi.fn().mockResolvedValue(null),
}));

// ─── Mock: ownerviewApi ───────────────────────────────────────────────────────

vi.mock("@/lib/auth/ownerviewApi", () => ({
  COOKIE_SESSION_ENABLED: false,
  getNonce: vi.fn().mockResolvedValue("test-nonce"),
  verifySignature: vi.fn().mockResolvedValue({
    token: "jwt-token",
    expiresAt: Date.now() + 3_600_000,
  }),
  getHoleCards: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth/encryptionKey", () => ({
  deriveEncryptionKeyPair: vi.fn().mockResolvedValue({ publicKeyHex: "0xpubkey" }),
  clearEncryptionKeyCache: vi.fn(),
}));

// ─── Mock: useWebSocket ───────────────────────────────────────────────────────

vi.mock("@/lib/useWebSocket", () => ({
  useWebSocket: vi.fn().mockReturnValue({ status: "connected" }),
}));

// ─── Ethereum provider mock ───────────────────────────────────────────────────

type EthMock = {
  request: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
};

function makeEthereumProvider(
  opts: {
    chainId?: string;
    accounts?: string[];
    connected?: boolean;
  } = {},
): EthMock {
  const { chainId = "0x85", accounts = [OWNER_ADDR], connected = true } = opts;

  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return chainId;
      if (method === "eth_accounts") return connected ? accounts : [];
      if (method === "eth_requestAccounts") return accounts;
      if (method === "personal_sign") return "0xsignature";
      if (method === "wallet_switchEthereumChain") return null;
      return null;
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as EthMock;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setEthereum(provider: EthMock | undefined) {
  if (provider === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).ethereum;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = provider;
  }
}

// ─── AuthContext ──────────────────────────────────────────────────────────────

describe("AuthContext", () => {
  beforeEach(() => {
    setEthereum(undefined);
    vi.clearAllMocks();
  });

  it("provides initial unauthenticated state when no wallet present", async () => {
    const { AuthProvider, useAuth } = await import("@/lib/auth/AuthContext");

    function Consumer() {
      const auth = useAuth();
      return (
        <>
          <span data-testid="connected">{String(auth.isConnected)}</span>
          <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
        </>
      );
    }

    await act(async () => {
      render(
        <AuthProvider>
          <Consumer />
        </AuthProvider>,
      );
    });

    expect(screen.getByTestId("connected").textContent).toBe("false");
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("useAuth throws when used outside AuthProvider", async () => {
    const { useAuth } = await import("@/lib/auth/AuthContext");

    function Consumer() {
      useAuth();
      return null;
    }

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow();
    consoleSpy.mockRestore();
  });

  it("connect() sets isConnected after wallet responds with accounts", async () => {
    setEthereum(makeEthereumProvider({ connected: false }));

    const { AuthProvider, useAuth } = await import("@/lib/auth/AuthContext");

    let capturedAuth: ReturnType<typeof useAuth> | null = null;

    function Consumer() {
      capturedAuth = useAuth();
      return (
        <button data-testid="connect" onClick={() => capturedAuth!.connect()}>
          connect
        </button>
      );
    }

    await act(async () => {
      render(
        <AuthProvider>
          <Consumer />
        </AuthProvider>,
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("connect"));
    });

    expect(capturedAuth!.isConnected).toBe(true);
    expect(capturedAuth!.address?.toLowerCase()).toBe(OWNER_ADDR.toLowerCase());
  });

  it("disconnect() clears auth state", async () => {
    setEthereum(makeEthereumProvider({ connected: false }));

    const { AuthProvider, useAuth } = await import("@/lib/auth/AuthContext");

    let capturedAuth: ReturnType<typeof useAuth> | null = null;

    function Consumer() {
      capturedAuth = useAuth();
      return (
        <>
          <button data-testid="connect" onClick={() => capturedAuth!.connect()}>
            connect
          </button>
          <button data-testid="disconnect" onClick={() => capturedAuth!.disconnect()}>
            disconnect
          </button>
        </>
      );
    }

    await act(async () => {
      render(
        <AuthProvider>
          <Consumer />
        </AuthProvider>,
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("connect"));
    });

    expect(capturedAuth!.isConnected).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByTestId("disconnect"));
    });

    expect(capturedAuth!.isConnected).toBe(false);
    expect(capturedAuth!.address).toBeNull();
  });
});

// ─── WalletButton ─────────────────────────────────────────────────────────────

describe("WalletButton", () => {
  beforeEach(() => {
    setEthereum(undefined);
    vi.clearAllMocks();
  });

  async function renderWalletButton(provider?: EthMock) {
    if (provider) setEthereum(provider);
    const { AuthProvider } = await import("@/lib/auth/AuthContext");
    const { WalletButton } = await import("@/components/WalletButton");

    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AuthProvider>
          <WalletButton />
        </AuthProvider>,
      );
    });
    return result;
  }

  it("shows Connect Wallet button when no wallet is installed", async () => {
    await renderWalletButton();
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeTruthy();
  });

  it("shows Connect Wallet button when wallet is disconnected", async () => {
    await renderWalletButton(makeEthereumProvider({ connected: false }));
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeTruthy();
  });

  it("shows Sign In button after wallet connects", async () => {
    await renderWalletButton(makeEthereumProvider({ connected: false }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    });

    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
  });

  it("shows Signed In badge after full authentication flow", async () => {
    await renderWalletButton(makeEthereumProvider({ connected: false }));

    // Step 1: connect
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    });

    // Step 2: authenticate (sign)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    });

    expect(screen.getByText(/signed in/i)).toBeTruthy();
  });

  it("shows disconnect button when authenticated", async () => {
    await renderWalletButton(makeEthereumProvider({ connected: false }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    });

    // Disconnect button exists in the authenticated state
    expect(screen.getByRole("button", { name: /sign out|disconnect/i })).toBeTruthy();
  });
});

// ─── BettingPanel ─────────────────────────────────────────────────────────────

describe("BettingPanel", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ currentHand: null }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPanel(tableOverrides: Partial<TableResponse> = {}) {
    const { BettingPanel } = await import("@/components/BettingPanel");
    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(<BettingPanel initialTable={makeTable(tableOverrides)} />);
    });
    return result;
  }

  it("renders Predict the Winner section title", async () => {
    await renderPanel();
    expect(screen.getByRole("heading", { name: /predict the winner/i })).toBeTruthy();
  });

  it("renders Virtual Bankroll display", async () => {
    await renderPanel();
    expect(screen.getByText("Virtual Bankroll")).toBeTruthy();
  });

  it("shows market-closed message when not in active hand", async () => {
    await renderPanel();
    expect(screen.getByText(/market closed/i)).toBeTruthy();
  });

  it("renders Open Bets history section", async () => {
    await renderPanel();
    expect(screen.getAllByText(/open bets/i).length).toBeGreaterThan(0);
  });

  it("renders Bet Slip with stake input", async () => {
    await renderPanel();
    expect(screen.getByRole("textbox", { name: /stake \(rchip\)/i })).toBeTruthy();
  });

  it("renders Place Bet button (disabled when market closed)", async () => {
    await renderPanel();
    // When closed the aria-label is "Betting is closed — wait for next hand"
    const btn = screen.getByRole("button", { name: /betting is closed|place bet/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows market-open message during active hand", async () => {
    await renderPanel({
      gameState: "BETTING_PRE",
      currentHandId: "5",
      currentHand: {
        handId: "5",
        tableId: "1",
        pot: "30000000000000000000",
        currentBet: "20000000000000000000",
        actorSeat: 0,
        gameState: "BETTING_PRE",
        buttonSeat: 0,
        communityCards: [],
        winnerSeat: null,
        settlementAmount: null,
        actions: [],
      },
    });

    expect(screen.getByText(/hand #5 market open/i)).toBeTruthy();
  });
});

// ─── TableViewer ─────────────────────────────────────────────────────────────

describe("TableViewer", () => {
  beforeEach(() => {
    setEthereum(undefined);
    vi.mocked(useWebSocket).mockReturnValue({
      status: "connected",
      reconnectAttempts: 0,
      nextRetryIn: 0,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderTableViewer(tableOverrides: Partial<TableResponse> = {}) {
    const { AuthProvider } = await import("@/lib/auth/AuthContext");
    const { TableViewer } = await import("@/app/table/[id]/TableViewer");

    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AuthProvider>
          <TableViewer initialData={makeTable(tableOverrides)} tableId="1" />
        </AuthProvider>,
      );
    });
    return result;
  }

  it("renders game state as 'Waiting for Seats' in initial state", async () => {
    await renderTableViewer();
    expect(screen.getAllByText(/waiting for players/i).length).toBeGreaterThan(0);
  });

  it("renders game state label as 'Pre-flop' during BETTING_PRE", async () => {
    await renderTableViewer({ gameState: "BETTING_PRE" });
    expect(screen.getAllByText(/pre-flop/i).length).toBeGreaterThan(0);
  });

  it("renders seat panels for occupied seats", async () => {
    await renderTableViewer();
    // Each seat panel renders a 'Seat N' label
    expect(screen.getAllByText(/seat [01]/i).length).toBeGreaterThan(0);
  });

  it("shows community cards section during flop betting", async () => {
    await renderTableViewer({
      gameState: "BETTING_FLOP",
      currentHand: {
        handId: "1",
        tableId: "1",
        pot: "60000000000000000000",
        currentBet: "0",
        actorSeat: 1,
        gameState: "BETTING_FLOP",
        buttonSeat: 0,
        communityCards: [5, 10, 25],
        winnerSeat: null,
        settlementAmount: null,
        actions: [],
      },
    });

    // Community cards or flop label should be visible
    const allText = document.body.textContent ?? "";
    expect(allText).toMatch(/flop|community|pot/i);
  });

  it("renders action log for past actions", async () => {
    const now = new Date().toISOString();
    await renderTableViewer({
      gameState: "BETTING_FLOP",
      currentHand: {
        handId: "1",
        tableId: "1",
        pot: "40000000000000000000",
        currentBet: "0",
        actorSeat: 1,
        gameState: "BETTING_FLOP",
        buttonSeat: 0,
        communityCards: [1, 14, 27],
        winnerSeat: null,
        settlementAmount: null,
        actions: [
          {
            seatIndex: 0,
            actionType: "RAISE",
            amount: "20000000000000000000",
            potAfter: "40000000000000000000",
            blockNumber: "12345",
            txHash: "0xdeadbeef",
            endsStreet: false,
            timestamp: now,
          },
        ],
      },
    });

    // Action log heading or "Raise" action text should be present
    const allText = document.body.textContent ?? "";
    expect(allText).toMatch(/raise|action log/i);
  });

  it("shows rendered action details in action log", async () => {
    const now = new Date().toISOString();
    await renderTableViewer({
      gameState: "BETTING_FLOP",
      currentHand: {
        handId: "1",
        tableId: "1",
        pot: "40000000000000000000",
        currentBet: "0",
        actorSeat: 1,
        gameState: "BETTING_FLOP",
        buttonSeat: 0,
        communityCards: [1, 14, 27],
        winnerSeat: null,
        settlementAmount: null,
        actions: [
          {
            seatIndex: 0,
            actionType: "CALL",
            amount: "20000000000000000000",
            potAfter: "40000000000000000000",
            blockNumber: "99999",
            txHash: "0xdeadbeef",
            endsStreet: false,
            timestamp: now,
          },
        ],
      },
    });

    // ActionLog no longer renders block numbers; assert the visible action text instead.
    const allText = document.body.textContent ?? "";
    expect(allText).toMatch(/action log/i);
    expect(allText).toMatch(/call/i);
  });
});
