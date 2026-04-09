// @vitest-environment jsdom
/**
 * Tests for useWebSocket reconnection logic, visibility-change handling,
 * and polling fallback.
 *
 * Covers T-M4-09.
 *
 * We use a MockWebSocket class to control the WS lifecycle from tests.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "../useWebSocket";

// ─── Minimal MockWebSocket ────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen:    ((ev: Event) => void)       | null = null;
  onclose:   ((ev: CloseEvent) => void)  | null = null;
  onmessage: ((ev: MessageEvent) => void)| null = null;
  onerror:   ((ev: Event) => void)       | null = null;
  readyState: number = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3; // CLOSED
  }

  /** Simulate a successful connection open. */
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event("open"));
  }

  /** Simulate a disconnection (server closed). */
  simulateClose() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }

  /** Simulate an incoming message. */
  simulateMessage(data: unknown) {
    const event = new MessageEvent("message", { data: JSON.stringify(data) });
    this.onmessage?.(event);
  }

  /** Simulate a malformed (non-JSON) message. */
  simulateMalformedMessage(raw: string) {
    const event = new MessageEvent("message", { data: raw });
    this.onmessage?.(event);
  }
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function latestWs(): MockWebSocket {
  return MockWebSocket.instances.at(-1)!;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useWebSocket — initial connection", () => {
  it("starts in connecting state", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({ tableId: "tbl1", onMessage })
    );
    expect(result.current.status).toBe("connecting");
  });

  it("transitions to connected after WS open", async () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({ tableId: "tbl1", onMessage })
    );
    await act(async () => {
      latestWs().simulateOpen();
    });
    expect(result.current.status).toBe("connected");
  });

  it("calls onMessage when a valid message arrives", async () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket({ tableId: "tbl2", onMessage }));
    await act(async () => {
      latestWs().simulateOpen();
    });
    await act(async () => {
      latestWs().simulateMessage({
        type: "table_update",
        tableId: "tbl2",
        timestamp: "2025-01-01T00:00:00Z",
        data: { pot: 100 },
      });
    });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0]).toMatchObject({ type: "table_update" });
  });

  it("ignores malformed (non-JSON) messages silently", async () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket({ tableId: "tbl3", onMessage }));
    await act(async () => {
      latestWs().simulateOpen();
    });
    await act(async () => {
      latestWs().simulateMalformedMessage("not valid json}}");
    });
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe("useWebSocket — reconnection", () => {
  it("reconnects after disconnect (reconnectCount < max)", async () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        tableId: "tbl4",
        onMessage,
        maxReconnectAttempts: 3,
        baseReconnectDelayMs: 100,
      })
    );

    await act(async () => {
      latestWs().simulateOpen();
    });
    expect(result.current.status).toBe("connected");

    // Simulate disconnect
    await act(async () => {
      latestWs().simulateClose();
    });
    expect(result.current.status).toBe("reconnecting");

    // Advance timers to trigger reconnect
    await act(async () => {
      vi.advanceTimersByTime(200); // 100ms * 2^0 = 100ms
    });
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to polling after maxReconnectAttempts", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "tbl5" }),
    });

    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        tableId: "tbl5",
        onMessage,
        maxReconnectAttempts: 2, // close 3 times without opening → polling
        baseReconnectDelayMs: 100,
        pollIntervalMs: 500,
      })
    );

    // Close WS without opening — count increments each time
    // Close #1: count 0 → 1, schedule 100ms timer
    await act(async () => { latestWs().simulateClose(); });
    await act(async () => { vi.advanceTimersByTime(150); }); // WS#2 created

    // Close #2: count 1 → 2, schedule 200ms timer
    await act(async () => { latestWs().simulateClose(); });
    await act(async () => { vi.advanceTimersByTime(250); }); // WS#3 created

    // Close #3: count 2 >= maxReconnectAttempts → startPolling
    await act(async () => { latestWs().simulateClose(); });
    await act(async () => {}); // flush state updates

    expect(result.current.status).toBe("polling");
  });

  it("resets reconnect counter after successful reconnection", async () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        tableId: "tbl6",
        onMessage,
        maxReconnectAttempts: 5,
        baseReconnectDelayMs: 100,
      })
    );

    // Connect, disconnect, reconnect, and confirm we're back to connected
    await act(async () => { latestWs().simulateOpen(); });
    await act(async () => { latestWs().simulateClose(); });
    await act(async () => { vi.advanceTimersByTime(200); });
    await act(async () => { latestWs().simulateOpen(); });

    expect(result.current.status).toBe("connected");
  });
});

describe("useWebSocket — polling fallback", () => {
  it("status is polling when WS constructor throws", async () => {
    vi.stubGlobal("WebSocket", () => {
      throw new Error("WS not supported");
    });

    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({ tableId: "tbl7", onMessage, pollIntervalMs: 500 })
    );

    // After React effects run
    await act(async () => {});
    expect(result.current.status).toBe("polling");
  });

  it("polling calls onMessage with poll_update type", async () => {
    vi.stubGlobal("WebSocket", () => { throw new Error("WS not supported"); });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "tbl8", seats: [] }),
    });

    const onMessage = vi.fn();
    renderHook(() =>
      useWebSocket({ tableId: "tbl8", onMessage, pollIntervalMs: 500 })
    );

    await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(600); });
    // Allow the async fetch inside poll to resolve
    await act(async () => {});

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "poll_update", tableId: "tbl8" })
    );
  });
});

describe("useWebSocket — exponential backoff formula", () => {
  it("delay doubles with each reconnect attempt", async () => {
    const onMessage = vi.fn();
    const BASE_DELAY = 100;

    renderHook(() =>
      useWebSocket({
        tableId: "tbl9",
        onMessage,
        maxReconnectAttempts: 10,
        baseReconnectDelayMs: BASE_DELAY,
      })
    );

    const wsCounts: number[] = [];

    // First connection
    await act(async () => { latestWs().simulateOpen(); });
    await act(async () => { latestWs().simulateClose(); });
    wsCounts.push(MockWebSocket.instances.length);

    // Advance by less than BASE_DELAY — no reconnect yet
    await act(async () => { vi.advanceTimersByTime(50); });
    expect(MockWebSocket.instances.length).toBe(wsCounts[0]); // no new WS yet

    // Advance past BASE_DELAY — first reconnect
    await act(async () => { vi.advanceTimersByTime(100); }); // total 150ms
    expect(MockWebSocket.instances.length).toBe(wsCounts[0] + 1);

    // Second disconnect
    await act(async () => { latestWs().simulateClose(); });
    const wsCountAfterSecond = MockWebSocket.instances.length;

    // Advance by BASE_DELAY*2 - 1 — no reconnect yet
    await act(async () => { vi.advanceTimersByTime(BASE_DELAY * 2 - 50); });
    expect(MockWebSocket.instances.length).toBe(wsCountAfterSecond);

    // Advance past BASE_DELAY*2 — second reconnect
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(MockWebSocket.instances.length).toBe(wsCountAfterSecond + 1);
  });
});
