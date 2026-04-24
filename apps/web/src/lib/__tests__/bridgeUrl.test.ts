import { describe, it, expect } from "vitest";
import { buildBridgeUrl, getRollupBridgeUrl } from "../bridgeUrl";

describe("buildBridgeUrl", () => {
  it("includes toChainId and toAddress params", () => {
    const url = buildBridgeUrl(12345, "0xAbCd");
    expect(url).toContain("toChainId=12345");
    expect(url).toContain("toAddress=0xAbCd");
    expect(url).toMatch(/^https:\/\/app\.initia\.xyz\/bridge\?/);
  });

  it("accepts string chain ID", () => {
    const url = buildBridgeUrl("99999", "0x1234");
    expect(url).toContain("toChainId=99999");
  });

  it("encodes special characters in toAddress", () => {
    const url = buildBridgeUrl(1, "0x1234/test");
    expect(url).toContain("toAddress=0x1234%2Ftest");
  });
});

describe("getRollupBridgeUrl", () => {
  it("returns null when NEXT_PUBLIC_CHAIN_ID is not set", () => {
    const saved = process.env.NEXT_PUBLIC_CHAIN_ID;
    delete process.env.NEXT_PUBLIC_CHAIN_ID;
    const result = getRollupBridgeUrl("0xabc");
    expect(result).toBeNull();
    process.env.NEXT_PUBLIC_CHAIN_ID = saved;
  });

  it("returns URL with configured chain ID when env is set", () => {
    process.env.NEXT_PUBLIC_CHAIN_ID = "42000";
    const result = getRollupBridgeUrl("0xvault");
    expect(result).toContain("toChainId=42000");
    expect(result).toContain("toAddress=0xvault");
    delete process.env.NEXT_PUBLIC_CHAIN_ID;
  });
});
