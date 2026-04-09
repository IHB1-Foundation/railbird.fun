// Chain client for keeper bot operations

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Account,
  type Address,
  type Chain,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GameState, NonceManager, POKER_TABLE_ABI, PLAYER_VAULT_ABI, SIDE_BET_POOL_ABI } from "@playerco/shared";

// Minimal ERC20 ABI for reading token balances (treasury shares)
const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export { GameState };

export interface Seat {
  owner: Address;
  operator: Address;
  stack: bigint;
  isActive: boolean;
  currentBet: bigint;
  isAllIn: boolean;
  totalHandBet: bigint;
}

export interface TableState {
  gameState: GameState;
  currentHandId: bigint;
  actionDeadline: bigint;
  lastActionBlock: bigint;
  pendingVRFRequestId: bigint;
  vrfRequestTimestamp: bigint;
  canStartHand: boolean;
}

export interface ChainClientConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  pokerTableAddress: Address;
  vaultAddress?: Address;
  chainId?: number;
  /** Timeout for waitForTransactionReceipt in ms. Defaults to TX_TIMEOUT_MS env or 60_000. */
  txTimeoutMs?: number;
}

export interface RebalanceStatus {
  canRebalance: boolean;
  currentHandId: bigint;
  lastRebalancedHandId: bigint;
  rebalanceEligibleBlock: bigint;
  blocksRemaining: bigint;
}

const DEFAULT_TX_TIMEOUT_MS = parseInt(process.env.TX_TIMEOUT_MS || "60000", 10);

export class ChainClient {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private account: Account;
  private pokerTableAddress: Address;
  private vaultAddress: Address | null;
  private chain: Chain;
  private tableIdCache: bigint | null = null;
  private txTimeoutMs: number;
  private nonceManager: NonceManager;

