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
import { POKER_TABLE_ABI } from "./pokerTableAbi.js";
import { PLAYER_VAULT_ABI } from "./playerVaultAbi.js";

// Game state enum matching contract
export enum GameState {
  WAITING_FOR_SEATS = 0,
  HAND_INIT = 1,
  BETTING_PRE = 2,
  WAITING_VRF_FLOP = 3,
  BETTING_FLOP = 4,
  WAITING_VRF_TURN = 5,
  BETTING_TURN = 6,
  WAITING_VRF_RIVER = 7,
  BETTING_RIVER = 8,
  SHOWDOWN = 9,
  SETTLED = 10,
}

export interface Seat {
  owner: Address;
  operator: Address;
  stack: bigint;
  isActive: boolean;
  currentBet: bigint;
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

export interface RebalanceStatus {
  canRebalance: boolean;
  currentHandId: bigint;
  lastRebalancedHandId: bigint;
  rebalanceEligibleBlock: bigint;
  blocksRemaining: bigint;
}

export interface ChainClientConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  pokerTableAddress: Address;
  playerVaultAddress?: Address;
  chainId?: number;
}

export class ChainClient {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private account: Account;
  private pokerTableAddress: Address;
  private playerVaultAddress: Address | null;
  private chain: Chain;
  private tableIdCache: bigint | null = null;

  constructor(config: ChainClientConfig) {
    this.chain = {
      id: config.chainId || 31337,
      name: "Local",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: {
        default: { http: [config.rpcUrl] },
      },
    };

    this.account = privateKeyToAccount(config.privateKey);
    this.pokerTableAddress = config.pokerTableAddress;
    this.playerVaultAddress = config.playerVaultAddress || null;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(config.rpcUrl),
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
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "forceTimeout",
      args: [],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async startHand(): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "startHand",
      args: [],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async settleShowdown(): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "settleShowdown",
      args: [],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async reRequestVRF(): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "reRequestVRF",
      args: [],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async submitHoleCommit(handId: bigint, seatIndex: number, commitment: `0x${string}`): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "submitHoleCommit",
      args: [handId, seatIndex, commitment],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async revealHoleCards(
    handId: bigint,
    seatIndex: number,
    card1: number,
    card2: number,
    salt: `0x${string}`
  ): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "revealHoleCards",
      args: [handId, seatIndex, card1, card2, salt],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // Vault operations
  async getRebalanceStatus(): Promise<RebalanceStatus | null> {
    if (!this.playerVaultAddress) return null;

    const result = await this.publicClient.readContract({
      address: this.playerVaultAddress,
      abi: PLAYER_VAULT_ABI,
      functionName: "getRebalanceStatus",
    });

    const data = result as readonly [boolean, bigint, bigint, bigint, bigint];
    return {
      canRebalance: data[0],
      currentHandId: data[1],
      lastRebalancedHandId: data[2],
      rebalanceEligibleBlock: data[3],
      blocksRemaining: data[4],
    };
  }

  async getVaultStats(): Promise<{ navPerShare: bigint; externalAssets: bigint; treasuryShares: bigint } | null> {
    if (!this.playerVaultAddress) return null;

    const [navPerShare, externalAssets, treasuryShares] = await Promise.all([
      this.publicClient.readContract({
        address: this.playerVaultAddress,
        abi: PLAYER_VAULT_ABI,
        functionName: "getNavPerShare",
      }),
      this.publicClient.readContract({
        address: this.playerVaultAddress,
        abi: PLAYER_VAULT_ABI,
        functionName: "getExternalAssets",
      }),
      this.publicClient.readContract({
        address: this.playerVaultAddress,
        abi: PLAYER_VAULT_ABI,
        functionName: "getTreasuryShares",
      }),
    ]);

    return {
      navPerShare: navPerShare as bigint,
      externalAssets: externalAssets as bigint,
      treasuryShares: treasuryShares as bigint,
    };
  }

  async rebalanceBuy(monAmount: bigint, minTokenOut: bigint): Promise<Hash> {
    if (!this.playerVaultAddress) {
      throw new Error("PlayerVault address not configured");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.playerVaultAddress,
      abi: PLAYER_VAULT_ABI,
      functionName: "rebalanceBuy",
      args: [monAmount, minTokenOut],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async rebalanceSell(tokenAmount: bigint, minMonOut: bigint): Promise<Hash> {
    if (!this.playerVaultAddress) {
      throw new Error("PlayerVault address not configured");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.playerVaultAddress,
      abi: PLAYER_VAULT_ABI,
      functionName: "rebalanceSell",
      args: [tokenAmount, minMonOut],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
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
}
