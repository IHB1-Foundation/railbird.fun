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
import { POKER_TABLE_ABI } from "./pokerTableAbi.js";

const MAX_SEATS = 9;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

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
  private txTimeoutMs: number;

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
  }

  get address(): Address {
    return this.account.address;
  }

  private parseSeat(raw: unknown): Seat {
    const seatData = raw as {
      owner: Address;
      operator: Address;
      stack: bigint;
      isActive: boolean;
      currentBet: bigint;
      isAllIn: boolean;
      totalHandBet: bigint;
    };
    return {
      owner: seatData.owner,
      operator: seatData.operator,
      stack: seatData.stack,
      isActive: seatData.isActive,
      currentBet: seatData.currentBet,
      isAllIn: seatData.isAllIn,
      totalHandBet: seatData.totalHandBet,
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

  private async ensureStaticState(): Promise<void> {
    if (
      this.tableIdCache !== null &&
      this.smallBlindCache !== null &&
      this.bigBlindCache !== null &&
      this.actionTimeoutCache !== null
    ) {
      return;
    }

    const [tableId, smallBlind, bigBlind, actionTimeout] = await Promise.all([
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
    ]);

    this.tableIdCache = tableId as bigint;
    this.smallBlindCache = smallBlind as bigint;
    this.bigBlindCache = bigBlind as bigint;
    this.actionTimeoutCache = actionTimeout as bigint;
  }

  async getTableState(mySeatIndex: number | null = null): Promise<TableState> {
    await this.ensureStaticState();

    const [
      gameStateRaw,
      currentHandId,
      actionDeadline,
      lastActionBlock,
      handInfo,
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
        functionName: "getHandInfo",
      }),
    ]);

    let seats: Seat[];
    if (mySeatIndex === null || mySeatIndex < 0 || mySeatIndex >= MAX_SEATS) {
      const seatResults = await Promise.all(
        Array.from({ length: MAX_SEATS }, (_, i) =>
          this.publicClient.readContract({
            address: this.pokerTableAddress,
            abi: POKER_TABLE_ABI,
            functionName: "getSeat",
            args: [i],
          })
        )
      );
      seats = seatResults.map((raw) => this.parseSeat(raw));
    } else {
      const mySeat = await this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "getSeat",
        args: [mySeatIndex],
      });
      seats = Array.from({ length: MAX_SEATS }, () => this.createEmptySeat());
      seats[mySeatIndex] = this.parseSeat(mySeat);
    }

    return {
      tableId: this.tableIdCache!,
      smallBlind: this.smallBlindCache!,
      bigBlind: this.bigBlindCache!,
      actionTimeout: this.actionTimeoutCache!,
      gameState: (gameStateRaw as number) as GameState,
      currentHandId: currentHandId as bigint,
      buttonSeat: 0,
      actionDeadline: actionDeadline as bigint,
      lastActionBlock: lastActionBlock as bigint,
      seats,
      hand: {
        handId: (handInfo as readonly [bigint, bigint, bigint, number, number])[0],
        pot: (handInfo as readonly [bigint, bigint, bigint, number, number])[1],
        currentBet: (handInfo as readonly [bigint, bigint, bigint, number, number])[2],
        actorSeat: (handInfo as readonly [bigint, bigint, bigint, number, number])[3],
        state: (handInfo as readonly [bigint, bigint, bigint, number, number])[4] as GameState,
      },
      communityCards: [],
    };
  }

  async canCheck(seatIndex: number): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "canCheck",
      args: [seatIndex],
    });
    return result as boolean;
  }

  async getAmountToCall(seatIndex: number): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "getAmountToCall",
      args: [seatIndex],
    });
    return result as bigint;
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
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "fold",
      args: [seatIndex],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
    return hash;
  }

  async check(seatIndex: number): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "check",
      args: [seatIndex],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
    return hash;
  }

  async call(seatIndex: number): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "call",
      args: [seatIndex],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
    return hash;
  }

  async raise(seatIndex: number, raiseToAmount: bigint): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "raise",
      args: [seatIndex, raiseToAmount],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
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
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
    return hash;
  }

  async forceTimeout(): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: POKER_TABLE_ABI,
      functionName: "forceTimeout",
      args: [],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
    return hash;
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

    const existing = await this.publicClient.readContract({
      address: this.pokerTableAddress,
      abi: ENCRYPTION_ABI,
      functionName: "getEncryptionKey",
      args: [seatIndex],
    }) as `0x${string}`;

    const newKeyHex = "0x" + Array.from(pubKey).map(b => b.toString(16).padStart(2, "0")).join("");
    if (existing && existing !== "0x" && existing.toLowerCase() === newKeyHex.toLowerCase()) {
      return null; // already registered
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.pokerTableAddress,
      abi: ENCRYPTION_ABI,
      functionName: "registerEncryptionKey",
      args: [seatIndex, newKeyHex as `0x${string}`],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, timeout: this.txTimeoutMs });
    return hash;
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
}
