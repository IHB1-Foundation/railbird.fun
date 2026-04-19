// @vitest-environment jsdom
/**
 * Tests for IWKBridge — verifies that the component writes the IWK handle
 * into the module-level store in interwoven.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// Mock @initia/interwovenkit-react before importing the bridge
const mockIWKHandle = {
  isConnected: true,
  hexAddress: "0xdeadbeef00000000000000000000000000000001",
  address: "init1abc",
  initiaAddress: "init1abc",
  openConnect: vi.fn(),
  disconnect: vi.fn(),
  username: null,
  autoSign: {
    isLoading: false,
    enable: vi.fn(),
    disable: vi.fn(),
    expiredAtByChain: {} as Record<string, Date | null | undefined>,
    isEnabledByChain: {} as Record<string, boolean>,
    granteeByChain: {} as Record<string, string | undefined>,
  },
  isOpen: false,
  openWallet: vi.fn(),
  openBridge: vi.fn(),
  openDeposit: vi.fn(),
  openWithdraw: vi.fn(),
  offlineSigner: {} as never,
  estimateGas: vi.fn(),
  simulateTx: vi.fn(),
  requestTxSync: vi.fn(),
  requestTxBlock: vi.fn(),
  submitTxSync: vi.fn(),
  submitTxBlock: vi.fn(),
  waitForTxConfirmation: vi.fn(),
};

vi.mock("@initia/interwovenkit-react", () => ({
  useInterwovenKit: () => mockIWKHandle,
}));

import { IWKBridge } from "@/lib/wallet/IWKBridge";
import { getIWKHandle, setIWKHandle } from "@/lib/wallet/interwoven";

beforeEach(() => {
  setIWKHandle(null);
});

describe("IWKBridge", () => {
  it("writes the IWK handle into the store on mount", () => {
    expect(getIWKHandle()).toBeNull();
    render(<IWKBridge />);
    const handle = getIWKHandle();
    expect(handle).not.toBeNull();
    expect(handle?.isConnected).toBe(true);
    expect(handle?.hexAddress).toBe("0xdeadbeef00000000000000000000000000000001");
  });

  it("clears the store handle on unmount", () => {
    const { unmount } = render(<IWKBridge />);
    expect(getIWKHandle()).not.toBeNull();
    unmount();
    expect(getIWKHandle()).toBeNull();
  });

  it("exposes autoSign methods on the stored handle", () => {
    render(<IWKBridge />);
    const handle = getIWKHandle();
    expect(typeof handle?.autoSign.enable).toBe("function");
    expect(typeof handle?.autoSign.disable).toBe("function");
  });
});
