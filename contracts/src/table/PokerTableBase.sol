// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IVRFAdapter.sol";
import "../interfaces/IERC20.sol";
import { SafeTransfer } from "../lib/SafeTransfer.sol";

/**
 * @title PokerTableBase
 * @notice Shared state, types, events, and modifiers for the PokerTable module family.
 * @dev Abstract base for SeatManager, BettingEngine, and SettlementEngine.
 */
abstract contract PokerTableBase {
    using SafeTransfer for address;

    // ============ Constants ============
    /// @dev Maximum array size — arrays are always sized to 9; unused slots are ignored.
    uint8 public constant MAX_SEATS = 9;
    /// @dev Sentinel value for an undealt card slot.
    uint8 public constant UNDEALT = 255;
    /// @dev Standard 52-card deck size.
    uint8 public constant DECK_SIZE = 52;

    // ============ Immutable Seat Config ============
    /// @notice Active seat count for this table (2–MAX_SEATS). Set at deploy.
    uint8 public immutable numSeats;

    // ============ Immutable Timeout Config ============
    /// @notice Per-action deadline (set at deploy). Range: 1 min – 60 min.
    uint256 public immutable ACTION_TIMEOUT;
    /// @notice VRF fulfillment deadline (set at deploy). Range: 30 s – 30 min.
    uint256 public immutable VRF_TIMEOUT;
    /// @notice Showdown reveal deadline (set at deploy). Range: 1 min – 60 min.
    uint256 public immutable SHOWDOWN_TIMEOUT;

    // ============ Enums ============
    enum GameState {
        WAITING_FOR_SEATS,
        HAND_INIT,
        BETTING_PRE,
        WAITING_VRF_FLOP,
        BETTING_FLOP,
        WAITING_VRF_TURN,
        BETTING_TURN,
        WAITING_VRF_RIVER,
        BETTING_RIVER,
        SHOWDOWN,
        SETTLED,
        TOURNAMENT_OVER,
        WAITING_VRF_HOLECARDS,
        WAITING_FOR_HOLECARDS
    }

    enum ActionType {
        FOLD,
        CHECK,
        CALL,
        RAISE
    }

    // ============ Structs ============
    struct Seat {
        address owner;
        address operator;
        uint256 stack;
        bool isActive;
        uint256 currentBet;
        bool isAllIn;
        uint256 totalHandBet;
    }

    struct Hand {
        uint256 handId;
        uint256 pot;
        uint256 currentBet;
        uint256 lastRaiseSize;
        uint8 actorSeat;
        uint8 lastAggressor;
        uint8 actionsInRound;
        uint8 sidePotCount;
        bool[MAX_SEATS] hasActed;
    }

    struct SidePot {
        uint256 amount;
        bool[MAX_SEATS] eligible;
    }

    // ============ Events ============
    event SeatUpdated(uint8 indexed seatIndex, address owner, address operator, uint256 stack);
    event SeatClosed(uint8 indexed seatIndex, address indexed owner, address indexed recipient, uint256 amount);
    event HandStarted(uint256 indexed handId, uint256 smallBlind, uint256 bigBlind, uint8 buttonSeat);
    event ActionTaken(uint256 indexed handId, uint8 indexed seatIndex, ActionType action, uint256 amount, uint256 potAfter);
    event VRFRequested(uint256 indexed handId, GameState street, uint256 requestId);
    event CommunityCardsDealt(uint256 indexed handId, GameState street, uint8[] cards);
    event HandSettled(uint256 indexed handId, uint8 winnerSeat, uint256 potAmount);
    event HoleCommitSubmitted(uint256 indexed handId, uint8 indexed seatIndex, bytes32 commitment);
    event HoleCardsRevealed(uint256 indexed handId, uint8 indexed seatIndex, uint8 card1, uint8 card2);
    event VRFReRequested(uint256 indexed handId, GameState street, uint256 oldRequestId, uint256 newRequestId);
    event TournamentWinner(address indexed winner, uint8 indexed seatIndex, uint256 finalStack);
    event CardIntegrityViolation(uint256 indexed handId, uint8 indexed seatIndex, uint8 card, uint8 communityIndex);
    event HoleCardVRFFulfilled(uint256 indexed handId, bytes32 randomnessHash);
    event HoleCardVRFReRequested(uint256 indexed handId, uint256 oldRequestId, uint256 newRequestId);
    event PreflopStarted(uint256 indexed handId, uint8 actorSeat, uint256 actionDeadline);
    event HandAborted(uint256 indexed handId, string reason);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event DealerUpdated(address indexed oldDealer, address indexed newDealer);
    event TablePaused(address indexed by);
    event TableUnpaused(address indexed by);

    // ============ Custom Errors ============
    error OneActionPerBlock();
    error InvalidGameState();
    error CannotStartHand();
    error VRFTimeoutNotReached();
    error ShowdownRevealWindowOpen();
    error CommitmentAlreadyExists();
    error NotYourTurn();

    // ============ State Variables ============
    uint256 public tableId;
    uint256 public smallBlind;
    uint256 public bigBlind;
    IERC20 public chipToken;

    GameState public gameState;
    uint256 public currentHandId;
    uint8 public buttonSeat;

    Seat[MAX_SEATS] public seats;
    Hand public currentHand;
    SidePot[MAX_SEATS] public sidePots;

    uint256 public actionDeadline;
    uint256 public lastActionBlock;

    address public vrfAdapter;
    uint256 public pendingVRFRequestId;
    uint256 public vrfRequestTimestamp;
    uint256 public showdownStartTimestamp;

    uint8[5] public communityCards;

    mapping(uint256 => mapping(uint8 => bytes32)) public holeCommits;
    mapping(uint256 => mapping(uint8 => uint8[2])) internal _revealedHoleCards;
    mapping(uint256 => mapping(uint8 => bool)) public isHoleCardsRevealed;
    mapping(uint8 => bool) public needsPostBlind;

    // ============ Trustless Dealer State ============
    mapping(uint256 => bytes32) public holeCardVRFRandomnessHash;
    uint256 public pendingHoleCardVRFRequestId;

    uint8 public constant MAX_HOLE_CARD_VRF_RETRIES = 3;
    mapping(uint256 => uint8) public holeCardVRFRetryCount;

    // ============ Hand Settlement Results ============
    /// @notice Winner seat index per settled hand (set at settlement time).
    mapping(uint256 => uint8) public handWinner;
    /// @notice True once a hand has been settled.
    mapping(uint256 => bool) public handSettledFlag;

    address public admin;
    address public dealer;

    // ============ Pause State ============
    bool public paused;

    // ============ Modifiers ============
    function _checkOperator(uint8 seatIndex) internal view {
        require(seatIndex < numSeats, "S1");
        require(msg.sender == seats[seatIndex].operator || msg.sender == seats[seatIndex].owner, "OP");
    }
    modifier onlyOperator(uint8 seatIndex) { _checkOperator(seatIndex); _; }

    function _checkBettingState() internal view {
        require(
            gameState == GameState.BETTING_PRE ||
            gameState == GameState.BETTING_FLOP ||
            gameState == GameState.BETTING_TURN ||
            gameState == GameState.BETTING_RIVER,
            "BS"
        );
    }
    modifier inBettingState() { _checkBettingState(); _; }

    function _checkActorTurn(uint8 seatIndex) internal view {
        if (currentHand.actorSeat != seatIndex) revert NotYourTurn();
    }
    modifier isActorTurn(uint8 seatIndex) { _checkActorTurn(seatIndex); _; }

    function _checkDeadline() internal view {
        require(block.timestamp <= actionDeadline, "DL");
    }
    modifier withinDeadline() { _checkDeadline(); _; }

    function _checkOneActionPerBlock() internal view {
        if (block.number <= lastActionBlock) revert OneActionPerBlock();
    }
    modifier oneActionPerBlock() { _checkOneActionPerBlock(); _; }

    modifier onlyAdmin() { require(msg.sender == admin, "AD"); _; }
    modifier onlyDealer() { require(msg.sender == dealer, "DL2"); _; }
    modifier whenNotPaused() { require(!paused, "PA"); _; }

    // ============ Abstract cross-module declarations ============
    // Declared here so sibling abstract contracts can call each other's implementations.
    function _settleHand(uint8 winnerSeat) internal virtual;
    function _evictBustedSeats() internal virtual;
    function _advanceButton() internal virtual;

    // ============ Constructor ============
    constructor(
        uint256 _tableId,
        uint256 _smallBlind,
        uint256 _bigBlind,
        address _vrfAdapter,
        address _chipToken,
        address _kycSBT,
        uint256 _actionTimeout,
        uint256 _vrfTimeout,
        uint256 _showdownTimeout,
        uint8 _numSeats,
        address _dealer
    ) {
        require(_tableId > 0, "P1");
        require(_smallBlind > 0, "P2");
        require(_bigBlind >= _smallBlind, "P3");
        require(_vrfAdapter != address(0), "P4");
        require(_chipToken != address(0), "P5");
        require(_actionTimeout >= 1 minutes && _actionTimeout <= 60 minutes, "P6");
        require(_vrfTimeout >= 30 seconds && _vrfTimeout <= 30 minutes, "P7");
        require(_showdownTimeout >= 1 minutes && _showdownTimeout <= 60 minutes, "P8");
        require(_numSeats >= 2 && _numSeats <= MAX_SEATS, "P9");
        require(_dealer != address(0), "P10");
        (_kycSBT);
        tableId = _tableId;
        smallBlind = _smallBlind;
        bigBlind = _bigBlind;
        vrfAdapter = _vrfAdapter;
        chipToken = IERC20(_chipToken);
        ACTION_TIMEOUT = _actionTimeout;
        VRF_TIMEOUT = _vrfTimeout;
        SHOWDOWN_TIMEOUT = _showdownTimeout;
        numSeats = _numSeats;
        admin = msg.sender;
        dealer = _dealer;
        gameState = GameState.WAITING_FOR_SEATS;
    }
}
