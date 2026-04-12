/**
 * Integration test harness for Railbird bot tests.
 *
 * Provides helpers to:
 * - Spin up an Anvil instance on an ephemeral port
 * - Deploy contracts using forge
 * - Register seats
 * - Start ownerview, keeper, and agent bots as child processes
 * - Wait for chain state conditions (handId, gameState)
 * - Tear down all processes cleanly
 *
 * Usage:
 *   const h = new TestHarness({ numSeats: 2, actionTimeoutSecs: 30 });
 *   await h.setup();
 *   // ... run test ...
 *   await h.teardown();
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createPublicClient, http, parseAbi } from "viem";
import { localhost } from "viem/chains";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

const ROOT_DIR = path.resolve(__dirname, "../../../../..");

// Anvil deterministic test accounts
export const DEPLOYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const DEPLOYER_ADDR =
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export const AGENT_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
];
export const AGENT_ADDRS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
];
export const KEEPER_KEY =
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";

const TABLE_ABI = parseAbi([
  "function currentHandId() view returns (uint256)",
  "function gameState() view returns (uint8)",
  "function canStartHand() view returns (bool)",
  "function startHand() external",
  "function forceTimeout() external",
]);

const VRF_ABI = parseAbi([
  "function lastRequestId() view returns (uint256)",
  "function fulfillRandomness(uint256 requestId, uint256 randomness) external",
  "function setConsumer(address consumer) external",
]);

const ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

export interface HarnessOptions {
  numSeats?: number;
  actionTimeoutSecs?: number;
  vrfTimeoutSecs?: number;
  ownerviewPort?: number;
  anvilPort?: number;
}

export class TestHarness {
  readonly numSeats: number;
  readonly actionTimeoutSecs: number;
  readonly vrfTimeoutSecs: number;
  readonly ownerviewPort: number;
  readonly anvilPort: number;

  rpcUrl: string = "";
  tableAddr: string = "";
  vrfAddr: string = "";
  chipAddr: string = "";
  ownerviewUrl: string = "";

  private procs: ChildProcess[] = [];
  private anvilProc: ChildProcess | null = null;

  constructor(opts: HarnessOptions = {}) {
    this.numSeats = opts.numSeats ?? 2;
    this.actionTimeoutSecs = opts.actionTimeoutSecs ?? 120;
    this.vrfTimeoutSecs = opts.vrfTimeoutSecs ?? 60;
    this.ownerviewPort = opts.ownerviewPort ?? 19099;
    this.anvilPort = opts.anvilPort ?? 19545;
    this.rpcUrl = `http://127.0.0.1:${this.anvilPort}`;
    this.ownerviewUrl = `http://127.0.0.1:${this.ownerviewPort}`;
  }

  /** Check if required tools are available. Returns false to skip tests if not. */
  static isAvailable(): boolean {
    try {
      execSync("forge --version", { stdio: "ignore" });
      execSync("anvil --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  async setup(): Promise<void> {
    await this._startAnvil();
    await this._deployContracts();
    await this._registerSeats();
  }

  async teardown(): Promise<void> {
    for (const p of this.procs) {
      try { p.kill("SIGKILL"); } catch { /* ignore */ }
    }
    if (this.anvilProc) {
      try { this.anvilProc.kill("SIGKILL"); } catch { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // ── Chain helpers ──────────────────────────────────────────────────────────

  private _client() {
    return createPublicClient({
      chain: { ...localhost, id: 31337 },
      transport: http(this.rpcUrl),
    });
  }

  async getHandId(): Promise<bigint> {
    const client = this._client();
    return client.readContract({
      address: this.tableAddr as `0x${string}`,
      abi: TABLE_ABI,
      functionName: "currentHandId",
    });
  }

  async getGameState(): Promise<number> {
    const client = this._client();
    const state = await client.readContract({
      address: this.tableAddr as `0x${string}`,
      abi: TABLE_ABI,
      functionName: "gameState",
    });
    return Number(state);
  }

  async waitForHandId(targetHandId: bigint, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const id = await this.getHandId().catch(() => 0n);
      if (id > targetHandId) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    const final = await this.getHandId().catch(() => 0n);
    if (final <= targetHandId) {
      throw new Error(
        `waitForHandId: timed out after ${timeoutMs}ms. current=${final}, target>${targetHandId}`
      );
    }
  }

  async waitForGameState(
    targetState: number,
    timeoutMs = 60_000
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = await this.getGameState().catch(() => -1);
      if (s === targetState) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    const final = await this.getGameState().catch(() => -1);
    if (final !== targetState) {
      throw new Error(
        `waitForGameState: timed out. current=${final}, target=${targetState}`
      );
    }
  }

  // ── Process launchers ──────────────────────────────────────────────────────

  startOwnerView(): ChildProcess {
    const p = spawn(
      "node",
      ["--import", "tsx", `${ROOT_DIR}/services/ownerview/src/index.ts`],
      {
        env: {
          ...process.env,
          JWT_SECRET: "integration-test-secret-key-min-32-chars",
          RPC_URL: this.rpcUrl,
          POKER_TABLE_ADDRESSES: this.tableAddr,
          CHAIN_ENV: "local",
          PORT: String(this.ownerviewPort),
          NODE_ENV: "test",
        },
      }
    );
    this.procs.push(p);
    return p;
  }

  startKeeper(): ChildProcess {
    const p = spawn(
      "node",
      ["--import", "tsx", `${ROOT_DIR}/bots/keeper/src/index.ts`],
      {
        env: {
          ...process.env,
          RPC_URL: this.rpcUrl,
          KEEPER_PRIVATE_KEY: KEEPER_KEY,
          POKER_TABLE_ADDRESS: this.tableAddr,
          CHAIN_ID: "31337",
          POLL_INTERVAL_MS: "300",
          NODE_ENV: "test",
        },
      }
    );
    this.procs.push(p);
    return p;
  }

  startAgent(seatIndex: number, maxHands = 1): ChildProcess {
    const p = spawn(
      "node",
      ["--import", "tsx", `${ROOT_DIR}/bots/agent/src/index.ts`],
      {
        env: {
          ...process.env,
          RPC_URL: this.rpcUrl,
          OPERATOR_PRIVATE_KEY: AGENT_KEYS[seatIndex],
          POKER_TABLE_ADDRESS: this.tableAddr,
          OWNERVIEW_URL: this.ownerviewUrl,
          CHAIN_ID: "31337",
          POLL_INTERVAL_MS: "300",
          MAX_HANDS: String(maxHands),
          TURN_ACTION_DELAY_MS: "0",
          NODE_ENV: "test",
        },
      }
    );
    this.procs.push(p);
    return p;
  }

  async waitForOwnerView(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(
          `${this.ownerviewUrl}/auth/nonce?address=0x0000000000000000000000000000000000000000`,
          { signal: AbortSignal.timeout(1000) }
        );
        if (res.ok || res.status === 400) return; // 400 = nonce endpoint requires valid address
      } catch { /* not ready yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`OwnerView did not start within ${timeoutMs}ms`);
  }

  // ── Private setup helpers ──────────────────────────────────────────────────

  private async _startAnvil(): Promise<void> {
    this.anvilProc = spawn("anvil", [
      "--host", "127.0.0.1",
      "--port", String(this.anvilPort),
      "--block-time", "1",
    ]);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        const client = this._client();
        await client.getBlockNumber();
        return;
      } catch { /* not ready yet */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Anvil did not start on port ${this.anvilPort} within 15s`);
  }

  private _forge(args: string[]): string {
    return execSync(["forge", ...args].join(" "), {
      cwd: path.join(ROOT_DIR, "contracts"),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  private _cast(args: string[]): string {
    return execSync(["cast", ...args].join(" "), {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  private _deployOne(solidityPath: string, ctorArgs: string[]): string {
    const out = this._forge([
      "create", solidityPath,
      "--rpc-url", this.rpcUrl,
      "--private-key", DEPLOYER_KEY,
      "--json",
      ctorArgs.length ? `--constructor-args ${ctorArgs.join(" ")}` : "",
    ]);
    const parsed = JSON.parse(out);
    return parsed.deployedTo as string;
  }

  private async _deployContracts(): Promise<void> {
    this.vrfAddr = this._deployOne("src/mocks/MockVRFAdapter.sol:MockVRFAdapter", []);
    this.chipAddr = this._deployOne("src/ChipToken.sol:ChipToken", ['"IntChip"', '"INTCHIP"']);

    const chips = "1000000000000000000000000";
    for (const addr of AGENT_ADDRS) {
      this._cast(["send", this.chipAddr, `"mint(address,uint256)"`, addr, chips,
        "--rpc-url", this.rpcUrl, "--private-key", DEPLOYER_KEY]);
    }

    this.tableAddr = this._deployOne("src/PokerTable.sol:PokerTable", [
      "1",
      "1000000000000000000",
      "2000000000000000000",
      this.vrfAddr,
      this.chipAddr,
      "0x0000000000000000000000000000000000000000",
      String(this.actionTimeoutSecs),
      String(this.vrfTimeoutSecs),
      "120",
      String(this.numSeats),
      "0x0000000000000000000000000000000000000000",
    ]);

    this._cast(["send", this.vrfAddr, `"setConsumer(address)"`, this.tableAddr,
      "--rpc-url", this.rpcUrl, "--private-key", DEPLOYER_KEY]);
  }

  private async _registerSeats(): Promise<void> {
    const buyIn = "100000000000000000000";
    for (let i = 0; i < this.numSeats; i++) {
      this._cast(["send", this.chipAddr, `"approve(address,uint256)"`, this.tableAddr, buyIn,
        "--rpc-url", this.rpcUrl, "--private-key", AGENT_KEYS[i]]);
      this._cast(["send", this.tableAddr,
        `"registerSeat(uint8,address,address,uint256)"`,
        String(i), AGENT_ADDRS[i], AGENT_ADDRS[i], buyIn,
        "--rpc-url", this.rpcUrl, "--private-key", AGENT_KEYS[i]]);
    }
  }
}
