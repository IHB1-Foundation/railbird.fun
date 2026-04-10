// Chain client for keeper bot operations

import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  keccak256,
  parseAbiItem,
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

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { type: "address", name: "spender" },
      { type: "uint256", name: "amount" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export { GameState };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
const HOLE_CARD_VRF_LOG_LOOKBACK = BigInt(process.env.HOLE_CARD_VRF_LOG_LOOKBACK || "200000");
const RANDOMNESS_FULFILLED_EVENT = parseAbiItem(
  "event RandomnessFulfilled(uint256 indexed requestId, address indexed table, uint256 randomness)"
);

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

  async getDealerAddress(): Promise<Address> {
    const dealer = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "dealer",
    });
    return dealer as Address;
  }

  async getAdminAddress(): Promise<Address> {
    const admin = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "admin",
    });
    return admin as Address;
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
    ]);

    let canStartHand = false;
    try {
      const result = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "canStartHand",
      });
      canStartHand = result as boolean;
    } catch {
      // Some deployed table versions do not expose a stable canStartHand()
      // view. Fall back to the on-chain startHand() preconditions that are
      // readable off-chain so the keeper can still start ready tables.
      canStartHand = await this.deriveCanStartHand((gameStateRaw as number) as GameState);
    }

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

  private async deriveCanStartHand(gameState: GameState): Promise<boolean> {
    if (gameState !== GameState.WAITING_FOR_SEATS && gameState !== GameState.SETTLED) {
      return false;
    }

    try {
      const [numSeatsRaw, pausedRaw] = await Promise.all([
        this.publicClient.readContract({
          address: this.pokerTableAddress,
          abi: POKER_TABLE_ABI,
          functionName: "numSeats",
        }),
        this.publicClient.readContract({
          address: this.pokerTableAddress,
          abi: POKER_TABLE_ABI,
          functionName: "paused",
        }),
      ]);

      if (pausedRaw as boolean) {
        return false;
      }

      const numSeats = Number(numSeatsRaw);
      const seats = await Promise.all(
        Array.from({ length: numSeats }, (_, seatIndex) => this.getSeat(seatIndex))
      );

      const playableSeatCount = seats.filter(
        (seat) => seat.owner !== ZERO_ADDRESS && seat.stack > 0n
      ).length;

      return playableSeatCount >= 2;
    } catch {
      return false;
    }
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

  async setDealer(dealer: Address): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "setDealer",
        args: [dealer],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async advanceToPreflop(): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "advanceToPreflop",
        args: [],
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

  // ── Auto buy-in methods ──────────────────────────────────────────────────────

  async getMaxSeats(): Promise<number> {
    const result = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "MAX_SEATS",
    });
    return Number(result);
  }

  async getSeat(seatIndex: number): Promise<Seat> {
    try {
      const result = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "getSeat",
        args: [seatIndex],
      }) as { owner: Address; operator: Address; stack: bigint; isActive: boolean; currentBet: bigint; isAllIn: boolean; totalHandBet: bigint };
      return result as Seat;
    } catch {
      const result = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "seats",
        args: [BigInt(seatIndex)],
      }) as readonly [Address, Address, bigint, boolean, bigint, boolean, bigint];
      const [owner, operator, stack, isActive, currentBet, isAllIn, totalHandBet] = result;
      return { owner, operator, stack, isActive, currentBet, isAllIn, totalHandBet };
    }
  }

  async getChipToken(): Promise<Address> {
    const result = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "chipToken",
    });
    return result as Address;
  }

  async getBigBlind(): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "bigBlind",
    });
    return result as bigint;
  }

  async getHoleCardVrfRandomness(handId: bigint): Promise<bigint> {
    const randomnessHash = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "holeCardVRFRandomnessHash",
      args: [handId],
    });
    if (randomnessHash === ZERO_BYTES32) {
      return 0n;
    }

    const vrfAdapter = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "vrfAdapter",
    }) as Address;

    if (vrfAdapter === ZERO_ADDRESS) {
      throw new Error("VRF adapter is not configured for this table");
    }

    const latestBlock = await this.publicClient.getBlockNumber();
    const fromBlock =
      latestBlock > HOLE_CARD_VRF_LOG_LOOKBACK
        ? latestBlock - HOLE_CARD_VRF_LOG_LOOKBACK
        : 0n;

    const fulfilledLogs = await this.publicClient.getLogs({
      address: vrfAdapter,
      event: RANDOMNESS_FULFILLED_EVENT,
      args: { table: this.pokerTableAddress },
      fromBlock,
      toBlock: "latest",
    });

    for (const log of [...fulfilledLogs].reverse()) {
      const randomness = log.args.randomness;
      if (typeof randomness !== "bigint") {
        continue;
      }

      const candidateHash = keccak256(encodePacked(["uint256"], [randomness]));
      if (candidateHash.toLowerCase() === (randomnessHash as `0x${string}`).toLowerCase()) {
        return randomness;
      }
    }

    throw new Error(
      `Unable to resolve hole card VRF randomness for hand ${handId.toString()} within the last ${HOLE_CARD_VRF_LOG_LOOKBACK.toString()} blocks`
    );
  }

  async getEncryptionKey(seatIndex: number): Promise<`0x${string}`> {
    const result = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "getEncryptionKey",
      args: [seatIndex],
    });
    return result as `0x${string}`;
  }

  async approveChipToken(tokenAddress: Address, amount: bigint): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: tokenAddress,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [this.pokerTableAddress, amount],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async registerSeat(seatIndex: number, owner: Address, operator: Address, buyIn: bigint): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "registerSeat",
        args: [seatIndex, owner, operator, buyIn],
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
