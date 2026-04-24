// Chain client for interacting with PokerTable contract

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
import { GameState, NonceManager, POKER_TABLE_ABI } from "@playerco/shared";

export { GameState };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
// Verified with `forge inspect PokerTable storage-layout`.
const CURRENT_HAND_STORAGE_SLOT = 69n;
const CURRENT_HAND_POT_SLOT = 70n;
const CURRENT_HAND_CURRENT_BET_SLOT = 71n;
const CURRENT_HAND_PACKED_SLOT = 73n;

// Action type enum matching contract
export enum ActionType {
  FOLD = 0,
  CHECK = 1,
  CALL = 2,
  RAISE = 3,
}

export interface Seat {
  owner: Address;
  operator: Address;
  stack: bigint;
  isActive: boolean;
  currentBet: bigint;
  isAllIn: boolean;
  totalHandBet: bigint;
}

export interface HandInfo {
  handId: bigint;
  pot: bigint;
  currentBet: bigint;
  actorSeat: number;
  state: GameState;
}

export interface TableState {
  tableId: bigint;
  smallBlind: bigint;
  bigBlind: bigint;
  actionTimeout: bigint;
  gameState: GameState;
  currentHandId: bigint;
  buttonSeat: number;
  actionDeadline: bigint;
  lastActionBlock: bigint;
  seats: Seat[];
  hand: HandInfo;
  communityCards: number[];
}

export interface ChainClientConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  pokerTableAddress: Address;
  chainId?: number;
  /** Timeout for waitForTransactionReceipt in ms. Defaults to TX_TIMEOUT_MS env or 60_000. */
  txTimeoutMs?: number;
}

const DEFAULT_TX_TIMEOUT_MS = parseInt(process.env.TX_TIMEOUT_MS || "60000", 10);

export class ChainClient {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private account: Account;
  private pokerTableAddress: Address;
  private chain: Chain;
  private tableIdCache: bigint | null = null;
  private smallBlindCache: bigint | null = null;
  private bigBlindCache: bigint | null = null;
  private actionTimeoutCache: bigint | null = null;
  private maxSeatsCache: number | null = null;
  private txTimeoutMs: number;
  private nonceManager: NonceManager;

