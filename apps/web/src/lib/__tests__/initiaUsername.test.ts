import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchInitUsername, formatInitAddress } from "../initiaUsername";

const BASE = "https://rest.testnet.initia.xyz";
const ADDR = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

function mockFetch(response: unknown, ok = true) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok,
    json: async () => response,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  // Clear module-level cache between tests by re-importing (simpler: we rely on TTL)
});

describe("fetchInitUsername", () => {
  it("returns username with .init suffix on success", async () => {
    mockFetch({ data: '"atlas"', gas_used: "5575", events: [] });
    const name = await fetchInitUsername(ADDR);
    expect(name).toBe("atlas.init");
  });

  it("does not double-append .init if the result already has it", async () => {
    mockFetch({ data: '"alice.init"', gas_used: "5575", events: [] });
    const name = await fetchInitUsername(ADDR + "1");
    expect(name).toBe("alice.init");
  });

  it("returns null on non-ok HTTP response (e.g. 404)", async () => {
    mockFetch({}, false);
    const name = await fetchInitUsername(ADDR + "2");
    expect(name).toBeNull();
  });

  it("returns null on empty data field (no username registered)", async () => {
    mockFetch({ data: null });
    const name = await fetchInitUsername(ADDR + "3");
    expect(name).toBeNull();
  });

  it("returns null on transport error without throwing", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("network error"));
    const name = await fetchInitUsername(ADDR + "4");
    expect(name).toBeNull();
  });

  it("calls the Move view-function endpoint, not the old REST path", async () => {
    const spy = mockFetch({ data: '"bob"' });
    await fetchInitUsername(ADDR + "5");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/initia/move/v1/view/json`);
    expect((init as RequestInit).method).toBe("POST");
  });
});

describe("formatInitAddress", () => {
  it("returns the .init name when available", () => {
    expect(formatInitAddress(ADDR, "alice.init")).toBe("alice.init");
  });

  it("returns shortened address when name is null", () => {
    const result = formatInitAddress(ADDR, null);
    expect(result).toMatch(/^0xf39f/);
    expect(result).toContain("…");
  });
});
