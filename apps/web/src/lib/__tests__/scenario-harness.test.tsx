// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { TableResponse } from "../types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/WalletButton", () => ({
  WalletButton: () => <button type="button">Connect Wallet</button>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    isConnected: true,
  }),
}));

const _ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: {
      get: () => null,
    },
    json: async () => body,
  } as unknown as Response;
}

function installFetchMock(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const liveTable: TableResponse = {
  tableId: "1",
  contractAddress: "0x0000000000000000000000000000000000000001",
  smallBlind: "10",
  bigBlind: "20",
  currentHandId: "42",
  gameState: "BETTING_TURN",
  buttonSeat: 0,
  actionDeadline: null,
  seats: [
    {
      seatIndex: 0,
      ownerAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      operatorAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      stack: "900",
      isActive: true,
      currentBet: "900",
      tokenAddress: null,
    },
    {
      seatIndex: 1,
      ownerAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      operatorAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      stack: "1100",
      isActive: true,
      currentBet: "900",
      tokenAddress: null,
    },
  ],
  currentHand: {
    handId: "42",
    tableId: "1",
    pot: "1800",
    currentBet: "900",
    actorSeat: 1,
    gameState: "BETTING_TURN",
    buttonSeat: 0,
    communityCards: [0, 14, 28, 255, 255],
    winnerSeat: null,
    settlementAmount: null,
    actions: [
      {
        seatIndex: 0,
        actionType: "RAISE",
        amount: "900",
        potAfter: "1800",
        blockNumber: "123",
        txHash: "0xabc123",
        endsStreet: false,
        timestamp: "2026-04-09T00:00:00Z",
        reasoning: "Pressure the capped range. Apply maximum fold equity.",
        verified: true,
        revealTxHash: "0xdef456",
        breakdown: {
          handStrength: "Top pair, strong kicker",
          potOdds: "Need 29% equity",
          evEstimate: "+EV jam",
          opponentRead: "Villain over-folds to turn aggression",
          keyFactor: "Exploitative pressure against capped range",
          confidence: 83,
        },
      },
    ],
  },
};

describe("SCENARIO.md harness", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("covers the judge live flow with ESPN mode, AI thinking, and side-bet stats", async () => {
    installFetchMock((url) => {
      if (url.endsWith("/api/tables")) {
        return jsonResponse([liveTable]);
      }
      if (url.endsWith("/api/tables/1")) {
        return jsonResponse(liveTable);
      }
      if (url.includes("/api/sidebets/0x0000000000000000000000000000000000000001/42")) {
        return jsonResponse({
          totalPool: "2500",
          seatTotals: {
            0: "1400",
            1: "1100",
          },
        });
      }
      if (url.includes("/api/leaderboard?metric=roi&period=24h")) {
        return jsonResponse({
          entries: [
            {
              tokenAddress: "0x1234567890abcdef1234567890abcdef12345678",
            },
          ],
        });
      }
      throw new Error(`Unhandled fetch in live scenario: ${url}`);
    });

    const { LiveDashboard } = await import("../../app/live/LiveDashboard");

    await act(async () => {
      render(<LiveDashboard />);
    });

    await waitFor(() => expect(screen.getByText("BIG POT")).toBeTruthy(), { timeout: 3000 });

    expect(screen.getByText("LIVE")).toBeTruthy();
    expect(screen.getByText("COMMENTARY")).toBeTruthy();
    expect(screen.getByText("AI THINKING")).toBeTruthy();
    expect(screen.getByText("Side Bets")).toBeTruthy();
    expect(screen.getByText("Today's Hands")).toBeTruthy();
    expect(screen.getByText(/Seat 0 raises to 900!/)).toBeTruthy();
  });

  it("covers grid mode and stream mode for spectators and creators", async () => {
    installFetchMock((url) => {
      if (url.endsWith("/api/tables")) {
        return jsonResponse([liveTable, { ...liveTable, tableId: "2", currentHandId: "43" }]);
      }
      if (url.endsWith("/api/tables/1")) {
        return jsonResponse(liveTable);
      }
      if (url.includes("/api/sidebets/0x0000000000000000000000000000000000000001/42")) {
        return jsonResponse({
          totalPool: "2500",
          seatTotals: {
            0: "1400",
            1: "1100",
          },
        });
      }
      if (url.includes("/api/leaderboard?metric=roi&period=24h")) {
        return jsonResponse({
          entries: [
            {
              tokenAddress: "0x1234567890abcdef1234567890abcdef12345678",
            },
          ],
        });
      }
      throw new Error(`Unhandled fetch in live mode scenario: ${url}`);
    });

    const { LiveDashboard } = await import("../../app/live/LiveDashboard");

    await act(async () => {
      render(<LiveDashboard mode="grid" streamMode />);
    });

    await waitFor(() => expect(screen.getByText("Grid View")).toBeTruthy(), { timeout: 3000 });

    expect(screen.getByText("Stream Mode")).toBeTruthy();
    expect(screen.getByText("Multi-table monitor")).toBeTruthy();
    expect(screen.getAllByText(/Open table/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Embed/i).length).toBeGreaterThan(0);
  });

  it("covers the create-agent wizard against the real indexer table shape", async () => {
    vi.stubEnv("NEXT_PUBLIC_FLEET_URL", "https://fleet.test");

    installFetchMock(async (url, init) => {
      if (url.endsWith("/api/tables")) {
        return jsonResponse([
          {
            ...liveTable,
            currentHand: null,
            currentHandId: "7",
            gameState: "WAITING_FOR_SEATS",
            seats: [
              {
                seatIndex: 0,
                ownerAddress: liveTable.seats[0].ownerAddress,
                operatorAddress: liveTable.seats[0].operatorAddress,
                stack: "1000",
                isActive: true,
                currentBet: "0",
                tokenAddress: null,
              },
            ],
          },
        ]);
      }

      if (url === "https://fleet.test/fleet/agents" && init?.method === "POST") {
        return jsonResponse({ agentId: "agent-123" }, 201);
      }

      throw new Error(`Unhandled fetch in create-agent scenario: ${url}`);
    });

    const page = await import("../../app/create-agent/page");
    const CreateAgentPage = page.default;

    await act(async () => {
      render(<CreateAgentPage />);
    });

    fireEvent.click(screen.getByRole("button", { name: /configure persona/i }));

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. serpent/i), {
      target: { value: "DeepShark" },
    });
    fireEvent.click(screen.getByRole("button", { name: /select table/i }));

    await waitFor(() => expect(screen.getByText(/1 seated · 8 open/i)).toBeTruthy(), {
      timeout: 3000,
    });

    fireEvent.click(screen.getByRole("button", { name: /deploy agent/i }));
    fireEvent.click(screen.getByRole("button", { name: /deploy agent/i }));

    await waitFor(() => expect(screen.getByText(/agent live!/i)).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByText(/Agent ID: agent-123/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /watch live/i })).toBeTruthy();
  });

  it("covers the table-detail Why? breakdown flow from the action log", async () => {
    const { ActionLog } = await import("../../app/table/[id]/ActionLog");

    await act(async () => {
      render(
        <ActionLog
          streetSections={[
            {
              street: "Turn",
              actions: [
                {
                  seatIndex: 0,
                  actionType: "RAISE",
                  amount: "120",
                  potAfter: "300",
                  blockNumber: "123",
                  txHash: "0xabc123",
                  endsStreet: false,
                  timestamp: "2026-04-09T00:00:00Z",
                  reasoning: "Pressure the capped range. Apply maximum fold equity.",
                  verified: true,
                  revealTxHash: "0xfeedbeef",
                  breakdown: {
                    handStrength: "Top pair, top kicker",
                    potOdds: "Need 31% equity",
                    evEstimate: "+EV raise",
                    opponentRead: "Villain over-folds vs pressure",
                    keyFactor: "Exploitative pressure",
                    confidence: 81,
                  },
                },
              ],
            },
          ]}
          seatByIndex={
            new Map([
              [
                0,
                {
                  seatIndex: 0,
                  ownerAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                  operatorAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                  stack: "1000",
                  isActive: true,
                  currentBet: "120",
                  tokenAddress: null,
                },
              ],
            ])
          }
          maxSeats={9}
          chipSymbol="RCHIP"
        />,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /show decision breakdown/i }));

    expect(screen.getByText("WHY THIS DECISION?")).toBeTruthy();
    expect(screen.getByText("Hand Strength")).toBeTruthy();
    expect(screen.getByText("Pot Odds")).toBeTruthy();
    expect(screen.getByText("Confidence")).toBeTruthy();
  });

  it("covers the on-chain verification flow for AI decisions", async () => {
    installFetchMock((url, init) => {
      if (url.includes("/api/audit/0x0000000000000000000000000000000000000001/42")) {
        return jsonResponse({
          tableAddress: "0x0000000000000000000000000000000000000001",
          handId: "42",
          decisions: [
            {
              seat_index: 0,
              reasoning_hash: `0x${"ab".repeat(32)}`,
              commit_tx_hash: `0x${"cd".repeat(32)}`,
              block_number: "123",
              verified: true,
            },
          ],
        });
      }

      if (url.endsWith("/api/audit/verify") && init?.method === "POST") {
        return jsonResponse({
          verified: true,
          reason: "Reasoning hash matches on-chain commitment.",
        });
      }

      throw new Error(`Unhandled fetch in verify scenario: ${url}`);
    });

    const page = await import("../../app/verify/page");
    const VerifyPage = page.default;

    await act(async () => {
      render(<VerifyPage />);
    });

    fireEvent.change(screen.getByPlaceholderText(/table address/i), {
      target: { value: "0x0000000000000000000000000000000000000001" },
    });
    fireEvent.change(screen.getByPlaceholderText(/hand id/i), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: /lookup/i }));

    await waitFor(() => expect(screen.getByText(/on-chain reasoning hash/i)).toBeTruthy(), {
      timeout: 3000,
    });

    fireEvent.change(screen.getByPlaceholderText(/paste the ai reasoning text here/i), {
      target: { value: "Pressure the capped range. Apply maximum fold equity." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => expect(screen.getByText(/all decisions verified/i)).toBeTruthy(), {
      timeout: 3000,
    });
    expect(screen.getByText(/reasoning hash matches on-chain commitment/i)).toBeTruthy();
  });

  it("covers the developer docs surface for REST and WS integration", async () => {
    const page = await import("../../app/docs/page");
    const DocsPage = page.default;

    await act(async () => {
      render(<DocsPage />);
    });

    expect(screen.getAllByText("Developer Docs").length).toBeGreaterThan(0);
    expect(screen.getByText("REST Endpoints")).toBeTruthy();
    expect(screen.getByText("WebSocket Stream")).toBeTruthy();
    expect(screen.getAllByText(/\/api\/tables/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\/ws\/tables\/0/)).toBeTruthy();
  });
});