  constructor(config: ChainClientConfig) {
    const chainEnv = process.env.CHAIN_ENV ?? "local";
    const isLocal = chainEnv === "local";
    if (!config.chainId && !isLocal) {
      throw new Error(`CHAIN_ID is required when CHAIN_ENV=${chainEnv}`);
    }
    const chainName = process.env.CHAIN_NAME;
    if (!chainName && !isLocal) {
      throw new Error(`CHAIN_NAME is required when CHAIN_ENV=${chainEnv}`);
    }
    const nativeSymbol = process.env.NATIVE_SYMBOL;
    if (!nativeSymbol && !isLocal) {
      throw new Error(`NATIVE_SYMBOL is required when CHAIN_ENV=${chainEnv}`);
    }
    this.chain = {
      id: config.chainId || 31337,
      name: chainName || "Localhost",
      nativeCurrency: {
        name: process.env.NATIVE_CURRENCY_NAME || nativeSymbol || "ETH",
        symbol: nativeSymbol || "ETH",
        decimals: 18,
      },
      rpcUrls: {
        default: { http: [config.rpcUrl] },
      },
    };

    this.account = privateKeyToAccount(config.privateKey);
    this.pokerTableAddress = config.pokerTableAddress;
    this.txTimeoutMs = config.txTimeoutMs ?? DEFAULT_TX_TIMEOUT_MS;

    // T-1505: explicit 15s transport timeout; retry=0 (rpcRetry wrapper handles retries)
    const rpcTransport = http(config.rpcUrl, { timeout: 15_000, retryCount: 0 });

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: rpcTransport,
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: rpcTransport,
    });

    this.nonceManager = new NonceManager({
      getNonceFromChain: () =>
        this.publicClient.getTransactionCount({ address: this.account.address }),
    });
  }

  get address(): Address {
    return this.account.address;
  }

  private parseSeat(raw: unknown): Seat {
    if (Array.isArray(raw)) {
      const seatTuple = raw as unknown as readonly [
        Address,
        Address,
        bigint,
        boolean,
        bigint,
        boolean,
        bigint,
      ];
      return {
        owner: seatTuple[0] ?? ZERO_ADDRESS,
        operator: seatTuple[1] ?? ZERO_ADDRESS,
        stack: seatTuple[2] ?? 0n,
        isActive: seatTuple[3] ?? false,
        currentBet: seatTuple[4] ?? 0n,
        isAllIn: seatTuple[5] ?? false,
        totalHandBet: seatTuple[6] ?? 0n,
      };
    }

    const seatData = raw as Partial<{
      owner: Address;
      operator: Address;
      stack: bigint;
      isActive: boolean;
      currentBet: bigint;
      isAllIn: boolean;
      totalHandBet: bigint;
    }>;
    return {
      owner: seatData.owner ?? ZERO_ADDRESS,
      operator: seatData.operator ?? ZERO_ADDRESS,
      stack: seatData.stack ?? 0n,
      isActive: seatData.isActive ?? false,
      currentBet: seatData.currentBet ?? 0n,
      isAllIn: seatData.isAllIn ?? false,
      totalHandBet: seatData.totalHandBet ?? 0n,
    };
  }

  private createEmptySeat(): Seat {
    return {
      owner: ZERO_ADDRESS,
      operator: ZERO_ADDRESS,
      stack: 0n,
      isActive: false,
      currentBet: 0n,
      isAllIn: false,
      totalHandBet: 0n,
    };
  }

  private createEmptyHandInfo(gameState: GameState, currentHandId: bigint): HandInfo {
    return {
      handId: currentHandId,
      pot: 0n,
      currentBet: 0n,
      actorSeat: 0,
      state: gameState,
    };
  }

  private hasLiveHandState(gameState: GameState, currentHandId: bigint): boolean {
    if (currentHandId <= 0n) return false;
    return ![GameState.WAITING_FOR_SEATS, GameState.SETTLED, GameState.TOURNAMENT_OVER].includes(
      gameState,
    );
  }

  private async readStorageWord(slot: bigint): Promise<bigint> {
    const value = await this.publicClient.getStorageAt({
      address: this.pokerTableAddress,
      slot: `0x${slot.toString(16)}`,
    });
    return value ? BigInt(value) : 0n;
  }

  private async getHandInfoFromStorage(
    gameState: GameState,
    currentHandId: bigint,
  ): Promise<HandInfo> {
    if (!this.hasLiveHandState(gameState, currentHandId)) {
      return this.createEmptyHandInfo(gameState, currentHandId);
    }

    const [storedHandId, pot, currentBet, packed] = await Promise.all([
      this.readStorageWord(CURRENT_HAND_STORAGE_SLOT),
      this.readStorageWord(CURRENT_HAND_POT_SLOT),
      this.readStorageWord(CURRENT_HAND_CURRENT_BET_SLOT),
      this.readStorageWord(CURRENT_HAND_PACKED_SLOT),
    ]);

    return {
      handId: storedHandId > 0n ? storedHandId : currentHandId,
      pot,
      currentBet,
      actorSeat: Number(packed & 0xffn),
      state: gameState,
    };
  }

  private async getHandInfoWithFallback(
    gameState: GameState,
    currentHandId: bigint,
  ): Promise<HandInfo> {
    try {
      const handInfo = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "getHandInfo",
      });

      return {
        handId: (handInfo as readonly [bigint, bigint, bigint, number, number])[0],
        pot: (handInfo as readonly [bigint, bigint, bigint, number, number])[1],
        currentBet: (handInfo as readonly [bigint, bigint, bigint, number, number])[2],
        actorSeat: Number((handInfo as readonly [bigint, bigint, bigint, number, number])[3]),
        state: (handInfo as readonly [bigint, bigint, bigint, number, number])[4] as GameState,
      };
    } catch {
      try {
        const currentHand = await this.publicClient.readContract({
          address: this.pokerTableAddress,
          abi: POKER_TABLE_ABI,
          functionName: "currentHand",
        });

        const hand = currentHand as readonly [
          bigint,
          bigint,
          bigint,
          bigint,
          number,
          number,
          number,
          number,
        ];
        return {
          handId: hand[0],
          pot: hand[1],
          currentBet: hand[2],
          actorSeat: Number(hand[4]),
          state: gameState,
        };
      } catch {
        // Some live deployments omit helper views entirely. Fall back to the
        // currentHand storage slots so turn detection still works on testnet.
        return this.getHandInfoFromStorage(gameState, currentHandId);
      }
    }
  }

  private async getCommunityCardsWithFallback(): Promise<number[]> {
    try {
      const communityCards = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "getCommunityCards",
      });
      return (communityCards as readonly number[]).map(Number);
    } catch {
      const communityCards = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          this.publicClient.readContract({
            address: this.pokerTableAddress,
            abi: POKER_TABLE_ABI,
            functionName: "communityCards",
            args: [BigInt(index)],
          }),
        ),
      );
      return communityCards.map((card) => Number(card));
    }
  }

  private async getButtonSeatWithFallback(): Promise<number> {
    try {
      const buttonSeat = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "buttonSeat",
      });
      return Number(buttonSeat);
    } catch {
      return 0;
    }
  }

  private async getSeatWithFallback(seatIndex: number): Promise<Seat> {
    try {
      const seat = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "getSeat",
        args: [seatIndex],
      });
      return this.parseSeat(seat);
    } catch {
      const seat = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "seats",
        args: [BigInt(seatIndex)],
      });
      return this.parseSeat(seat);
    }
  }

  private async getActionStateWithFallback(seatIndex: number): Promise<{
    handCurrentBet: bigint;
    seatCurrentBet: bigint;
  }> {
    const [gameStateRaw, currentHandId, seat] = await Promise.all([
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
      this.getSeatWithFallback(seatIndex),
    ]);

    const hand = await this.getHandInfoWithFallback(
      gameStateRaw as number as GameState,
      currentHandId as bigint,
    );
    return {
      handCurrentBet: hand.currentBet,
      seatCurrentBet: seat.currentBet,
    };
  }

  private async ensureStaticState(): Promise<void> {
    if (
      this.tableIdCache !== null &&
      this.smallBlindCache !== null &&
      this.bigBlindCache !== null &&
      this.actionTimeoutCache !== null &&
      this.maxSeatsCache !== null
    ) {
      return;
    }

    const [tableId, smallBlind, bigBlind, actionTimeout, maxSeats] = await Promise.all([
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "tableId",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "smallBlind",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "bigBlind",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "ACTION_TIMEOUT",
      }),
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "MAX_SEATS",
      }),
    ]);

    this.tableIdCache = tableId as bigint;
    this.smallBlindCache = smallBlind as bigint;
    this.bigBlindCache = bigBlind as bigint;
    this.actionTimeoutCache = actionTimeout as bigint;
    this.maxSeatsCache = Number(maxSeats);
  }

  async getTableState(_mySeatIndex: number | null = null): Promise<TableState> {
    await this.ensureStaticState();

    const [gameStateRaw, currentHandId, actionDeadline, lastActionBlock, buttonSeat] =
      await Promise.all([
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
        this.getButtonSeatWithFallback(),
      ]);

    const gameState = gameStateRaw as number as GameState;
    const [handInfo, communityCards] = await Promise.all([
      this.getHandInfoWithFallback(gameState, currentHandId as bigint),
      this.getCommunityCardsWithFallback(),
    ]);

    const seats = await Promise.all(
      Array.from({ length: this.maxSeatsCache! }, (_, i) => this.getSeatWithFallback(i)),
    );

    return {
      tableId: this.tableIdCache!,
      smallBlind: this.smallBlindCache!,
      bigBlind: this.bigBlindCache!,
      actionTimeout: this.actionTimeoutCache!,
      gameState,
      currentHandId: currentHandId as bigint,
      buttonSeat,
      actionDeadline: actionDeadline as bigint,
      lastActionBlock: lastActionBlock as bigint,
      seats,
      hand: handInfo,
      communityCards,
    };
  }

  async canCheck(seatIndex: number): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "canCheck",
        args: [seatIndex],
      });
      return result as boolean;
    } catch {
      const { handCurrentBet, seatCurrentBet } = await this.getActionStateWithFallback(seatIndex);
      return handCurrentBet <= seatCurrentBet;
    }
  }

  async getAmountToCall(seatIndex: number): Promise<bigint> {
    try {
      const result = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "getAmountToCall",
        args: [seatIndex],
      });
      return result as bigint;
    } catch {
      const { handCurrentBet, seatCurrentBet } = await this.getActionStateWithFallback(seatIndex);
      return handCurrentBet > seatCurrentBet ? handCurrentBet - seatCurrentBet : 0n;
    }
  }

  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  async getBlockTimestamp(): Promise<bigint> {
    const block = await this.publicClient.getBlock();
    return block.timestamp;
  }

  // Actions
  async fold(seatIndex: number): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "fold",
        args: [seatIndex],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async check(seatIndex: number): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "check",
        args: [seatIndex],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async call(seatIndex: number): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "call",
        args: [seatIndex],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  async raise(seatIndex: number, raiseToAmount: bigint): Promise<Hash> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "raise",
        args: [seatIndex, raiseToAmount],
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

  /**
   * Register the agent's ECIES encryption public key for a seat.
   * Skips the transaction if the same key is already registered.
   */
  async registerEncryptionKey(seatIndex: number, pubKey: Uint8Array): Promise<Hash | null> {
    const ENCRYPTION_ABI = [
      {
        name: "getEncryptionKey",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "seatIndex", type: "uint8" }],
        outputs: [{ type: "bytes" }],
      },
      {
        name: "registerEncryptionKey",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "seatIndex", type: "uint8" },
          { name: "pubKey", type: "bytes" },
        ],
        outputs: [],
      },
    ] as const;

    let existing: `0x${string}` | null = null;
    try {
      existing = (await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: ENCRYPTION_ABI,
        functionName: "getEncryptionKey",
        args: [seatIndex],
      })) as `0x${string}`;
    } catch {
      // Legacy table deployments may not expose encryption key views reliably.
      // Off-chain ownerview registration is enough for dealing, so skip on-chain sync.
      return null;
    }

    const newKeyHex =
      "0x" +
      Array.from(pubKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    if (existing && existing !== "0x" && existing.toLowerCase() === newKeyHex.toLowerCase()) {
      return null; // already registered
    }

    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: ENCRYPTION_ABI,
        functionName: "registerEncryptionKey",
        args: [seatIndex, newKeyHex as `0x${string}`],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash;
    });
  }

  // Find agent's seat index based on operator address
  findMySeat(state: TableState): number | null {
    for (let i = 0; i < state.seats.length; i++) {
      if (
        state.seats[i].operator.toLowerCase() === this.address.toLowerCase() ||
        state.seats[i].owner.toLowerCase() === this.address.toLowerCase()
      ) {
        return i;
      }
    }
    return null;
  }

  isMyTurn(state: TableState): boolean {
    const mySeat = this.findMySeat(state);
    if (mySeat === null) return false;
    return state.hand.actorSeat === mySeat;
  }

  isBettingState(state: GameState): boolean {
    return (
      state === GameState.BETTING_PRE ||
      state === GameState.BETTING_FLOP ||
      state === GameState.BETTING_TURN ||
      state === GameState.BETTING_RIVER
    );
  }

  /**
   * Commit an AI decision hash on-chain before submitting the action.
   * commitHash = keccak256(abi.encode(handId, seatIndex, action, reasoning, salt))
   * Returns the tx hash, or null if the call reverts (non-fatal).
   */
  async commitDecision(
    seatIndex: number,
    commitHash: `0x${string}`,
    reasoningHash?: `0x${string}`,
  ): Promise<string | null> {
    const ZERO_BYTES32 =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "commitDecision",
        args: [seatIndex, commitHash, reasoningHash ?? ZERO_BYTES32],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash as string;
    });
  }

  /**
   * Reveal a previously committed AI decision after the hand is settled.
   * Returns the tx hash.
   */
  async revealDecision(
    handId: bigint,
    seatIndex: number,
    action: string,
    reasoning: string,
    salt: `0x${string}`,
  ): Promise<string> {
    return this.nonceManager.withNonce(async (nonce) => {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "revealDecision",
        args: [handId, seatIndex, action, reasoning, salt],
        nonce,
      });
      await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
      return hash as string;
    });
  }
}