  constructor(config: ChainClientConfig) {
    this.chain = {
      id: config.chainId || 133,
      name: process.env.CHAIN_NAME || "HashKey Chain Testnet",
      nativeCurrency: {
        name: process.env.NATIVE_CURRENCY_NAME || "HashKey",
        symbol: process.env.NATIVE_SYMBOL || "HSK",
        decimals: 18,
      },
      rpcUrls: {
        default: { http: [config.rpcUrl] },
      },
    };

    this.account = privateKeyToAccount(config.privateKey);
    this.pokerTableAddress = config.pokerTableAddress;
    this.vaultAddress = config.vaultAddress ?? null;
    this.txTimeoutMs = config.txTimeoutMs ?? DEFAULT_TX_TIMEOUT_MS;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(config.rpcUrl),
    });

    this.nonceManager = new NonceManager({
      getNonceFromChain: () =>
        this.publicClient.getTransactionCount({ address: this.account.address }),
    });
  }

  get address(): Address {
    return this.account.address;
  }

  async getTableId(): Promise<bigint> {
    if (this.tableIdCache !== null) {
      return this.tableIdCache;
    }
    const tableId = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "tableId",
    });
    this.tableIdCache = tableId as bigint;
    return this.tableIdCache;
  }

  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  async getBlockTimestamp(): Promise<bigint> {
    const block = await this.publicClient.getBlock();
    return block.timestamp;
  }

  async getTableState(): Promise<TableState> {
    const [
      gameStateRaw,
      currentHandId,
      actionDeadline,
      lastActionBlock,
      pendingVRFRequestId,
      vrfRequestTimestamp,
      canStartHand,
    ] = await Promise.all([
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "gameState",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "currentHandId",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "actionDeadline",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "lastActionBlock",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "pendingVRFRequestId",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "vrfRequestTimestamp",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "canStartHand",
      }),
    ]);

    return {
      gameState: (gameStateRaw as number) as GameState,
      currentHandId: currentHandId as bigint,
      actionDeadline: actionDeadline as bigint,
      lastActionBlock: lastActionBlock as bigint,
      pendingVRFRequestId: pendingVRFRequestId as bigint,
      vrfRequestTimestamp: vrfRequestTimestamp as bigint,
      canStartHand: canStartHand as boolean,
    };
  }

  async getHoleCommit(handId: bigint, seatIndex: number): Promise<`0x${string}`> {
    const result = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "holeCommits",
      args: [handId, seatIndex],
    });
    return result as `0x${string}`;
  }

  async isHoleCardsRevealed(handId: bigint, seatIndex: number): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "isHoleCardsRevealed",
      args: [handId, seatIndex],
    });
    return result as boolean;
  }

  // Keeper actions on PokerTable
  async forceTimeout(): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "forceTimeout",
        args: [],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async startHand(): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "startHand",
        args: [],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async settleShowdown(): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "settleShowdown",
        args: [],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async reRequestVRF(): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "reRequestVRF",
        args: [],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async reRequestHoleCardVRF(): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "reRequestHoleCardVRF",
        args: [],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async submitHoleCommit(handId: bigint, seatIndex: number, commitment: `0x${string}`): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "submitHoleCommit",
        args: [handId, seatIndex, commitment],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async revealHoleCards(
    handId: bigint,
    seatIndex: number,
    card1: number,
    card2: number,
    salt: `0x${string}`
  ): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "revealHoleCards",
        args: [handId, seatIndex, card1, card2, salt],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  // ── Vault rebalancing methods ────────────────────────────────────────────────

  hasVault(): boolean {
    return this.vaultAddress !== null;
  }

  async getRebalanceStatus(): Promise<RebalanceStatus> {
    if (!this.vaultAddress) throw new Error("No vault address configured");
    const [lastSnapshotHandId, lastRebalanceHandId] = await Promise.all([
      this.publicClient.readContract({
        address: this.vaultAddress,
        abi: PLAYER_VAULT_ABI,
        functionName: "lastSnapshotHandId",
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: this.vaultAddress,
        abi: PLAYER_VAULT_ABI,
        functionName: "lastRebalanceHandId",
      }) as Promise<bigint>,
    ]);
    const canRebalance = lastSnapshotHandId > 0n && lastSnapshotHandId !== lastRebalanceHandId;
    return {
      canRebalance,
      currentHandId: lastSnapshotHandId,
      lastRebalancedHandId: lastRebalanceHandId,
      rebalanceEligibleBlock: 0n,
      blocksRemaining: 0n,
    };
  }

  async getVaultExternalAssets(): Promise<bigint> {
    if (!this.vaultAddress) throw new Error("No vault address configured");
    return this.publicClient.readContract({
      address: this.vaultAddress,
      abi: PLAYER_VAULT_ABI,
      functionName: "getExternalAssets",
    }) as Promise<bigint>;
  }

  async getVaultTreasuryShares(): Promise<bigint> {
    if (!this.vaultAddress) throw new Error("No vault address configured");
    const agentToken = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: PLAYER_VAULT_ABI,
      functionName: "agentToken",
    }) as Address;
    if (!agentToken || agentToken === "0x0000000000000000000000000000000000000000") {
      return 0n;
    }
    return this.publicClient.readContract({
      address: agentToken,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [this.vaultAddress],
    }) as Promise<bigint>;
  }

  async getVaultRebalanceMaxMonBps(): Promise<bigint> {
    if (!this.vaultAddress) throw new Error("No vault address configured");
    return this.publicClient.readContract({
      address: this.vaultAddress,
      abi: PLAYER_VAULT_ABI,
      functionName: "rebalanceMaxMonBps",
    }) as Promise<bigint>;
  }

  async getVaultRebalanceMaxTokenBps(): Promise<bigint> {
    if (!this.vaultAddress) throw new Error("No vault address configured");
    return this.publicClient.readContract({
      address: this.vaultAddress,
      abi: PLAYER_VAULT_ABI,
      functionName: "rebalanceMaxTokenBps",
    }) as Promise<bigint>;
  }

  async rebalanceBuy(handId: bigint, monAmount: bigint, minTokenOut: bigint): Promise<Hash> {
    if (!this.vaultAddress) throw new Error("No vault address configured");
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.vaultAddress as Address,
        abi: PLAYER_VAULT_ABI,
        functionName: "rebalanceBuy",
        args: [handId, monAmount, minTokenOut],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async rebalanceSell(handId: bigint, tokenAmount: bigint, minMonOut: bigint): Promise<Hash> {
    if (!this.vaultAddress) throw new Error("No vault address configured");
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.vaultAddress as Address,
        abi: PLAYER_VAULT_ABI,
        functionName: "rebalanceSell",
        args: [handId, tokenAmount, minMonOut],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  /** Settle a SideBetPool for a specific hand. */
  async settleSideBets(sideBetPoolAddress: Address, handId: bigint): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: sideBetPoolAddress,
        abi: SIDE_BET_POOL_ABI,
        functionName: "settleBets",
        args: [this.pokerTableAddress, handId],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  // Helper methods
  isBettingState(state: GameState): boolean {
    return (
      state === GameState.BETTING_PRE ||
      state === GameState.BETTING_FLOP ||
      state === GameState.BETTING_TURN ||
      state === GameState.BETTING_RIVER
    );
  }

  isVRFWaitingState(state: GameState): boolean {
    return (
      state === GameState.WAITING_VRF_FLOP ||
      state === GameState.WAITING_VRF_TURN ||
      state === GameState.WAITING_VRF_RIVER
    );
  }

  isHoleCardVRFWaitingState(state: GameState): boolean {
    return state === GameState.WAITING_VRF_HOLECARDS;
  }
}
