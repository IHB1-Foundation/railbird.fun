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
}

export class ChainClient {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private account: Account;
  private pokerTableAddress: Address;
  private chain: Chain;

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

  async getTableState(): Promise<TableState> {
    const [
      tableId,
      smallBlind,
      bigBlind,
      actionTimeout,
      maxSeatsRaw,
      gameStateRaw,
      currentHandId,
      buttonSeat,
      actionDeadline,
      lastActionBlock,
      handInfo,
      communityCardsRaw,
    ] = await Promise.all([
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
        functionName: "buttonSeat",
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
      this.publicClient.readContract({
        address: this.pokerTableAddress,
        abi: POKER_TABLE_ABI,
        functionName: "getCommunityCards",
      }),
    ]);

    const parseSeat = (raw: unknown): Seat => {
      const seatData = raw as { owner: Address; operator: Address; stack: bigint; isActive: boolean; currentBet: bigint };
      return {
        owner: seatData.owner,
        operator: seatData.operator,
        stack: seatData.stack,
        isActive: seatData.isActive,
        currentBet: seatData.currentBet,
      };
    };

    const maxSeats = Number(maxSeatsRaw);
    const seatResults = await Promise.all(
      Array.from({ length: maxSeats }, (_, i) =>
        this.publicClient.readContract({
          address: this.pokerTableAddress,
          abi: POKER_TABLE_ABI,
          functionName: "getSeat",
          args: [i],
        })
      )
    );

    return {
      tableId: tableId as bigint,
      smallBlind: smallBlind as bigint,
      bigBlind: bigBlind as bigint,
      actionTimeout: actionTimeout as bigint,
      gameState: (gameStateRaw as number) as GameState,
      currentHandId: currentHandId as bigint,
      buttonSeat: buttonSeat as number,
      actionDeadline: actionDeadline as bigint,
      lastActionBlock: lastActionBlock as bigint,
      seats: seatResults.map(parseSeat),
      hand: {
        handId: (handInfo as readonly [bigint, bigint, bigint, number, number])[0],
        pot: (handInfo as readonly [bigint, bigint, bigint, number, number])[1],
        currentBet: (handInfo as readonly [bigint, bigint, bigint, number, number])[2],
        actorSeat: (handInfo as readonly [bigint, bigint, bigint, number, number])[3],
        state: (handInfo as readonly [bigint, bigint, bigint, number, number])[4] as GameState,
      },
      communityCards: (communityCardsRaw as readonly number[]).map(Number),
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
    await this.publicClient.waitForTransactionReceipt({ hash });
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
    await this.publicClient.waitForTransactionReceipt({ hash });
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
    await this.publicClient.waitForTransactionReceipt({ hash });
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
