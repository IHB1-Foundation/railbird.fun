import { describe, it, expect, vi, afterEach } from "vitest";

// We test api.ts by intercepting globalThis.fetch

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  }));
}

describe("API client error handling", () => {
  it("throws an error when response is not ok (404)", async () => {
    mockFetch(404, {});
    const { getTable } = await import("../api");
    await expect(getTable("1")).rejects.toThrow("API error: 404");
  });

  it("throws an error when response is 500", async () => {
    mockFetch(500, {});
    const { getAgents } = await import("../api");
    await expect(getAgents()).rejects.toThrow("API error: 500");
  });

  it("returns paginated JSON on success", async () => {
    const paginated = { data: [{ id: "1", name: "Agent 1" }], total: 1, page: 1, limit: 20 };
    mockFetch(200, paginated);
    const { getAgents } = await import("../api");
    const result = await getAgents();
    expect(result).toEqual(paginated);
  });

  it("getAgentsByOwner encodes owner address in query param", async () => {
    mockFetch(200, []);
    const { getAgentsByOwner } = await import("../api");
    await getAgentsByOwner("0xABCD");
    const fetchMock = vi.mocked(globalThis.fetch);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("owner=0xABCD");
  });
});
